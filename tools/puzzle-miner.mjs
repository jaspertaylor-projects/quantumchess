// tools/puzzle-miner.mjs
// Purpose: Mine daily-puzzle candidates from bot self-play instead of
// composing them. Pipeline: (1) simulate full games between roster-flavored
// bots, (2) scan every White-to-move position for ONLY MOVES — exactly one
// move holds/wins the eval while every alternative fails — and chain
// consecutive only-moves into sequences, (3) tag each candidate with the
// quantum themes the composed generator used as goals (measure3, census,
// seal, snap, unmask, phantom ep-check, mate) plus a trickiness score,
// (4) GATE: re-search each mined only-move at a higher depth and report the
// agreement rate. High agreement (95%+) is the go signal for feeding mined
// puzzles into the daily rotation; low agreement means the eval/search needs
// strengthening first.
//
// Run INSIDE Docker (see README):
//   docker compose run --rm --no-deps -v "$PWD":/repo -w /repo frontend \
//     node tools/puzzle-miner.mjs --games 8 --seed 1
// Quick smoke: node tools/puzzle-miner.mjs --quick
//
// Output: tools/mined/mined-seed<seed>.json (positions are full serialized
// game states — pieces array + lastMove + captureCounter — so they replay on
// the real engine with conservation behaving exactly as in a live game).
// Imports From: ../frontend/src/chessboard/*, ../frontend/src/ai/*
// Exported To: none (CLI)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStartingPieces } from '../frontend/src/chessboard/gameConstants.js';
import {
  applyQuantumConstraints,
  canPieceRecohere,
  clonePieces,
  computePositionSignature,
  evaluateTerminalAfterMove,
  generateLegalReplies,
  listCheckThreats,
  simulateCastle,
  simulateEnPassant,
  simulateStandardMove,
} from '../frontend/src/chessboard/quantumEngine.js';
import { fromAlgebraic, toAlgebraic } from '../frontend/src/chessboard/boardUtils.js';
import { analyzeRootMoves, evaluatePosition, searchBestMove } from '../frontend/src/ai/alphaBetaEngine.js';
import { BOTS } from '../frontend/src/ai/bots.js';

// ------------------------------------------------------------------- config

const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return def;
  return args[i + 1];
}
const QUICK = args.includes('--quick');

const CFG = {
  games: Number(argVal('games', QUICK ? 2 : 8)),
  seed: Number(argVal('seed', 1)),
  maxPlies: Number(argVal('maxPlies', QUICK ? 70 : 160)),
  playMs: Number(argVal('playMs', QUICK ? 250 : 600)), // per-move time for game simulation
  minPly: Number(argVal('minPly', 6)), // skip the noisy opening plies
  mineDepth: Number(argVal('mineDepth', 3)),
  prefilterMs: Number(argVal('prefilterMs', 4000)), // depth-(mineDepth-1) funnel budget
  mineMs: Number(argVal('mineMs', QUICK ? 10000 : 20000)), // deep budget, only for funnel survivors
  verifyDepth: Number(argVal('verifyDepth', 5)),
  verifyMs: Number(argVal('verifyMs', QUICK ? 45000 : 120000)),
  verifyCap: Number(argVal('verifyCap', 120)), // max only-move plies to re-verify
  minChoices: Number(argVal('minChoices', 6)), // fewer legal moves = not a real search
  maxChain: Number(argVal('maxChain', 6)), // rollout-extension cap per chain
  holdEval: Number(argVal('holdEval', -0.5)), // best move must score at least this
  failEval: Number(argVal('failEval', -1.0)), // every alternative must score at most this (the gap does the anti-noise work)
  minGap: Number(argVal('minGap', 2.0)), // and trail the best by at least this
  outDir: argVal('out', path.join(path.dirname(fileURLToPath(import.meta.url)), 'mined')),
};

const PREFILTER_WIDTHS = [64, 10, 8]; // narrow: 24% of positions timed out at [64,14,10]
const MINE_WIDTHS = [64, 14, 10, 8, 6];
const VERIFY_WIDTHS = [64, 16, 12, 10, 8, 6];

// ------------------------------------------------- determinism (seeded rng)

// searchBestMove uses Math.random for opening variety; patch it so a run is
// fully reproducible from --seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(CFG.seed * 2654435761);
Math.random = rng;

// -------------------------------------------------------------- game loop

function otherSide(side) { return side === 'white' ? 'black' : 'white'; }

function countPossibilities(pieces) {
  let sum = 0;
  for (const p of pieces) sum += (p.possibleTypes || []).length;
  return sum;
}

function buildLastMove(afterPieces, moverId, from, to, enPassant, measuredSquares, side, wasFirstMove) {
  const lastMove = {
    side, pieceId: moverId, from, to,
    isDoubleStep: false, crossedSquare: null,
    measuredSquares: measuredSquares || [],
  };
  if (!enPassant && wasFirstMove) {
    const fp = fromAlgebraic(from);
    const tp = fromAlgebraic(to);
    const dir = side === 'white' ? 1 : -1;
    const moved = afterPieces.find((p) => p.id === moverId && !p.captured);
    if (fp && tp && moved && fp.fileIndex === tp.fileIndex && tp.rankIndex - fp.rankIndex === 2 * dir && moved.possibleTypes.includes('p')) {
      lastMove.isDoubleStep = true;
      lastMove.crossedSquare = toAlgebraic(fp.fileIndex, fp.rankIndex + dir);
    }
  }
  return lastMove;
}

// Re-simulate a reply from generateLegalReplies so we recover didCapture and
// measuredSquares (the reply list drops them), and build the next state the
// same way useQuantumGameState.movePiece/castlePieces do.
function applyReply(state, reply) {
  const { pieces, sideToMove, captureCounter, halfmoveClock } = state;

  let sim;
  let moverId;
  let from;
  let to;
  let wasFirstMove = false;
  if (reply.type === 'castle') {
    sim = simulateCastle(pieces, reply.plan);
    if (!sim.ok) return null;
    moverId = reply.plan.piece1_id;
    from = reply.plan.piece1_from;
    to = reply.plan.piece1_to;
  } else {
    const mover = pieces.find((p) => !p.captured && p.side === sideToMove && p.square === reply.from);
    if (!mover) return null;
    moverId = mover.id;
    from = reply.from;
    to = reply.to;
    wasFirstMove = (mover.moveCount || 0) === 0;
    sim = reply.type === 'enpassant'
      ? simulateEnPassant(pieces, mover.id, reply.to, reply.victimId, captureCounter)
      : simulateStandardMove(pieces, mover.id, reply.to, captureCounter);
    if (!sim.ok) return null;
  }

  const finalPieces = reply.type === 'castle' ? applyQuantumConstraints(sim.pieces) : sim.pieces;
  const didCapture = Boolean(sim.didCapture);
  const nextCC = didCapture ? captureCounter + 1 : captureCounter;
  const nextLastMove = buildLastMove(finalPieces, moverId, from, to, reply.type === 'enpassant', sim.measuredSquares, sideToMove, wasFirstMove);

  const movedFinal = finalPieces.find((p) => p.id === moverId && !p.captured) || null;
  const definitePawnMove = Boolean(movedFinal && movedFinal.possibleTypes.length === 1 && movedFinal.possibleTypes[0] === 'p');
  const promotedNow = Boolean(movedFinal && movedFinal.wasPromoted && !pieces.find((p) => p.id === moverId)?.wasPromoted);
  const informationGained = countPossibilities(finalPieces) < countPossibilities(pieces);
  const progress = didCapture || definitePawnMove || promotedNow || informationGained;
  const nextHalfmove = progress ? 0 : halfmoveClock + 1;

  const terminal = evaluateTerminalAfterMove(finalPieces, sideToMove, nextCC, nextLastMove);
  let gameOver = false;
  let winner = null;
  let reason = null;
  if (terminal === 'checkmate') { gameOver = true; winner = sideToMove; reason = 'checkmate'; }
  else if (terminal === 'stalemate') { gameOver = true; reason = 'stalemate'; }
  else if (nextHalfmove >= 100) { gameOver = true; reason = 'fifty-move rule'; }

  return {
    state: {
      pieces: finalPieces,
      sideToMove: otherSide(sideToMove),
      captureCounter: nextCC,
      lastMove: nextLastMove,
      halfmoveClock: nextHalfmove,
    },
    moveRec: { type: reply.type, from, to, didCapture, measuredSquares: sim.measuredSquares || [] },
    gameOver, winner, reason,
  };
}

// A miner bot: the roster bot as-is — tier, personality weights AND its
// blunder noise — with only the think time capped so a game takes seconds.
// Skill diversity is deliberate: weaker play creates the imbalanced
// positions tactics live in (lichess mines amateur games for this reason),
// and the deep-verification gate keeps quality independent of how a
// position arose. Noise draws from the seeded rng, so runs stay
// reproducible.
function minerBot(rosterBot) {
  return {
    id: rosterBot.id,
    tier: rosterBot.tier,
    weights: rosterBot.weights || {},
    search: { ...(rosterBot.search || {}), timeMs: CFG.playMs },
  };
}

function playGame(gameIdx, botW, botB) {
  let state = {
    pieces: createStartingPieces(),
    sideToMove: 'white',
    captureCounter: 0,
    lastMove: null,
    halfmoveClock: 0,
  };
  const sigCounts = new Map();
  sigCounts.set(computePositionSignature(state.pieces, 'white', null), 1);

  const record = []; // one entry per ply: position before the move + the move
  let result = { winner: null, reason: 'move cap' };

  for (let ply = 0; ply < CFG.maxPlies; ply++) {
    const bot = state.sideToMove === 'white' ? botW : botB;
    const res = searchBestMove({
      pieces: state.pieces,
      sideToMove: state.sideToMove,
      bot,
      lastMove: state.lastMove,
    });
    if (!res.move) { result = { winner: null, reason: 'no legal move' }; break; }

    const before = {
      ply,
      sideToMove: state.sideToMove,
      pieces: clonePieces(state.pieces),
      captureCounter: state.captureCounter,
      lastMove: state.lastMove ? { ...state.lastMove } : null,
    };
    const applied = applyReply(state, res.move);
    if (!applied) { result = { winner: null, reason: 'apply failed (bug!)' }; break; }

    record.push({ ...before, played: applied.moveRec });
    state = applied.state;

    if (applied.gameOver) { result = { winner: applied.winner, reason: applied.reason }; break; }

    const sig = computePositionSignature(state.pieces, state.sideToMove, state.lastMove);
    const n = (sigCounts.get(sig) || 0) + 1;
    sigCounts.set(sig, n);
    if (n >= 3) { result = { winner: null, reason: 'threefold repetition' }; break; }
  }

  return { gameIdx, white: botW.id, black: botB.id, record, result, plies: record.length };
}

// ------------------------------------------------------------ theme tagging

// Re-simulate an analysis move to recover measuredSquares + resolved pieces.
function simulateAnalysisMove(position, move) {
  const { pieces, captureCounter } = position;
  if (move.type === 'castle') {
    const sim = simulateCastle(pieces, move.plan);
    if (!sim.ok) return null;
    return {
      after: applyQuantumConstraints(sim.pieces),
      measuredSquares: sim.measuredSquares || [],
      didCapture: false,
      moverId: move.plan.piece1_id,
      from: move.plan.piece1_from,
      to: move.plan.piece1_to,
      enPassant: false,
      nextCC: captureCounter,
    };
  }
  const mover = pieces.find((p) => !p.captured && p.side === 'white' && p.square === move.from);
  if (!mover) return null;
  const sim = move.type === 'enpassant'
    ? simulateEnPassant(pieces, mover.id, move.to, move.victimId, captureCounter)
    : simulateStandardMove(pieces, mover.id, move.to, captureCounter);
  if (!sim.ok) return null;
  return {
    after: sim.pieces,
    measuredSquares: sim.measuredSquares || [],
    didCapture: Boolean(sim.didCapture),
    moverId: mover.id,
    from: move.from,
    to: move.to,
    enPassant: move.type === 'enpassant',
    nextCC: captureCounter + (sim.didCapture ? 1 : 0),
  };
}

// The composed generator's SUBGOALS, recast as detectors over a mined move:
// instead of demanding a goal, we report which quantum phenomena the move
// exhibits. Names match the daily-puzzle themes for continuity.
function tagThemes(position, moveSim) {
  const before = position.pieces;
  const { after, measuredSquares } = moveSim;
  const themes = [];

  if (measuredSquares.length >= 3) themes.push('measure3'); // The Instrument

  const touched = new Set([moveSim.to, moveSim.from, ...measuredSquares]);
  for (const prev of before) {
    if (prev.captured || !prev.square || prev.side !== 'black') continue;
    const now = after.find((p) => p.id === prev.id);
    if (!now || now.captured) continue;
    if (prev.possibleTypes.length > 1 && now.possibleTypes.length === 1 && !touched.has(prev.square)) {
      themes.push('censusCollapse'); // The Census: collapsed without being touched
      break;
    }
  }

  for (const prev of before) {
    if (prev.captured || !prev.square) continue;
    const now = after.find((p) => p.id === prev.id);
    if (!now || now.captured || now.possibleTypes.length > 2) continue;
    if (prev.possibleTypes.length > 1 && canPieceRecohere(before, prev.id) && !canPieceRecohere(after, prev.id)) {
      themes.push('seal'); // The Seal
      break;
    }
  }

  for (const prev of before) {
    if (!prev.entangledWith) continue;
    const a = after.find((p) => p.id === prev.id);
    const b = after.find((p) => p.id === prev.entangledWith);
    if (!a || !b) continue;
    const capturedOne = (a.captured ? 1 : 0) + (b.captured ? 1 : 0) === 1;
    if (capturedOne && a.possibleTypes.length === 1 && b.possibleTypes.length === 1) {
      themes.push('snap'); // The Snap
      break;
    }
  }

  const holdersBefore = before.filter((p) => !p.captured && p.side === 'black' && p.square && p.possibleTypes.includes('k'));
  const holdersAfter = after.filter((p) => !p.captured && p.side === 'black' && p.square && p.possibleTypes.includes('k'));
  const unmaskedBefore = holdersBefore.length === 1 && holdersBefore[0].possibleTypes.length === 1;
  if (!unmaskedBefore && holdersAfter.length === 1 && holdersAfter[0].possibleTypes.length === 1) {
    themes.push('unmask');
  }

  const givesCheck = listCheckThreats(after).some((t) => t.side === 'white');
  if (moveSim.enPassant && givesCheck) themes.push('epCheck'); // The Phantom
  if (givesCheck) themes.push('check');

  const lastMove = buildLastMove(after, moveSim.moverId, moveSim.from, moveSim.to, moveSim.enPassant, measuredSquares, 'white',
    (before.find((p) => p.id === moveSim.moverId)?.moveCount || 0) === 0);
  if (givesCheck && evaluateTerminalAfterMove(after, 'white', moveSim.nextCC, lastMove) === 'checkmate') {
    themes.push('mate'); // Collapse Mate
  }

  if (!moveSim.didCapture && !givesCheck) themes.push('quiet');
  return themes;
}

// How hard is the solution to FIND? Chain length, real search space, how
// deep the move is buried in the static ordering (a move that looks bad
// shallow but is forced deep = classic puzzle trickiness), quiet-move and
// theme bonuses.
function trickinessOf(step, chainLen) {
  const hidden = Math.min(step.shallowRank, 8) * 1.2;
  const space = Math.min(step.numChoices, 24) / 8;
  const themeBonus = step.themes.filter((t) => t !== 'check' && t !== 'quiet').length;
  const quietBonus = step.themes.includes('quiet') ? 1.5 : 0;
  return Number((chainLen * 3 + hidden + space + themeBonus + quietBonus).toFixed(2));
}

// ----------------------------------------------------------------- mining

function moveKey(m) {
  if (m.type === 'castle') return `castle:${m.plan.piece1_from}->${m.plan.piece1_to}+${m.plan.piece2_from}`;
  return `${m.type}:${m.from}->${m.to}`;
}
function playedKey(rec) {
  return rec.type === 'castle' ? `castle:${rec.from}->${rec.to}` : `${rec.type}:${rec.from}->${rec.to}`;
}

function positionSane(pieces) {
  const seen = new Set();
  for (const p of pieces) {
    if (p.captured) continue;
    if (!p.square || seen.has(p.square)) return false;
    seen.add(p.square);
  }
  const holders = (side) => pieces.filter((p) => !p.captured && p.side === side && (p.possibleTypes || []).includes('k')).length;
  return holders('white') > 0 && holders('black') > 0;
}

// Census fixed-point assertion carried over from the composed pipeline: a
// mined game state must already satisfy global type constraints. A failure
// here is an engine bug, not a bad puzzle — report loudly.
function censusFixed(pieces) {
  const sig = (ps) => ps.map((p) => `${p.id}:${(p.possibleTypes || []).join('')}`).sort().join('|');
  return sig(applyQuantumConstraints(clonePieces(pieces))) === sig(pieces);
}

function analyzePosition(position, depth, widths, timeMs) {
  return analyzeRootMoves({
    pieces: position.pieces,
    sideToMove: 'white',
    lastMove: position.lastMove,
    depth,
    widths,
    timeMs,
  });
}

function classifyOnlyMove(analysis) {
  const { moves } = analysis;
  if (moves.length < CFG.minChoices) return null;
  const best = moves[0];
  const second = moves[1];
  if (!second) return null; // a forced single move is not a findable puzzle
  if (best.score < CFG.holdEval) return null;
  if (second.score > CFG.failEval) return null;
  if (best.score - second.score < CFG.minGap) return null;
  return { best, second, gap: Number((best.score - second.score).toFixed(2)), numChoices: moves.length };
}

// A cheap shallow pass rejects the ~98% of positions that are obviously not
// only-moves (relaxed bar so a real only-move never dies in the funnel);
// only survivors pay for the deep analysis.
function prefilterOnlyMove(analysis) {
  const { moves } = analysis;
  if (moves.length < CFG.minChoices) return false;
  const best = moves[0];
  const second = moves[1];
  if (!second) return false;
  if (best.score < CFG.holdEval - 0.5) return false;
  if (second.score > CFG.failEval + 0.75) return false;
  if (best.score - second.score < CFG.minGap * 0.5) return false;
  return true;
}

// Full only-move detection for one white-to-move position (a game position
// or an engine-rollout position): funnel prefilter → deep analysis →
// classification → theme tags. Returns a step or null.
function detectOnlyMoveStep(rec, stats) {
  stats.scanned++;
  const t0 = performance.now();
  const shallow = analyzePosition(rec, Math.max(2, CFG.mineDepth - 1), PREFILTER_WIDTHS, CFG.prefilterMs);
  if (!shallow) { stats.prefilterTimeouts++; stats.mineMsTotal += performance.now() - t0; return null; }
  if (!prefilterOnlyMove(shallow)) { stats.mineMsTotal += performance.now() - t0; return null; }
  stats.funnelSurvivors++;
  const analysis = analyzePosition(rec, CFG.mineDepth, MINE_WIDTHS, CFG.mineMs);
  stats.mineMsTotal += performance.now() - t0;
  if (!analysis) { stats.timeouts++; return null; }
  const only = classifyOnlyMove(analysis);
  if (!only) return null;
  stats.onlyMoves++;

  const moveSim = simulateAnalysisMove(rec, only.best.move);
  if (!moveSim) return null;
  const themes = tagThemes(rec, moveSim);

  // Rank of the solution under a static (depth-0) ordering: how buried it is.
  const staticSorted = [...analysis.moves]
    .map((m) => ({ key: moveKey(m.move), s: evaluatePosition(m.move.resultPieces) }))
    .sort((a, b) => b.s - a.s);
  const shallowRank = staticSorted.findIndex((m) => m.key === moveKey(only.best.move));

  return {
    ply: rec.ply,
    rollout: Boolean(rec.rollout),
    bestMove: { type: only.best.move.type, from: moveSim.from, to: moveSim.to, enPassant: moveSim.enPassant },
    bestScore: Number(only.best.score.toFixed(2)),
    secondScore: Number(only.second.score.toFixed(2)),
    gap: only.gap,
    numChoices: only.numChoices,
    shallowRank,
    themes,
    played: rec.played ? playedKey(rec.played) === moveKey(only.best.move) : null,
    analysisMove: only.best.move, // raw engine move, used to roll the chain forward (stripped on save)
    position: rec, // pieces/lastMove/captureCounter snapshot (stripped on save)
  };
}

// Extend a mined only-move into a chain by ENGINE ROLLOUT: play the best
// move, let the engine answer with Black's best reply (exactly what the
// one-chance eval-bar product does live), and re-analyze the new position
// for another only-move. This deliberately does NOT follow the game line —
// weak bots blunder INTO tactics but rarely walk the punishing line
// afterwards, so game-line chains stall at length 1.
function extendChain(firstStep, stats, covered) {
  const steps = [firstStep];
  const blackReplies = [];
  let endsInMate = false;
  let state = {
    pieces: firstStep.position.pieces,
    sideToMove: 'white',
    captureCounter: firstStep.position.captureCounter,
    lastMove: firstStep.position.lastMove,
    halfmoveClock: 0,
  };
  while (steps.length < CFG.maxChain) {
    const cur = steps[steps.length - 1];
    const afterWhite = applyReply(state, cur.analysisMove);
    if (!afterWhite) break;
    if (afterWhite.gameOver) { endsInMate = afterWhite.reason === 'checkmate'; break; }
    state = afterWhite.state;

    const blackAnalysis = analyzeRootMoves({
      pieces: state.pieces,
      sideToMove: 'black',
      lastMove: state.lastMove,
      depth: CFG.mineDepth,
      widths: MINE_WIDTHS,
      timeMs: CFG.mineMs,
    });
    if (!blackAnalysis || blackAnalysis.moves.length === 0) break;
    const replyMove = blackAnalysis.moves[0].move;
    const afterBlack = applyReply(state, replyMove);
    if (!afterBlack) break;
    blackReplies.push({
      type: replyMove.type,
      from: replyMove.type === 'castle' ? replyMove.plan.piece1_from : replyMove.from,
      to: replyMove.type === 'castle' ? replyMove.plan.piece1_to : replyMove.to,
    });
    if (afterBlack.gameOver) break;
    state = afterBlack.state;

    const rec = {
      ply: cur.ply + 2,
      rollout: true,
      sideToMove: 'white',
      pieces: clonePieces(state.pieces),
      captureCounter: state.captureCounter,
      lastMove: state.lastMove,
      played: null,
    };
    if (!positionSane(rec.pieces) || !censusFixed(rec.pieces)) { stats.censusBug++; break; }
    const next = detectOnlyMoveStep(rec, stats);
    if (!next) break;
    covered.add(computePositionSignature(rec.pieces, 'white', rec.lastMove));
    stats.rolloutExtensions++;
    steps.push(next);
  }
  return { steps, blackReplies, endsInMate };
}

function mineGame(game, stats) {
  const chains = [];
  const verifySteps = [];
  const covered = new Set(); // positions already inside an earlier chain's engine line

  for (const rec of game.record) {
    if (rec.sideToMove !== 'white' || rec.ply < CFG.minPly) continue;
    if (!positionSane(rec.pieces)) { stats.insane++; continue; }
    if (!censusFixed(rec.pieces)) {
      stats.censusBug++;
      console.log(`  !! census fixed-point FAILED at game ${game.gameIdx} ply ${rec.ply} — engine bug candidate`);
      continue;
    }
    if (covered.has(computePositionSignature(rec.pieces, 'white', rec.lastMove))) continue;

    const first = detectOnlyMoveStep(rec, stats);
    if (!first) continue;
    const { steps, blackReplies, endsInMate } = extendChain(first, stats, covered);
    verifySteps.push(...steps);
    chains.push({
      game: game.gameIdx,
      white: game.white,
      black: game.black,
      startPly: rec.ply,
      length: steps.length,
      endsInMate,
      trickiness: trickinessOf(steps[steps.length - 1], steps.length),
      themes: [...new Set(steps.flatMap((s) => s.themes))],
      steps: steps.map(({ position, analysisMove, ...s }) => s),
      blackReplies, // engine-best replies, matching the live product
      start: {
        pieces: rec.pieces,
        lastMove: rec.lastMove,
        captureCounter: rec.captureCounter,
        sideToMove: 'white',
      },
    });
  }

  return { chains, verifySteps };
}

// -------------------------------------------------------------- verification

function verifyStep(step, position, stats) {
  const t0 = performance.now();
  // Adaptive depth: prefer verifyDepth, fall back one level on timeout —
  // any depth strictly above mineDepth is still an independent, deeper check.
  let analysis = null;
  let usedDepth = null;
  for (let d = CFG.verifyDepth; d > CFG.mineDepth && !analysis; d--) {
    analysis = analyzePosition(position, d, VERIFY_WIDTHS, CFG.verifyMs);
    if (analysis) usedDepth = d;
  }
  stats.verifyMsTotal += performance.now() - t0;
  if (!analysis) return { verdict: 'timeout' };
  const best = analysis.moves[0];
  const second = analysis.moves[1];
  const sameBest = moveKey(best.move) === `${step.bestMove.type}:${step.bestMove.from}->${step.bestMove.to}`
    || (step.bestMove.type === 'castle' && moveKey(best.move).startsWith(`castle:${step.bestMove.from}->${step.bestMove.to}`));
  const holds = best.score >= CFG.holdEval;
  const gapHolds = second ? best.score - second.score >= CFG.minGap * 0.5 : true;
  return {
    verdict: sameBest && holds && gapHolds ? 'agree' : 'disagree',
    depth: usedDepth,
    deepBest: `${best.move.type}:${best.move.from || ''}->${best.move.to || ''}`,
    deepBestScore: Number(best.score.toFixed(2)),
    deepSecondScore: second ? Number(second.score.toFixed(2)) : null,
    sameBest, holds, gapHolds,
  };
}

// -------------------------------------------------------------------- main

console.log(`puzzle-miner  games=${CFG.games} seed=${CFG.seed} playMs=${CFG.playMs} mineDepth=${CFG.mineDepth} verifyDepth=${CFG.verifyDepth}`);
console.log(`only-move bar: best>=${CFG.holdEval}, others<=${CFG.failEval}, gap>=${CFG.minGap}, choices>=${CFG.minChoices}\n`);

const stats = { scanned: 0, onlyMoves: 0, funnelSurvivors: 0, prefilterTimeouts: 0, timeouts: 0, insane: 0, censusBug: 0, rolloutExtensions: 0, mineMsTotal: 0, verifyMsTotal: 0 };
const games = [];
const allChains = [];
const verifiable = []; // { step, position } for the gate

for (let g = 0; g < CFG.games; g++) {
  // Vary personalities: any two distinct roster bots (weights matter, tiers
  // are normalized to medium+ so play is honest).
  const pool = BOTS;
  const wIdx = Math.floor(rng() * pool.length);
  let bIdx = Math.floor(rng() * pool.length);
  if (bIdx === wIdx) bIdx = (bIdx + 1) % pool.length;
  const botW = minerBot(pool[wIdx]);
  const botB = minerBot(pool[bIdx]);

  const t0 = performance.now();
  const game = playGame(g, botW, botB);
  const playSec = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`game ${g}: ${game.white} vs ${game.black} — ${game.plies} plies, ${game.result.winner || 'draw'} (${game.result.reason}) [${playSec}s]`);
  games.push({ gameIdx: g, white: game.white, black: game.black, plies: game.plies, result: game.result });

  const t1 = performance.now();
  const mined = mineGame(game, stats);
  const mineSec = ((performance.now() - t1) / 1000).toFixed(1);
  for (const chain of mined.chains) {
    allChains.push(chain);
    console.log(`  chain @ply ${chain.startPly}: len=${chain.length}${chain.endsInMate ? '+mate' : ''} gap=${chain.steps[0].gap} choices=${chain.steps[0].numChoices} trick=${chain.trickiness} themes=[${chain.themes.join(',')}]`);
  }
  for (const step of mined.verifySteps) verifiable.push({ gameIdx: g, step, position: step.position });
  console.log(`  mined ${mined.chains.length} chain(s) from ${game.record.filter((r) => r.sideToMove === 'white' && r.ply >= CFG.minPly).length} white positions [${mineSec}s]`);
}

// GATE: double-depth agreement on every only-move ply (capped).
console.log(`\n--- verification gate: re-searching ${Math.min(verifiable.length, CFG.verifyCap)} only-move plies at depth ${CFG.verifyDepth} ---`);
let agreed = 0;
let checked = 0;
let vTimeouts = 0;
const verdicts = [];
for (const { gameIdx, step, position } of verifiable.slice(0, CFG.verifyCap)) {
  const v = verifyStep(step, position, stats);
  if (v.verdict === 'timeout') { vTimeouts++; continue; }
  checked++;
  if (v.verdict === 'agree') agreed++;
  verdicts.push({ game: gameIdx, ply: step.ply, move: `${step.bestMove.from}->${step.bestMove.to}`, ...v });
  if (v.verdict === 'disagree') {
    console.log(`  DISAGREE game ${gameIdx} ply ${step.ply}: mined ${step.bestMove.from}->${step.bestMove.to} (${step.bestScore}) vs deep ${v.deepBest} (${v.deepBestScore}) sameBest=${v.sameBest} holds=${v.holds} gapHolds=${v.gapHolds}`);
  }
}
const rate = checked ? (100 * agreed / checked) : 0;

// ------------------------------------------------------------------ report

const report = {
  generatedForSeed: CFG.seed,
  config: CFG,
  games,
  stats: {
    whitePositionsScanned: stats.scanned,
    funnelSurvivors: stats.funnelSurvivors,
    onlyMovesFound: stats.onlyMoves,
    onlyMoveRate: stats.scanned ? Number((stats.onlyMoves / stats.scanned).toFixed(3)) : 0,
    chains: allChains.length,
    chainLengths: allChains.reduce((acc, c) => { acc[c.length] = (acc[c.length] || 0) + 1; return acc; }, {}),
    rolloutExtensions: stats.rolloutExtensions,
    prefilterTimeouts: stats.prefilterTimeouts,
    deepAnalysisTimeouts: stats.timeouts,
    insanePositions: stats.insane,
    censusFixedPointFailures: stats.censusBug,
    avgMineMsPerPosition: stats.scanned ? Math.round(stats.mineMsTotal / stats.scanned) : 0,
  },
  gate: {
    verified: checked,
    agreed,
    timeouts: vTimeouts,
    agreementRate: Number(rate.toFixed(1)),
    threshold: 95,
    pass: rate >= 95,
    verdicts,
  },
  chains: allChains,
};

fs.mkdirSync(CFG.outDir, { recursive: true });
const outFile = path.join(CFG.outDir, `mined-seed${CFG.seed}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 1));

console.log(`\n=== SUMMARY ===`);
console.log(`white positions scanned: ${stats.scanned}  (avg ${report.stats.avgMineMsPerPosition}ms each; funnel survivors: ${stats.funnelSurvivors}; timeouts: ${stats.prefilterTimeouts} shallow / ${stats.timeouts} deep)`);
console.log(`only-moves found: ${stats.onlyMoves}  (${(100 * report.stats.onlyMoveRate).toFixed(1)}% of positions)`);
console.log(`chains: ${allChains.length}  by length: ${JSON.stringify(report.stats.chainLengths)}  (${stats.rolloutExtensions} rollout extensions)`);
console.log(`census fixed-point failures (engine-bug detector): ${stats.censusBug}`);
console.log(`GATE — double-depth agreement: ${agreed}/${checked} = ${rate.toFixed(1)}%  (need 95%+ to feed mined puzzles into rotation)${vTimeouts ? `, ${vTimeouts} verify timeouts` : ''}`);
console.log(`report: ${outFile}`);
process.exit(0);
