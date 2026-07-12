// frontend/src/ai/fast/fastSearch.js
// Purpose: The search on the packed board — drop-in ports of searchBestMove
// and analyzeRootMoves with identical control flow, node counting, windows,
// orderings and tie-breaks (marked REF: against alphaBetaEngine.js). The one
// structural change: positions are TRANSIENT. Children are visited via
// make → evaluate → rollback during ordering, and re-made on demand when the
// search descends; the journal watermark discipline replaces the reference's
// retained resultPieces arrays. Results are materialized back to
// reference-shaped move objects (with resultPieces) only at the API boundary.
// Imports From: ./fastBoard.js, ./fastRules.js, ./fastEval.js,
//   ../alphaBetaEngine.js (weights/config constants only)
// Exported To: ../aiWorker.js, ../../../tests/fastEngineDiff.test.js

import {
  BLACK, ALGEBRAIC, parseSquare,
  packBoard, unpackBoard, rollback, watermark, positionSignature,
  snapshotWords, wordsEqual,
} from './fastBoard.js';
import {
  forEachLegalReply, makeStandardMove, makeEnPassant, makeCastle, lostInCheck,
} from './fastRules.js';
import { evaluateFast, MATE } from './fastEval.js';
import { DEFAULT_WEIGHTS, DIFFICULTY_CONFIG } from '../alphaBetaEngine.js';

class SearchTimeout extends Error {}

const sideBitOf = (s) => (s === 'black' ? BLACK : 0);
const sideName = (b) => (b === BLACK ? 'black' : 'white');
const otherB = (b) => b ^ BLACK;
const signOf = (b) => (b === BLACK ? -1 : 1);

// Convert a reference lastMove record into the packed en passant window.
export function epFromLastMove(bd, lastMove) {
  if (!lastMove || !lastMove.isDoubleStep) return null;
  const victimIdx = bd.ids.indexOf(lastMove.pieceId);
  if (victimIdx < 0) return null;
  return {
    victimIdx,
    to: parseSquare(lastMove.to),
    crossed: parseSquare(lastMove.crossedSquare),
    side: sideBitOf(lastMove.side),
  };
}

// Re-apply a generated move descriptor. Deterministic, so the result is
// bit-identical to the make that produced the descriptor.
function remake(bd, desc) {
  if (desc.kind === 'move') return makeStandardMove(bd, desc.pieceIdx, desc.to);
  if (desc.kind === 'enpassant') return makeEnPassant(bd, desc.pieceIdx, desc.to, desc.victimIdx);
  return makeCastle(bd, desc.plan);
}

// REF: orderedChildren — generate, score each child with the full eval from
// the mover's perspective, stable-sort best-first. `withSigs` additionally
// captures each child's position signature (root repetition penalty).
function orderedChildrenFast(bd, side, ctx, ep, withSigs) {
  const sign = signOf(side);
  const out = [];
  forEachLegalReply(bd, side, ep, (desc) => {
    const entry = { desc, score: sign * evaluateFast(bd, ctx.W) };
    if (withSigs) entry.sig = positionSignature(bd, sideName(otherB(side)), null);
    out.push(entry);
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}

// REF: negamax — identical node counting, deadline cadence, width beam,
// mate shortcut and window handling.
function negamaxFast(bd, side, depth, ply, alpha, beta, ctx) {
  ctx.nodes += 1;
  if ((ctx.nodes & 15) === 0 && performance.now() > ctx.deadline) throw new SearchTimeout();

  if (depth <= 0) return signOf(side) * evaluateFast(bd, ctx.W);

  const children = orderedChildrenFast(bd, side, ctx, null, false);
  if (children.length === 0) return lostInCheck(bd, side) ? -MATE + ply : 0;

  const width = ctx.widths[Math.min(ply, ctx.widths.length - 1)] || 8;
  const limit = Math.min(children.length, width);

  let best = -Infinity;
  for (let i = 0; i < limit; i++) {
    if (Math.abs(children[i].score) >= MATE - 100) {
      const s = children[i].score >= MATE - 100 ? MATE - ply : -MATE + ply;
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
      continue;
    }
    const mark = watermark(bd);
    remake(bd, children[i].desc);
    let s;
    try {
      s = -negamaxFast(bd, otherB(side), depth - 1, ply + 1, -beta, -alpha, ctx);
    } finally {
      rollback(bd, mark);
    }
    if (s > best) best = s;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Materialize a root child back into a reference-shaped move object,
// resultPieces included. Board must be AT THE ROOT; re-makes, unpacks, rolls
// back.
function materializeMove(bd, desc) {
  const mark = watermark(bd);
  remake(bd, desc);
  const moveBumps = new Map();
  moveBumps.set(desc.pieceIdx, 1);
  if (desc.kind === 'castle') moveBumps.set(desc.plan.i2, 1);
  const captureIndexFor = new Map();
  if (desc.victimIdx >= 0) captureIndexFor.set(desc.victimIdx, 0);
  const resultPieces = unpackBoard(bd, { moveBumps, captureIndexFor });
  rollback(bd, mark);

  if (desc.kind === 'castle') {
    return {
      type: 'castle',
      plan: {
        piece1_id: bd.ids[desc.plan.i1],
        piece2_id: bd.ids[desc.plan.i2],
        piece1_from: ALGEBRAIC[desc.plan.from1],
        piece2_from: ALGEBRAIC[desc.plan.from2],
        piece1_to: ALGEBRAIC[desc.plan.to1],
        piece2_to: ALGEBRAIC[desc.plan.to2],
      },
      resultPieces,
    };
  }
  if (desc.kind === 'enpassant') {
    return { type: 'enpassant', from: ALGEBRAIC[desc.from], to: ALGEBRAIC[desc.to], victimId: bd.ids[desc.victimIdx], resultPieces };
  }
  return { type: 'move', from: ALGEBRAIC[desc.from], to: ALGEBRAIC[desc.to], resultPieces };
}

// REF: analyzeRootMoves — full window per root move, comparable scores.
export function analyzeRootMovesFast({ pieces, sideToMove, lastMove = null, depth = 3, widths = [24, 12, 8, 6], weights = null, timeMs = Infinity }) {
  const W = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const bd = packBoard(pieces);
  const rootWords = bd.debug ? snapshotWords(bd) : null;
  const deadline = Number.isFinite(timeMs) ? performance.now() + timeMs : Infinity;
  const ctx = { deadline, nodes: 0, widths, W };
  const side = sideBitOf(sideToMove);

  const children = orderedChildrenFast(bd, side, ctx, epFromLastMove(bd, lastMove), false);
  const scored = [];
  try {
    for (const child of children) {
      let s;
      if (depth <= 1 || Math.abs(child.score) >= MATE - 100) {
        s = child.score;
      } else {
        const mark = watermark(bd);
        remake(bd, child.desc);
        try {
          s = -negamaxFast(bd, otherB(side), depth - 1, 1, -Infinity, Infinity, ctx);
        } finally {
          rollback(bd, mark);
        }
      }
      scored.push({ child, score: s });
    }
  } catch (err) {
    if (err instanceof SearchTimeout) return null;
    throw err;
  }
  scored.sort((a, b) => b.score - a.score);
  const moves = scored.map((s) => ({ move: materializeMove(bd, s.child.desc), score: s.score }));
  if (rootWords && !wordsEqual(bd.words, rootWords)) throw new Error('fast engine: root state corrupted');
  return { moves, nodes: ctx.nodes, depth };
}

// REF: searchBestMove — iterative deepening over a beamed root.
export function searchBestMoveFast({
  pieces,
  sideToMove,
  difficulty = 'medium',
  bot = null,
  lastMove = null,
  onDepthComplete = null,
  repetitionSigs = null,
  openingVariety = true,
  adaptiveDepth = true,
}) {
  const base = DIFFICULTY_CONFIG[(bot && bot.tier) || difficulty] || DIFFICULTY_CONFIG.medium;
  const cfg = { ...base, ...((bot && bot.search) || {}) };
  const W = { ...DEFAULT_WEIGHTS, ...((bot && bot.weights) || {}) };
  const bd = packBoard(pieces);
  const rootWords = bd.debug ? snapshotWords(bd) : null;
  const side = sideBitOf(sideToMove);
  const ep = epFromLastMove(bd, lastMove);

  // REF: opening variety — first two side moves, no captures yet, uniformly
  // random quiet move into the own half.
  const sideMoveCount = pieces.reduce((n, p) => (p.side === sideToMove ? n + (p.moveCount || 0) : n), 0);
  const anyCaptures = pieces.some((p) => p.captured);
  if (openingVariety && sideMoveCount < 2 && !anyCaptures) {
    const quiet = [];
    forEachLegalReply(bd, side, ep, (desc) => {
      if (desc.kind !== 'move' || desc.victimIdx >= 0) return;
      // REF: unoccupied destination, own half of the board.
      const toRank = desc.to >> 3;
      if (side === BLACK ? toRank >= 4 : toRank <= 3) quiet.push(desc);
    });
    // A quiet non-capture destination was empty pre-move by construction
    // (victimIdx < 0 and friendly squares are never destinations).
    if (quiet.length > 0) {
      const pick = quiet[Math.floor(Math.random() * quiet.length)];
      return { move: materializeMove(bd, pick), score: 0, depth: 0, nodes: 0 };
    }
  }

  const deadline = performance.now() + cfg.timeMs;
  const ctx = { deadline, nodes: 0, widths: cfg.widths, W };

  // REF: adaptive depth by classicalization.
  let maxDepth = cfg.maxDepth;
  if (adaptiveDepth && difficulty !== 'easy') {
    const alive = pieces.filter((p) => !p.captured && p.square).length;
    let extraTypes = 0;
    for (const p of pieces) {
      if (!p.captured && p.square) extraTypes += Math.max(0, (p.possibleTypes || []).length - 1);
    }
    if (alive <= 10 || extraTypes <= 4) maxDepth = cfg.maxDepth + 3;
    else if (alive <= 14 || extraTypes <= 10) maxDepth = cfg.maxDepth + 2;
    else if (extraTypes <= 24) maxDepth = cfg.maxDepth + 1;
  }

  const rootChildren = orderedChildrenFast(bd, side, ctx, ep, Boolean(repetitionSigs));
  if (rootChildren.length === 0) return { move: null, score: 0, depth: 0, nodes: ctx.nodes };

  // REF: repetition penalty for the winning side.
  const repCount = (sig) => {
    if (!repetitionSigs) return 0;
    const n = repetitionSigs instanceof Map ? repetitionSigs.get(sig) : repetitionSigs[sig];
    return n || 0;
  };
  const repWinning = Boolean(repetitionSigs) && rootChildren[0].score >= 1;
  const repPen = rootChildren.map((c) => {
    if (!repWinning) return 0;
    const n = repCount(c.sig);
    return n >= 2 ? 50 : n === 1 ? 3 : 0;
  });

  // REF: depth-1 baseline.
  let initIdx = 0;
  for (let i = 1; i < rootChildren.length; i++) {
    if (rootChildren[i].score - repPen[i] > rootChildren[initIdx].score - repPen[initIdx]) initIdx = i;
  }
  let best = { desc: rootChildren[initIdx].desc, score: rootChildren[initIdx].score, depth: 1, nodes: ctx.nodes };
  const report = (b) => {
    if (typeof onDepthComplete === 'function') {
      onDepthComplete({ move: materializeMove(bd, b.desc), score: b.score, depth: b.depth, nodes: b.nodes });
    }
  };
  report(best);

  const rootWidth = Math.min(rootChildren.length, ctx.widths[0] || rootChildren.length);
  const rootMark = watermark(bd);

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
          const mark = watermark(bd);
          remake(bd, child.desc);
          try {
            s = -negamaxFast(bd, otherB(side), depth - 1, 1, -Infinity, -alpha, ctx);
          } finally {
            rollback(bd, mark);
          }
        }
        const adjusted = s - repPen[i];
        if (!depthBest || adjusted > depthBest.adjusted) depthBest = { desc: child.desc, score: s, adjusted };
        if (s > alpha) alpha = s;
      }
      if (depthBest) {
        best = { desc: depthBest.desc, score: depthBest.score, depth, nodes: ctx.nodes };
        report(best);
      }
    } catch (err) {
      if (err instanceof SearchTimeout) {
        rollback(bd, rootMark);
        break;
      }
      throw err;
    }
    if (performance.now() > deadline) break;
  }

  // REF: easy-mode noise jitters the top of the root ordering.
  let chosenDesc = best.desc;
  if (cfg.noise > 0 && rootChildren.length > 1) {
    const jittered = rootChildren
      .slice(0, Math.min(6, rootChildren.length))
      .map((c, i) => ({ desc: c.desc, s: c.score - repPen[i] + (Math.random() - 0.5) * 2 * cfg.noise }))
      .sort((a, b) => b.s - a.s);
    chosenDesc = jittered[0].desc;
  }

  const move = materializeMove(bd, chosenDesc);
  if (rootWords && !wordsEqual(bd.words, rootWords)) throw new Error('fast engine: root state corrupted');
  return { move, score: best.score, depth: best.depth, nodes: ctx.nodes };
}
