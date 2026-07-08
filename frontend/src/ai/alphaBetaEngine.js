// frontend/src/ai/alphaBetaEngine.js
// Purpose: Quantum Chess AI engine. Iterative-deepening negamax over the real
// rules engine (generateLegalReplies, so collapse, conservation, pulses, and
// castling are all "free"), with a compact evaluation built around expected
// material, king-holder distribution, hanging pieces, information, and
// position. Deterministic except for an optional root noise knob (easy mode).
// Imports From: ../chessboard/quantumEngine.js, ../chessboard/boardUtils.js
// Exported To: ./aiWorker.js, ../../../tools/puzzle-miner.mjs

import {
  buildOccupancy,
  clonePieces,
  generateLegalReplies,
  attacksForType,
  canSideCaptureSquare,
} from '../chessboard/quantumEngine.js';
import { fromAlgebraic } from '../chessboard/boardUtils.js';
import { CAPTURE_COLLAPSE_ORDER } from '../chessboard/gameConstants.js';

const MATE = 1000;

// Type values in pawns. King carries no trade value; king danger is scored
// separately via holder distribution and threats.
const VAL = { p: 1, n: 3, b: 3.1, r: 5, q: 9, k: 0 };

// What a piece is worth to whoever captures it: the game collapses a captured
// piece to its least valuable possibility, so that IS the material ledger.
// Fresh superpositions are cheap to lose (a pawn); confirmed queens are not.
function collapseValue(piece) {
  const types = piece.possibleTypes || [];
  const least = CAPTURE_COLLAPSE_ORDER.find((t) => types.includes(t));
  return least ? VAL[least] : 0;
}

// Evaluation weights (pawn units). Bots override subsets of these to give
// each opponent a personality; see ./bots.js.
export const DEFAULT_WEIGHTS = {
  mobility: 0.012, // per attacked square
  extraType: 0.09, // option value per extra possibility on own pieces
  oppDamage: 0.04, // per coherence point knocked off enemy pieces
  kingSpread: 0.28, // per king-holder up to a cap: ambiguity shields the king
  soleKingAttacked: 4.0, // unique king holder standing in capture range
  soleKingCollapsedAttacked: 8.0, // and it is a known king
  hangUndefended: 0.85, // fraction of EV lost when attacked and undefended
  hangBadTrade: 0.5, // fraction of (EV - cheapest attacker) when defended
  center: 0.035, // per step of centrality per piece
  pawnAdvance: 0.05, // per rank of progress for pawn-including pieces
  pawnRace: 0.03, // quadratic kicker so far-advanced pawns become urgent
  development: 0.06, // per piece that has moved at least once
  kingHunt: 0.15, // per attacked square around a unique enemy king holder
};
const KING_SPREAD_CAP = 5;

const DIFFICULTY_CONFIG = {
  easy: { maxDepth: 1, widths: [40], timeMs: 800, noise: 1.2 },
  medium: { maxDepth: 2, widths: [40, 12], timeMs: 5000, noise: 0 },
  hard: { maxDepth: 3, widths: [20, 12, 8], timeMs: 12000, noise: 0 },
};

function otherSide(side) {
  return side === 'white' ? 'black' : 'white';
}

// Per-side attack info: which squares each side attacks, and the cheapest
// piece-value it can bring to bear on each square. Rays respect blockers.
function buildAttackInfo(pieces, occ) {
  const info = {
    white: { squares: new Set(), cheapest: new Map() },
    black: { squares: new Set(), cheapest: new Map() },
  };
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const side = info[p.side];
    for (const t of p.possibleTypes || []) {
      const atk = attacksForType(t, pos.fileIndex, pos.rankIndex, occ, p.side) || [];
      const v = VAL[t] || 0;
      for (const sq of atk) {
        side.squares.add(sq);
        const prev = side.cheapest.get(sq);
        if (prev === undefined || v < prev) side.cheapest.set(sq, v);
      }
    }
  }
  return info;
}

// White-positive static evaluation in pawn units.
export function evaluatePosition(pieces, W = DEFAULT_WEIGHTS) {
  const occ = buildOccupancy(pieces);

  // Kinglessness is a loss; catch it before anything else.
  let whiteHolders = 0;
  let blackHolders = 0;
  let whiteSoleHolder = null;
  let blackSoleHolder = null;
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    if (!(p.possibleTypes || []).includes('k')) continue;
    if (p.side === 'white') {
      whiteHolders += 1;
      whiteSoleHolder = p;
    } else {
      blackHolders += 1;
      blackSoleHolder = p;
    }
  }
  if (whiteHolders === 0) return -MATE;
  if (blackHolders === 0) return MATE;

  const attacks = buildAttackInfo(pieces, occ);

  let score = 0;
  for (const p of pieces) {
    const sign = p.side === 'white' ? 1 : -1;

    // Material follows the game's ledger: it only changes when a piece is
    // captured, at its collapse value. Collapsing on the board is free;
    // ambiguity is priced as option value below.
    if (p.captured) {
      score -= sign * (VAL[(p.possibleTypes || [])[0]] || 0);
      continue;
    }
    if (!p.square) continue;

    const enemy = attacks[otherSide(p.side)];
    const friendly = attacks[p.side];
    const riskValue = collapseValue(p);
    const types = p.possibleTypes || [];
    const pos = fromAlgebraic(p.square);

    // Option value of remaining ambiguity.
    if (types.length > 1) score += sign * W.extraType * (types.length - 1);

    // Decoherence damage already inflicted on this piece favors the opponent.
    if (types.length > 2) {
      const damage = Math.max(0, 3 - (p.coherence ?? 3));
      score -= sign * W.oppDamage * damage;
    }

    // Hanging / bad-trade exposure, in collapse-value terms.
    if (enemy.squares.has(p.square) && riskValue > 0.01) {
      const defended = friendly.cheapest.has(p.square);
      if (!defended) {
        score -= sign * W.hangUndefended * riskValue;
      } else {
        const cheapest = enemy.cheapest.get(p.square) ?? 99;
        if (cheapest < riskValue) score -= sign * W.hangBadTrade * (riskValue - cheapest);
      }
    }

    // Positional shape: centrality, pawn progress, development.
    if (pos) {
      const centrality = 3.5 - Math.max(Math.abs(pos.fileIndex - 3.5), Math.abs(pos.rankIndex - 3.5));
      score += sign * W.center * centrality;
      if (types.includes('p')) {
        const progress = p.side === 'white' ? pos.rankIndex - 1 : 6 - pos.rankIndex;
        if (progress > 0) score += sign * (W.pawnAdvance * progress + W.pawnRace * progress * progress);
      }
    }
    if ((p.moveCount || 0) > 0) score += sign * W.development;
  }

  // Mobility via attacked-square counts.
  score += W.mobility * (attacks.white.squares.size - attacks.black.squares.size);

  // King distribution: many possible kings = a hidden king.
  score += W.kingSpread * (Math.min(whiteHolders, KING_SPREAD_CAP) - Math.min(blackHolders, KING_SPREAD_CAP));

  // A unique king holder under fire is close to losing, and pressure on the
  // squares around it drives mating attacks in classical endgames.
  const huntPressure = (holderSquare, attackerInfo) => {
    const pos = fromAlgebraic(holderSquare);
    if (!pos) return 0;
    let count = 0;
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const f = pos.fileIndex + df;
        const r = pos.rankIndex + dr;
        if (f < 0 || f > 7 || r < 0 || r > 7) continue;
        const sq = `${'abcdefgh'[f]}${'12345678'[r]}`;
        if (attackerInfo.squares.has(sq)) count += 1;
      }
    }
    return count;
  };

  if (whiteHolders === 1) {
    if (attacks.black.squares.has(whiteSoleHolder.square)) {
      const collapsed = (whiteSoleHolder.possibleTypes || []).length === 1;
      score -= collapsed ? W.soleKingCollapsedAttacked : W.soleKingAttacked;
    }
    score -= W.kingHunt * huntPressure(whiteSoleHolder.square, attacks.black);
  }
  if (blackHolders === 1) {
    if (attacks.white.squares.has(blackSoleHolder.square)) {
      const collapsed = (blackSoleHolder.possibleTypes || []).length === 1;
      score += collapsed ? W.soleKingCollapsedAttacked : W.soleKingAttacked;
    }
    score += W.kingHunt * huntPressure(blackSoleHolder.square, attacks.white);
  }

  return score;
}

class SearchTimeout extends Error {}

// Score a no-legal-replies node from `side`'s perspective, mirroring the
// game's terminal rules: checkmate if lost-in-check, else stalemate (draw).
function noReplyScore(pieces, side, ply) {
  const opp = otherSide(side);
  const holders = pieces.filter((p) => !p.captured && p.side === side && p.square && (p.possibleTypes || []).includes('k'));
  if (holders.length === 0) return -MATE + ply;
  if (holders.length === 1 && canSideCaptureSquare(pieces, opp, holders[0].square)) return -MATE + ply;
  return 0;
}

function sideSign(side) {
  return side === 'white' ? 1 : -1;
}

// Generate replies and order them best-first for `side` using the child
// evaluations (the simulate results are already computed by the engine).
function orderedChildren(pieces, side, ctx, lastMove = null) {
  const replies = generateLegalReplies(pieces, side, 0, lastMove);
  const sign = sideSign(side);
  const scored = replies.map((mv) => ({ mv, score: sign * evaluatePosition(mv.resultPieces, ctx.W) }));
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function negamax(pieces, side, depth, ply, alpha, beta, ctx) {
  ctx.nodes += 1;
  if ((ctx.nodes & 15) === 0 && performance.now() > ctx.deadline) throw new SearchTimeout();

  if (depth <= 0) return sideSign(side) * evaluatePosition(pieces, ctx.W);

  const children = orderedChildren(pieces, side, ctx);
  if (children.length === 0) return noReplyScore(pieces, side, ply);

  const width = ctx.widths[Math.min(ply, ctx.widths.length - 1)] || 8;
  const limit = Math.min(children.length, width);

  let best = -Infinity;
  for (let i = 0; i < limit; i++) {
    const child = children[i].mv;
    // Immediate decisive results shortcut deeper search.
    if (Math.abs(children[i].score) >= MATE - 100) {
      const s = children[i].score >= MATE - 100 ? MATE - ply : -MATE + ply;
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
      continue;
    }
    const s = -negamax(child.resultPieces, otherSide(side), depth - 1, ply + 1, -beta, -alpha, ctx);
    if (s > best) best = s;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Score EVERY legal root move at a fixed depth with a full alpha-beta window
// per move, so the returned scores are comparable — the gap between best and
// second-best is meaningful. Used by the puzzle miner (only-move detection)
// and by eval-bar scoring; not on the play path.
// Returns { moves: [{ move, score }...] sorted best-first, nodes, depth },
// scores from the mover's perspective, or null if timeMs ran out mid-search.
export function analyzeRootMoves({ pieces, sideToMove, lastMove = null, depth = 3, widths = [24, 12, 8, 6], weights = null, timeMs = Infinity }) {
  const W = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const root = clonePieces(pieces);
  const deadline = Number.isFinite(timeMs) ? performance.now() + timeMs : Infinity;
  const ctx = { deadline, nodes: 0, widths, W };

  const children = orderedChildren(root, sideToMove, ctx, lastMove);
  const scored = [];
  try {
    for (const child of children) {
      let s;
      if (depth <= 1 || Math.abs(child.score) >= MATE - 100) {
        s = child.score;
      } else {
        s = -negamax(child.mv.resultPieces, otherSide(sideToMove), depth - 1, 1, -Infinity, Infinity, ctx);
      }
      scored.push({ move: child.mv, score: s });
    }
  } catch (err) {
    if (err instanceof SearchTimeout) return null;
    throw err;
  }
  scored.sort((a, b) => b.score - a.score);
  return { moves: scored, nodes: ctx.nodes, depth };
}

// Iterative-deepening search. Returns { move, score, depth, nodes } where
// score is from the mover's perspective. onDepthComplete (optional) receives
// the best move after each completed depth for progressive reporting.
export function searchBestMove({ pieces, sideToMove, difficulty = 'medium', bot = null, lastMove = null, onDepthComplete = null }) {
  const base = DIFFICULTY_CONFIG[(bot && bot.tier) || difficulty] || DIFFICULTY_CONFIG.medium;
  const cfg = { ...base, ...((bot && bot.search) || {}) };
  const W = { ...DEFAULT_WEIGHTS, ...((bot && bot.weights) || {}) };
  const root = clonePieces(pieces);

  // Opening variety: a bot's first TWO moves of the game are uniformly
  // random quiet moves (never a capture), at every difficulty — restricted
  // to its own half of the board so it never collapses a piece deep into
  // enemy territory and hangs it early. Exception: the moment any capture
  // has happened, drop the script and search for real — the bot is allowed
  // to take back (and to punish).
  const sideMoveCount = root.reduce((n, p) => (p.side === sideToMove ? n + (p.moveCount || 0) : n), 0);
  const anyCaptures = root.some((p) => p.captured);
  if (sideMoveCount < 2 && !anyCaptures) {
    const replies = generateLegalReplies(root, sideToMove, 0, lastMove);
    const occupied = new Set(root.filter((p) => !p.captured && p.square).map((p) => p.square));
    const quiet = replies.filter((mv) => {
      if (mv.type !== 'move' || occupied.has(mv.to)) return false;
      const rank = parseInt(mv.to.slice(1), 10);
      return sideToMove === 'white' ? rank <= 4 : rank >= 5;
    });
    if (quiet.length > 0) {
      const pick = quiet[Math.floor(Math.random() * quiet.length)];
      return { move: pick, score: 0, depth: 0, nodes: 0 };
    }
  }

  const deadline = performance.now() + cfg.timeMs;
  const ctx = { deadline, nodes: 0, widths: cfg.widths, W };

  // As the board classicalizes, positions get cheaper to simulate and the
  // branching shrinks — spend the same time budget on more depth. Iterative
  // deepening plus the deadline make an optimistic cap safe.
  let maxDepth = cfg.maxDepth;
  if (difficulty !== 'easy') {
    const alive = root.filter((p) => !p.captured && p.square).length;
    let extraTypes = 0;
    for (const p of root) {
      if (!p.captured && p.square) extraTypes += Math.max(0, (p.possibleTypes || []).length - 1);
    }
    if (alive <= 10 || extraTypes <= 4) maxDepth = cfg.maxDepth + 3;
    else if (alive <= 14 || extraTypes <= 10) maxDepth = cfg.maxDepth + 2;
    else if (extraTypes <= 24) maxDepth = cfg.maxDepth + 1;
  }

  const rootChildren = orderedChildren(root, sideToMove, ctx, lastMove);
  if (rootChildren.length === 0) return { move: null, score: 0, depth: 0, nodes: ctx.nodes };

  // Depth-1 result is always available instantly.
  let best = { move: rootChildren[0].mv, score: rootChildren[0].score, depth: 1, nodes: ctx.nodes };
  if (typeof onDepthComplete === 'function') onDepthComplete(best);

  const rootWidth = Math.min(rootChildren.length, ctx.widths[0] || rootChildren.length);

  for (let depth = 2; depth <= maxDepth; depth++) {
    try {
      let alpha = -Infinity;
      let depthBest = null;
      for (let i = 0; i < rootWidth; i++) {
        const child = rootChildren[i];
        let s;
        if (Math.abs(child.score) >= MATE - 100) {
          s = child.score;
        } else {
          s = -negamax(child.mv.resultPieces, otherSide(sideToMove), depth - 1, 1, -Infinity, -alpha, ctx);
        }
        if (!depthBest || s > depthBest.score) depthBest = { move: child.mv, score: s };
        if (s > alpha) alpha = s;
      }
      if (depthBest) {
        best = { move: depthBest.move, score: depthBest.score, depth, nodes: ctx.nodes };
        if (typeof onDepthComplete === 'function') onDepthComplete(best);
      }
    } catch (err) {
      if (err instanceof SearchTimeout) break;
      throw err;
    }
    if (performance.now() > deadline) break;
  }

  // Easy mode: blur the top of the root ordering so play is beatable.
  if (cfg.noise > 0 && rootChildren.length > 1) {
    const jittered = rootChildren
      .slice(0, Math.min(6, rootChildren.length))
      .map((c) => ({ mv: c.mv, s: c.score + (Math.random() - 0.5) * 2 * cfg.noise }))
      .sort((a, b) => b.s - a.s);
    return { ...best, move: jittered[0].mv };
  }

  return best;
}
