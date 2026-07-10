// tools/puzzle-miner.mjs
// Purpose: Mine daily-puzzle candidates from bot self-play. Pipeline (the
// 2026-07-08 SWING rework — mistakes, not only-moves): (1) simulate games
// between STRONG top-tier bots (blunder noise off; the stronger seats as
// White), (2) probe every White-to-move position and find Black's first
// MISTAKE FROM BALANCE — the eval sat near 0, Black moved, and now White's
// best line reaches swingMin while the MEDIAN move leaks it (perishability),
// (3) roll a fixed-length PAR LINE (parPlies white moves vs engine-best
// replies) in which every ply must stay quantum-tricky; par evals per ply
// are the fidelity ruler the client scores against, (4) tag quantum themes
// (measure3, census, seal, unmask, phantom ep-check, mate, recohere) and
// trickiness, (5) GATE: re-search each par ply at a higher depth — par must
// hold. High agreement (95%+) is the go signal for feeding mined puzzles
// into the daily rotation. The puzzle SHOWS Black's mistake move; the player
// must capitalize, scored by where the needle lands vs par (fidelity).
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
import { buildLastMoveRecord, countPossibilities, moveOutcome } from '../frontend/src/chessboard/advanceCore.js';
import { analyzeRootMoves, evaluatePosition, searchBestMove } from '../frontend/src/ai/alphaBetaEngine.js';
import { BOTS } from '../frontend/src/ai/bots.js';
import { mulberry32 } from '../frontend/tests/fixtureUtil.mjs';

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
  maxPlies: Number(argVal('maxPlies', QUICK ? 70 : 90)), // 45 full moves, then adjudicate (Jasper 2026-07-09): past that it's classical endgame territory — no puzzles there, and probing it isn't free
  playMs: Number(argVal('playMs', QUICK ? 250 : 900)), // per-move time; strong bots need thinking room
  minPly: Number(argVal('minPly', 20)), // plies (half-moves): ~10 full moves in — mid-game, quantum state developed (Jasper, 2026-07-09)
  handoffPly: Number(argVal('handoffPly', 20)), // bot handoff: opening controllers play plies 0..handoffPly-1, main controllers after
  mineDepth: Number(argVal('mineDepth', 4)),
  prefilterMs: Number(argVal('prefilterMs', 5000)), // deep-funnel shallow pass budget
  probeMs: Number(argVal('probeMs', 8000)), // per-ply balance probe budget (timeouts poison the streak)
  mineMs: Number(argVal('mineMs', QUICK ? 10000 : 45000)), // deep budget, only for probe survivors
  confirmMs: Number(argVal('confirmMs', QUICK ? 30000 : 120000)), // depth-stability confirm
  verifyDepth: Number(argVal('verifyDepth', 6)), // gate must sit above confirm (mineDepth+1); falls back one level on timeout
  verifyMs: Number(argVal('verifyMs', QUICK ? 45000 : 120000)),
  verifyCap: Number(argVal('verifyCap', 120)), // max par plies to re-verify
  minChoices: Number(argVal('minChoices', 10)), // fewer legal moves = not a real search
  maxChoices: Number(argVal('maxChoices', 10000)), // no hard cap (2026-07-09: seed-8 swings sat at 78-158 moves — width is inherent to winning quantum positions); numChoices is curation metadata
  // --- swing detection (2026-07-08 rework: mistakes, not only-moves) ---
  // The puzzle moment is Black's FIRST MISTAKE FROM BALANCE: the eval sat
  // near 0, Black moved, and now White's best line reaches swingMin. The
  // player is shown Black's move and must capitalize.
  balanceBand: Number(argVal('balanceBand', 1.25)), // |eval| <= band counts as balanced
  balanceStreak: Number(argVal('balanceStreak', 2)), // consecutive balanced white-to-move probes required before the swing
  swingMin: Number(argVal('swingMin', 2.0)), // post-mistake advantage floor (deep eval; 2.5 rejected every seed-9 candidate — deep bests clustered 1.3-2.3)
  swingDelta: Number(argVal('swingDelta', 1.5)), // and the JUMP from the last balanced eval must be at least this
  // Perishability: an advantage that survives lazy play is no puzzle. The
  // MEDIAN legal move must keep less than this fraction of the best move's
  // advantage — most moves must leak the win.
  perishFrac: Number(argVal('perishFrac', 0.34)),
  // --- par line (all puzzles are 3-movers) ---
  parPlies: Number(argVal('parPlies', 3)), // white moves in the certified par line
  minPlyTrick: Number(argVal('minPlyTrick', 4.0)), // every par ply must stay this interesting (sustained trickiness)
  outDir: argVal('out', path.join(path.dirname(fileURLToPath(import.meta.url)), 'mined')),
};

// Root widths must NEVER truncate — quantum midgames reach 60-80 legal
// moves, and a root-pruned move silently corrupts evals (a graph point drew
// 0.8 where the true value was 3.45 because the root beam was 40).
const PREFILTER_WIDTHS = [176, 10, 8];
const PROBE_WIDTHS = [176, 8, 6]; // balance probes: full root, narrow tail — speed comes from the inner beams
const MINE_WIDTHS = [176, 16, 12, 9, 7]; // certification beams — a beam too narrow can miss a refutation
const CONFIRM_WIDTHS = [176, 10, 8, 6, 6]; // depth+1 stability check: narrow inner beams or it times out
const VERIFY_WIDTHS = [176, 16, 12, 10, 8, 6];

// ------------------------------------------------- determinism (seeded rng)

// searchBestMove uses Math.random for opening variety; patch it (with the
// shared seeded rng from tests/fixtureUtil.mjs) so a run is fully
// reproducible from --seed.
const rng = mulberry32(CFG.seed * 2654435761);
Math.random = rng;

// -------------------------------------------------------------- game loop

function otherSide(side) { return side === 'white' ? 'black' : 'white'; }

// Re-simulate a reply from generateLegalReplies so we recover didCapture and
// measuredSquares (the reply list drops them), then advance through the
// shared moveOutcome — the same tail live play and review replay use.
function applyReply(state, reply) {
  const { pieces, sideToMove, captureCounter, halfmoveClock } = state;

  let sim;
  let moverId;
  let from;
  let to;
  let wasFirstMove = false;
  let moverWasPromoted = false;
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
    moverWasPromoted = Boolean(mover.wasPromoted);
    sim = reply.type === 'enpassant'
      ? simulateEnPassant(pieces, mover.id, reply.to, reply.victimId, captureCounter)
      : simulateStandardMove(pieces, mover.id, reply.to, captureCounter);
    if (!sim.ok) return null;
  }

  const outcome = moveOutcome({ pieces, sideToMove, captureCounter, halfmoveClock }, sim, {
    moverId,
    from,
    to,
    isCastle: reply.type === 'castle',
    usedEnPassant: reply.type === 'enpassant',
    wasFirstMove,
    moverWasPromoted,
  });

  return {
    state: {
      pieces: outcome.finalPieces,
      sideToMove: otherSide(sideToMove),
      captureCounter: outcome.nextCaptureCounter,
      lastMove: outcome.nextLastMove,
      halfmoveClock: outcome.nextHalfmoveClock,
    },
    moveRec: { type: reply.type, from, to, didCapture: outcome.didCapture, measuredSquares: outcome.nextLastMove.measuredSquares },
    gameOver: outcome.gameOver, winner: outcome.winner, reason: outcome.gameOverReason,
  };
}

// A miner bot: a top-tier roster bot with its personality weights, blunder
// noise FORCED OFF, and think time set by --playMs. Swing mining wants
// strong-vs-stronger: balanced positions where the mistakes that do happen
// are subtle and worth punishing — a weak bot's queen-hang produces mop-up
// puzzles, which is exactly what the seed-3/4/5 era taught us to avoid.
function minerBot(rosterBot) {
  return {
    id: rosterBot.id,
    tier: rosterBot.tier,
    weights: rosterBot.weights || {},
    search: { ...(rosterBot.search || {}), noise: 0, timeMs: CFG.playMs },
  };
}

// Role pools for the phased handoff: the strongest bot capitalizes as
// White post-handoff; ranks 2-4 open as White (slightly outgunned by the
// strongest opening as Black); ranks 5-10 err as Black post-handoff.
const BY_RATING = [...BOTS].sort((a, b) => (b.rating || 0) - (a.rating || 0));
const MID_STRONG = BY_RATING.slice(1, 4);
const MID_WEAK = BY_RATING.slice(4, 10);
if (BY_RATING.length < 10) throw new Error('need at least ten bots for the role pools');

// roles: { openW, openB, mainW, mainB } — the OPENING pair plays the first
// handoffPly plies (mid-strong White vs the strongest Black: a balanced,
// slightly White-worse start), then the controllers swap: the strongest bot
// takes White to capitalize and a mid-weak bot takes Black to err (Jasper's
// phased-handoff design, 2026-07-09).
function playGame(gameIdx, roles) {
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
  const stored = []; // gameSlice.js / review-replay move format, for the dev game viewer
  let result = { winner: null, reason: 'move cap' };

  for (let ply = 0; ply < CFG.maxPlies; ply++) {
    const opening = ply < CFG.handoffPly;
    const bot = state.sideToMove === 'white'
      ? (opening ? roles.openW : roles.mainW)
      : (opening ? roles.openB : roles.mainB);
    const res = searchBestMove({
      pieces: state.pieces,
      sideToMove: state.sideToMove,
      bot,
      lastMove: state.lastMove,
      repetitionSigs: sigCounts, // a winning bot must convert, not shuffle into threefold
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
    if (res.move.type === 'castle') {
      stored.push({ from: res.move.plan.piece1_from, to: res.move.plan.piece1_to, side: before.sideToMove, enPassant: false, castle: true });
      stored.push({ from: res.move.plan.piece2_from, to: res.move.plan.piece2_to, side: before.sideToMove, enPassant: false, castle: true });
    } else {
      stored.push({ from: res.move.from, to: res.move.to, side: before.sideToMove, enPassant: res.move.type === 'enpassant' });
    }
    state = applied.state;

    if (applied.gameOver) { result = { winner: applied.winner, reason: applied.reason }; break; }

    const sig = computePositionSignature(state.pieces, state.sideToMove, state.lastMove);
    const n = (sigCounts.get(sig) || 0) + 1;
    sigCounts.set(sig, n);
    if (n >= 3) { result = { winner: null, reason: 'threefold repetition' }; break; }
  }

  return {
    gameIdx,
    white: roles.mainW.id,
    black: roles.mainB.id,
    opening: { white: roles.openW.id, black: roles.openB.id },
    record, stored, result, plies: record.length,
  };
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

  const holdersBefore = before.filter((p) => !p.captured && p.side === 'black' && p.square && p.possibleTypes.includes('k'));
  const holdersAfter = after.filter((p) => !p.captured && p.side === 'black' && p.square && p.possibleTypes.includes('k'));
  const unmaskedBefore = holdersBefore.length === 1 && holdersBefore[0].possibleTypes.length === 1;
  if (!unmaskedBefore && holdersAfter.length === 1 && holdersAfter[0].possibleTypes.length === 1) {
    themes.push('unmask');
  }

  const givesCheck = listCheckThreats(after).some((t) => t.side === 'white');
  if (moveSim.enPassant && givesCheck) themes.push('epCheck'); // The Phantom
  if (givesCheck) themes.push('check');

  const lastMove = buildLastMoveRecord({
    finalPieces: after,
    moverId: moveSim.moverId,
    from: moveSim.from,
    to: moveSim.to,
    side: 'white',
    usedEnPassant: moveSim.enPassant,
    wasFirstMove: (before.find((p) => p.id === moveSim.moverId)?.moveCount || 0) === 0,
    measuredSquares,
  });
  if (givesCheck && evaluateTerminalAfterMove(after, 'white', moveSim.nextCC, lastMove) === 'checkmate') {
    themes.push('mate'); // Collapse Mate
  }

  // A definite pawn marching into promotion (to the 7th/8th) is the loudest
  // "quiet" move there is — no capture, no check, but the eval sees most of
  // a queen. Tag it 'promo' and keep it OUT of 'quiet', which feeds a
  // trickiness bonus it does not deserve (seed-4 games 93/98 were mislabeled
  // quiet gems this way).
  const moverBefore = before.find((p) => p.id === moveSim.moverId);
  const toRank = Number(moveSim.to && moveSim.to[1]);
  const promoPush = Boolean(moverBefore
    && moverBefore.possibleTypes.length === 1 && moverBefore.possibleTypes[0] === 'p'
    && toRank >= 7);
  if (promoPush) themes.push('promo');
  if (!moveSim.didCapture && !givesCheck && !promoPush) themes.push('quiet');
  return themes;
}

// How hard is the solution to FIND? The BASELINE is how quantum the position
// is — the density of superposed pieces plus how much de/recoherence is in
// flight (pieces mid-transition are exactly where the eye slides off; a
// RUNNING recoherence clock counts here). On top of that: real search
// space, how deep the move is buried
// in the static ordering, a bonus when the SOLUTION'S MOVER is itself
// decohering/recohering (hard to spot, per playtesting), and quiet/theme
// bonuses.
function pieceInFlux(p) {
  const n = (p.possibleTypes || []).length;
  return (p.recohere || 0) > 0 || (n > 1 && (p.coherence ?? 3) < 3);
}

function quantumBaseline(pieces) {
  let alive = 0;
  let superposed = 0;
  let flux = 0;
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    alive++;
    if ((p.possibleTypes || []).length > 1) superposed++;
    if (pieceInFlux(p)) flux++;
  }
  const density = alive ? superposed / alive : 0;
  return density * 2 + Math.min(flux, 6) * 0.4; // 0 .. ~4.4
}

function plyTrickiness(step) {
  const pieces = step.position.pieces;
  const base = quantumBaseline(pieces);
  const mover = pieces.find((p) => !p.captured && p.square === step.bestMove.from);
  const moverFlux = mover && pieceInFlux(mover) ? 1.5 : 0;
  const hidden = Math.min(step.shallowRank, 8) * 1.2;
  const space = Math.min(step.numChoices, 24) / 8;
  // 'recohere' counts in the theme bonus deliberately: a line where an
  // identity grows back mid-sequence is hard to read ahead of time.
  const themeBonus = step.themes.filter((t) => t !== 'check' && t !== 'quiet' && t !== 'promo').length;
  const quietBonus = step.themes.includes('quiet') ? 1.5 : 0;
  return Number((base + moverFlux + hidden + space + themeBonus + quietBonus).toFixed(2));
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

// ------------------------------------------- swing detection (the mistake)

// Cheap depth-2 probe: the side-to-move's best-move score, normalized to
// WHITE-POSITIVE. Feeds the balance history and flags candidate swings
// (the dev viewer computes its own parity-matched graph client-side).
// Null on timeout (treated as "unknown" — it breaks the balance streak
// rather than lying).
function probeEval(position, stats, side = 'white') {
  const t0 = performance.now();
  // searchBestMove, not analyzeRootMoves: probes only need the BEST score,
  // and root-wide alpha pruning is ~6x cheaper at the same full root width
  // (measured 118s -> 18s on a 98-move position).
  const res = searchBestMove({
    pieces: position.pieces,
    sideToMove: side,
    lastMove: position.lastMove,
    bot: { search: { maxDepth: 2, widths: PROBE_WIDTHS, timeMs: CFG.probeMs, noise: 0 } },
  });
  stats.mineMsTotal += performance.now() - t0;
  if (!res || !res.move || res.depth < 2) { stats.prefilterTimeouts++; return null; }
  return Number((side === 'white' ? res.score : -res.score).toFixed(2));
}

// Spread stats over a full root analysis: how perishable is the advantage?
// best = the par move's eval; medianFrac = the share of it a lazy (median)
// move keeps. Low medianFrac = most moves leak the win = a real test.
function spreadOf(analysis) {
  const scores = analysis.moves.map((m) => m.score);
  const best = scores[0];
  const median = scores[Math.floor(scores.length / 2)];
  const medianFrac = best > 0 ? Number((Math.max(0, median) / best).toFixed(3)) : 1;
  return { best, median: Number(median.toFixed(2)), medianFrac, numChoices: scores.length };
}

// Did ANY piece regain an identity across this transition? Recoherence
// paying out mid-line is peak quantum — tagged as a 'recohere' theme, which
// feeds the trickiness theme bonus. (Recoherence merely IN FLIGHT — running
// clocks — is already part of the quantumBaseline via pieceInFlux.)
function regainedIdentity(before, after) {
  const lens = new Map(before.map((p) => [p.id, (p.possibleTypes || []).length]));
  return after.some((p) => !p.captured && p.square
    && (p.possibleTypes || []).length > (lens.get(p.id) ?? 99));
}

// Analyze one par ply: full root analysis (reused if the caller already has
// it), theme tags, spread, and per-ply trickiness.
function parStep(rec, stats, analysis = null) {
  if (!analysis) {
    const t0 = performance.now();
    analysis = analyzePosition(rec, CFG.mineDepth, MINE_WIDTHS, CFG.mineMs);
    stats.mineMsTotal += performance.now() - t0;
    if (!analysis) { stats.timeouts++; return null; }
  }
  if (!analysis.moves.length) return null;
  const best = analysis.moves[0];
  const moveSim = simulateAnalysisMove(rec, best.move);
  if (!moveSim) return null;
  const themes = tagThemes(rec, moveSim);
  if (regainedIdentity(rec.pieces, moveSim.after)) themes.push('recohere');
  const staticSorted = [...analysis.moves]
    .map((m) => ({ key: moveKey(m.move), s: evaluatePosition(m.move.resultPieces) }))
    .sort((a, b) => b.s - a.s);
  const shallowRank = staticSorted.findIndex((m) => m.key === moveKey(best.move));
  const spread = spreadOf(analysis);
  const step = {
    ply: rec.ply,
    bestMove: { type: best.move.type, from: moveSim.from, to: moveSim.to, enPassant: moveSim.enPassant },
    parEval: Number(best.score.toFixed(2)),
    spread,
    numChoices: spread.numChoices,
    shallowRank,
    possDelta: countPossibilities(rec.pieces) - countPossibilities(moveSim.after),
    themes,
    analysisMove: best.move, // rolls the line forward (stripped on save)
    position: rec, // pieces/lastMove/captureCounter snapshot (stripped on save)
  };
  step.trickiness = plyTrickiness(step);
  return step;
}

// "Plain recapture": statically the top move, taking a fully-collapsed piece
// on the square Black just moved to. Sound but boring — take-back-the-queen.
// Filtered as a puzzle START; forced recaptures deeper in the line are fine.
function isPlainRecapture(step, rec) {
  if (step.shallowRank !== 0) return false;
  const lm = rec.lastMove;
  if (!lm || lm.to !== step.bestMove.to) return false;
  const target = rec.pieces.find((p) => !p.captured && p.square === step.bestMove.to && p.side === 'black');
  return Boolean(target && (target.possibleTypes || []).length === 1);
}

// The mistake moment, certified end to end. Called on a white-to-move
// position whose preceding white-to-move probes were all balanced: probe →
// deep analysis (swing + perishability + size) → depth-stability confirm →
// a parPlies-long engine rollout in which EVERY ply must stay tricky and
// the line must stay quantum. Returns { probe, chain }.
function detectSwingChain(rec, preEval, stats) {
  const probe = probeEval(rec, stats);
  // Relaxed probe bar (depth-2 evals are noisy; a real swing must never die
  // in the funnel, mop-ups and quiet positions do).
  if (probe === null || probe < CFG.swingMin - 1) return { probe, chain: null };
  stats.funnelSurvivors++;

  // Size gate BEFORE the deep analysis: counting legal moves is ~30ms while
  // a wasted deep search on a 60-move position is minutes (seed-5 burned
  // both its deep-timeout budget slots on positions the gate would reject).
  const moveCount = generateLegalReplies(rec.pieces, 'white', rec.captureCounter, rec.lastMove).length;
  if (moveCount < CFG.minChoices || moveCount >= CFG.maxChoices) {
    stats.sizeRejects++;
    console.log(`  size-reject @ply ${rec.ply}: probe ${probe} but ${moveCount} legal moves (bar: ${CFG.minChoices}..${CFG.maxChoices - 1})`);
    return { probe, chain: null };
  }

  const t0 = performance.now();
  const analysis = analyzePosition(rec, CFG.mineDepth, MINE_WIDTHS, CFG.mineMs);
  stats.mineMsTotal += performance.now() - t0;
  if (!analysis) { stats.timeouts++; return { probe, chain: null }; }
  const spread = spreadOf(analysis);
  if (spread.best < CFG.swingMin || spread.best - preEval < CFG.swingDelta) {
    stats.weakSwingRejects++;
    console.log(`  near-miss @ply ${rec.ply}: pre ${preEval} -> deep best ${spread.best.toFixed(2)} (need >=${CFG.swingMin} and jump >=${CFG.swingDelta})`);
    return { probe, chain: null };
  }
  if (spread.medianFrac >= CFG.perishFrac) { stats.perishRejects++; return { probe, chain: null }; }

  // Depth-stability confirm (the engine-as-referee guard from the only-move
  // era, kept): one depth deeper the swing must hold and the advantage must
  // still be perishable. A timeout is not evidence — the gate still rules.
  const confirm = analyzePosition(rec, CFG.mineDepth + 1, CONFIRM_WIDTHS, CFG.confirmMs);
  let confirmStatus = 'ok';
  if (!confirm) {
    stats.confirmTimeouts++;
    confirmStatus = 'timeout';
  } else {
    const cs = spreadOf(confirm);
    if (cs.best < CFG.swingMin * 0.8 || cs.medianFrac >= CFG.perishFrac + 0.15) {
      stats.confirmRejects++;
      return { probe, chain: null };
    }
  }
  stats.swings++;
  console.log(`  swing @ply ${rec.ply}: ${preEval} -> ${spread.best.toFixed(2)} after ${rec.lastMove.from}->${rec.lastMove.to}  medianFrac=${spread.medianFrac} confirm=${confirmStatus}`);

  // --- par line: exactly parPlies white moves, every ply interesting ---
  const steps = [];
  const blackReplies = [];
  let endsInMate = false;
  let replyActivity = false;
  let replyRecohere = false;
  let state = {
    pieces: rec.pieces,
    sideToMove: 'white',
    captureCounter: rec.captureCounter,
    lastMove: rec.lastMove,
    halfmoveClock: 0,
  };
  let curRec = rec;
  let curAnalysis = analysis;
  for (let k = 0; k < CFG.parPlies; k++) {
    const step = parStep(curRec, stats, curAnalysis);
    curAnalysis = null;
    if (!step) return { probe, chain: null };
    if (k === 0 && isPlainRecapture(step, rec)) { stats.filteredRecapture++; return { probe, chain: null }; }
    if (k > 0 && step.numChoices < CFG.minChoices) { stats.sizeRejects++; return { probe, chain: null }; }
    if (step.trickiness < CFG.minPlyTrick) { stats.dullRejects++; return { probe, chain: null }; }
    steps.push(step);

    const afterWhite = applyReply(state, step.analysisMove);
    if (!afterWhite) return { probe, chain: null };
    if (afterWhite.gameOver) {
      endsInMate = afterWhite.reason === 'checkmate';
      // Mate ON the final par move is a complete 3-mover; earlier means the
      // line is shorter than the format — reject, all puzzles are 3-movers.
      if (k < CFG.parPlies - 1) { stats.shortLineRejects++; return { probe, chain: null }; }
      break;
    }
    state = afterWhite.state;
    if (k === CFG.parPlies - 1) break;

    const blackAnalysis = analyzeRootMoves({
      pieces: state.pieces,
      sideToMove: 'black',
      lastMove: state.lastMove,
      depth: CFG.mineDepth,
      widths: MINE_WIDTHS,
      timeMs: CFG.mineMs,
    });
    if (!blackAnalysis || !blackAnalysis.moves.length) { stats.shortLineRejects++; return { probe, chain: null }; }
    const replyMove = blackAnalysis.moves[0].move;
    const beforeReply = state.pieces;
    const afterBlack = applyReply(state, replyMove);
    if (!afterBlack) return { probe, chain: null };
    if (countPossibilities(afterBlack.state.pieces) < countPossibilities(beforeReply)) replyActivity = true;
    if (regainedIdentity(beforeReply, afterBlack.state.pieces)) replyRecohere = true;
    blackReplies.push({
      type: replyMove.type,
      from: replyMove.type === 'castle' ? replyMove.plan.piece1_from : replyMove.from,
      to: replyMove.type === 'castle' ? replyMove.plan.piece1_to : replyMove.to,
    });
    if (afterBlack.gameOver) { stats.shortLineRejects++; return { probe, chain: null }; }
    state = afterBlack.state;

    curRec = {
      ply: rec.ply + 2 * (k + 1),
      rollout: true,
      sideToMove: 'white',
      pieces: clonePieces(state.pieces),
      captureCounter: state.captureCounter,
      lastMove: state.lastMove,
      played: null,
    };
    if (!positionSane(curRec.pieces) || !censusFixed(curRec.pieces)) { stats.censusBug++; return { probe, chain: null }; }
  }

  // Quantum-ness: cull lines where nothing collapses, decoheres, or
  // recoheres at any ply — classical puzzles in the wrong costume.
  const quantumActive = replyActivity || replyRecohere
    || steps.some((s) => (s.possDelta || 0) > 0 || s.themes.includes('recohere'));
  if (!quantumActive) { stats.filteredClassical++; return { probe, chain: null }; }

  const themes = [...new Set([...steps.flatMap((s) => s.themes), ...(replyRecohere ? ['recohere'] : [])])];
  const trickList = steps.map((s) => s.trickiness);
  const chain = {
    startPly: rec.ply,
    parPlies: steps.length,
    endsInMate,
    // Black's move that opened the door — the puzzle SHOWS this move.
    mistake: {
      from: rec.lastMove.from,
      to: rec.lastMove.to,
      evalBefore: preEval,
      evalAfter: steps[0].parEval,
      swing: Number((steps[0].parEval - preEval).toFixed(2)),
    },
    spread: steps[0].spread,
    parEvals: steps.map((s) => s.parEval),
    trickiness: steps[0].trickiness,
    trickMin: Math.min(...trickList),
    trickAvg: Number((trickList.reduce((a, b) => a + b, 0) / trickList.length).toFixed(2)),
    themes,
    steps: steps.map(({ position, analysisMove, ...s }) => s),
    blackReplies, // engine-best replies, matching the live product
    start: {
      pieces: rec.pieces,
      lastMove: rec.lastMove,
      captureCounter: rec.captureCounter,
      sideToMove: 'white',
    },
    _verify: steps.map((s) => ({ parEval: s.parEval, position: s.position, plyIdx: steps.indexOf(s) })),
  };
  return { probe, chain };
}

function mineGame(game, stats) {
  const chains = [];
  // Probe EVERY white-to-move ply: the balance streak needs the history and
  // the dev game viewer graphs the full eval story of the game.
  const probes = []; // chronological white-to-move probe evals (null = unknown)
  const evals = []; // [{ ply, eval }] for the report/game viewer
  let balancedEligible = 0;
  let found = false;

  for (const rec of game.record) {
    if (rec.sideToMove !== 'white') continue;
    if (!positionSane(rec.pieces)) { stats.insane++; continue; }
    if (!censusFixed(rec.pieces)) {
      stats.censusBug++;
      console.log(`  !! census fixed-point FAILED at game ${game.gameIdx} ply ${rec.ply} — engine bug candidate`);
      continue;
    }
    stats.scanned++;

    // The balance stretch may sit one probe back: two-ply mistakes (seed-3
    // near-misses: 1.0 -> 2.2 -> 4.2) put one developing, out-of-band value
    // between the stretch and the candidate. Core = the stretch; the newest
    // probe may be anything.
    const recent = probes.slice(-(CFG.balanceStreak + 1));
    const core = recent.slice(0, CFG.balanceStreak);
    const preBalanced = core.length >= CFG.balanceStreak
      && core.every((e) => e !== null && Math.abs(e) <= CFG.balanceBand);
    const classicalStart = !rec.pieces.some((p) => !p.captured && (p.possibleTypes || []).length > 1);
    if (classicalStart) stats.filteredClassical++;

    if (!found && rec.ply >= CFG.minPly && preBalanced && !classicalStart && rec.lastMove) {
      balancedEligible++;
      stats.balancedEligible++;
      const inBand = recent.filter((e) => e !== null && Math.abs(e) <= CFG.balanceBand);
      const preEval = inBand.length ? inBand[inBand.length - 1] : core[core.length - 1];
      const { probe, chain } = detectSwingChain(rec, preEval, stats);
      probes.push(probe);
      if (probe !== null) evals.push({ ply: rec.ply, eval: probe, side: 'white' });
      if (chain) {
        chain.game = game.gameIdx;
        chain.white = game.white;
        chain.black = game.black;
        chains.push(chain);
        // The first accepted mistake ends this game's DETECTION (the story
        // of the game IS that moment) — probing continues for the graph.
        found = true;
      }
    } else {
      const probe = probeEval(rec, stats);
      probes.push(probe);
      if (probe !== null) evals.push({ ply: rec.ply, eval: probe, side: 'white' });
    }
  }

  console.log(`  probes: [${probes.map((e) => (e === null ? '?' : e.toFixed(1))).join(', ')}]  balanced-eligible: ${balancedEligible}`);
  return { chains, evals };
}

// -------------------------------------------------------------- verification

// Deep re-search of one par ply: the certified par eval must HOLD at a
// depth above confirm. A deeper search finding a BETTER line only raises
// par (recorded for curation; fidelity may exceed 100% in play) — the
// failure mode the gate exists for is par being an illusion of shallow
// search, i.e. the deep best falling clearly below the mined par.
function verifyParPly(entry, stats) {
  const t0 = performance.now();
  let analysis = null;
  let usedDepth = null;
  for (let d = CFG.verifyDepth; d > CFG.mineDepth && !analysis; d--) {
    analysis = analyzePosition(entry.position, d, VERIFY_WIDTHS, CFG.verifyMs);
    if (analysis) usedDepth = d;
  }
  stats.verifyMsTotal += performance.now() - t0;
  if (!analysis || !analysis.moves.length) return { verdict: 'timeout' };
  const best = analysis.moves[0];
  const parHolds = best.score >= entry.parEval - 1.0;
  const swingHolds = entry.plyIdx > 0 || best.score >= CFG.swingMin - 0.5;
  return {
    verdict: parHolds && swingHolds ? 'agree' : 'disagree',
    depth: usedDepth,
    deepBest: `${best.move.type}:${best.move.from || ''}->${best.move.to || ''}`,
    deepBestScore: Number(best.score.toFixed(2)),
    parHolds, swingHolds,
  };
}

// -------------------------------------------------------------------- main

console.log(`puzzle-miner  games=${CFG.games} seed=${CFG.seed} playMs=${CFG.playMs} mineDepth=${CFG.mineDepth} verifyDepth=${CFG.verifyDepth}`);
console.log(`swing bar: balanced |eval|<=${CFG.balanceBand} for ${CFG.balanceStreak} probes (one developing probe allowed), then best>=${CFG.swingMin} & jump>=${CFG.swingDelta}, medianFrac<${CFG.perishFrac}, ${CFG.minChoices}<=choices<${CFG.maxChoices}, ply>=${CFG.minPly}; par line: ${CFG.parPlies} white moves, every ply trickiness>=${CFG.minPlyTrick}; filters: plain recaptures, classical/inert lines\n`);

const stats = { scanned: 0, swings: 0, balancedEligible: 0, weakSwingRejects: 0, funnelSurvivors: 0, prefilterTimeouts: 0, timeouts: 0, insane: 0, censusBug: 0, sizeRejects: 0, perishRejects: 0, dullRejects: 0, shortLineRejects: 0, confirmRejects: 0, confirmTimeouts: 0, filteredRecapture: 0, filteredClassical: 0, mineMsTotal: 0, verifyMsTotal: 0 };
const games = [];
const allChains = [];
const verifiable = []; // { gameIdx, startPly, entry } for the gate

// Chains stream to disk AS FOUND (one JSON per line), so a multi-hour run's
// finds are inspectable/previewable before the final report exists.
fs.mkdirSync(CFG.outDir, { recursive: true });
const chainStream = path.join(CFG.outDir, `chains-seed${CFG.seed}.ndjson`);
fs.writeFileSync(chainStream, '');

for (let g = 0; g < CFG.games; g++) {
  // Phased handoff (Jasper, 2026-07-09): the opening pair builds a balanced,
  // slightly White-worse position; at handoffPly the controllers swap — the
  // STRONGEST bot takes White to capitalize, a mid-weak bot takes Black to
  // err. Random picks per game keep positional variety.
  let roles;
  if (args.includes('--selfPlay')) {
    // Diagnostic: the same strongest bot everywhere.
    const top = BY_RATING[0];
    roles = { openW: minerBot(top), openB: minerBot(top), mainW: minerBot(top), mainB: minerBot(top) };
  } else {
    const openW = MID_STRONG[Math.floor(rng() * MID_STRONG.length)];
    const mainB = MID_WEAK[Math.floor(rng() * MID_WEAK.length)];
    roles = {
      openW: minerBot(openW),
      openB: minerBot(BY_RATING[0]),
      mainW: minerBot(BY_RATING[0]),
      mainB: minerBot(mainB),
    };
  }

  const t0 = performance.now();
  const game = playGame(g, roles);
  const playSec = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`game ${g}: [open ${game.opening.white} vs ${game.opening.black}] -> ${game.white} vs ${game.black} — ${game.plies} plies, ${game.result.winner || 'draw'} (${game.result.reason}) [${playSec}s]`);
  const t1 = performance.now();
  const mined = mineGame(game, stats);
  games.push({ gameIdx: g, white: game.white, black: game.black, opening: game.opening, plies: game.plies, result: game.result, moves: game.stored, evals: mined.evals });
  const mineSec = ((performance.now() - t1) / 1000).toFixed(1);
  for (const chain of mined.chains) {
    for (const entry of chain._verify) verifiable.push({ gameIdx: g, startPly: chain.startPly, entry });
    const { _verify, ...saved } = chain;
    allChains.push(saved);
    fs.appendFileSync(chainStream, JSON.stringify(saved) + '\n');
    console.log(`  chain @ply ${chain.startPly}: mistake ${chain.mistake.from}->${chain.mistake.to} (${chain.mistake.evalBefore} -> ${chain.mistake.evalAfter})${chain.endsInMate ? ' +mate' : ''} par=[${chain.parEvals.join(', ')}] medianFrac=${chain.spread.medianFrac} trick=${chain.trickiness}/min${chain.trickMin} themes=[${chain.themes.join(',')}]`);
  }
  console.log(`  mined ${mined.chains.length} chain(s) from ${game.record.filter((r) => r.sideToMove === 'white' && r.ply >= CFG.minPly).length} white positions [${mineSec}s]`);
}

// GATE: par must hold under a deeper, independent search (capped).
console.log(`\n--- verification gate: re-searching ${Math.min(verifiable.length, CFG.verifyCap)} par plies at depth ${CFG.verifyDepth} ---`);
let agreed = 0;
let checked = 0;
let vTimeouts = 0;
const verdicts = [];
for (const { gameIdx, startPly, entry } of verifiable.slice(0, CFG.verifyCap)) {
  const v = verifyParPly(entry, stats);
  if (v.verdict === 'timeout') { vTimeouts++; continue; }
  checked++;
  if (v.verdict === 'agree') agreed++;
  verdicts.push({ game: gameIdx, startPly, plyIdx: entry.plyIdx, parEval: entry.parEval, ...v });
  if (v.verdict === 'disagree') {
    console.log(`  DISAGREE game ${gameIdx} chain@${startPly} ply ${entry.plyIdx}: par ${entry.parEval} vs deep ${v.deepBest} (${v.deepBestScore}) parHolds=${v.parHolds} swingHolds=${v.swingHolds}`);
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
    balancedEligiblePositions: stats.balancedEligible,
    swingsConfirmed: stats.swings,
    chains: allChains.length,
    rejects: {
      weakSwing: stats.weakSwingRejects,
      size: stats.sizeRejects,
      perishability: stats.perishRejects,
      depthConfirm: stats.confirmRejects,
      dullPly: stats.dullRejects,
      shortLine: stats.shortLineRejects,
      plainRecapture: stats.filteredRecapture,
      classicalOrInert: stats.filteredClassical,
    },
    depthConfirmTimeouts: stats.confirmTimeouts,
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
console.log(`white positions scanned: ${stats.scanned}  (avg ${report.stats.avgMineMsPerPosition}ms each; probe survivors: ${stats.funnelSurvivors}; timeouts: ${stats.prefilterTimeouts} probe / ${stats.timeouts} deep)`);
console.log(`balance-window positions: ${stats.balancedEligible}; swings confirmed: ${stats.swings}  -> chains kept: ${allChains.length} (all ${CFG.parPlies}-movers)`);
console.log(`rejects: ${stats.weakSwingRejects} weak swing, ${stats.perishRejects} not perishable, ${stats.sizeRejects} size, ${stats.confirmRejects} depth-confirm, ${stats.dullRejects} dull ply, ${stats.shortLineRejects} short line, ${stats.filteredRecapture} plain recaptures, ${stats.filteredClassical} classical/inert`);
console.log(`census fixed-point failures (engine-bug detector): ${stats.censusBug}`);
console.log(`GATE — par holds at depth ${CFG.verifyDepth}: ${agreed}/${checked} = ${rate.toFixed(1)}%  (need 95%+ to feed mined puzzles into rotation)${vTimeouts ? `, ${vTimeouts} verify timeouts` : ''}`);
console.log(`report: ${outFile}`);
process.exit(0);
