// tools/miner/gameplay.mjs
// Purpose: Bot self-play for the miner — applyReply (the shared
// generateLegalReplies -> moveOutcome advance), miner-bot construction
// (personality weights, blunder noise forced off), the phased-handoff role
// pools, and the game loop with threefold detection. Split out of
// puzzle-miner.mjs.
// Imports From: ./config.mjs, ../../frontend/src/chessboard/*, ../../frontend/src/ai/*
// Exported To: ../puzzle-miner.mjs, ./swing.mjs

import { createStartingPieces } from '../../frontend/src/chessboard/gameConstants.js';
import {
  clonePieces,
  computePositionSignature,
  otherSide,
  simulateCastle,
  simulateEnPassant,
  simulateStandardMove,
} from '../../frontend/src/chessboard/quantumEngine.js';
import { moveOutcome } from '../../frontend/src/chessboard/advanceCore.js';
import { searchBestMove } from '../../frontend/src/ai/alphaBetaEngine.js';
import { BOTS } from '../../frontend/src/ai/bots.js';
import { CFG } from './config.mjs';

// -------------------------------------------------------------- game loop


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
// noise FORCED OFF, and think time set by --playMs (the strongest bot's
// seats pass --strongMs instead). Swing mining wants
// strong-vs-stronger: balanced positions where the mistakes that do happen
// are subtle and worth punishing — a weak bot's queen-hang produces mop-up
// puzzles, which is exactly what the seed-3/4/5 era taught us to avoid.
function minerBot(rosterBot, timeMs = CFG.playMs) {
  return {
    id: rosterBot.id,
    tier: rosterBot.tier,
    weights: rosterBot.weights || {},
    search: { ...(rosterBot.search || {}), noise: 0, timeMs },
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

export { applyReply, minerBot, BY_RATING, MID_STRONG, MID_WEAK, playGame };
