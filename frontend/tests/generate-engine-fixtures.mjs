// frontend/tests/generate-engine-fixtures.mjs
// Purpose: One-time (re)generator for the engine replay regression fixtures.
// Plays seeded pseudo-random games through the real engine, records the moves
// in the exact stored format gameSlice.js uses for qc_games.moves, and pins
// what buildReviewTimeline produces for them today. The paired test replays
// the fixtures and fails if any future engine change alters the outcome.
//
// Generation advances state incrementally (like live play does) and only the
// final buildReviewTimeline call defines the expected values — so the pinned
// expectations are exactly the replay path's output, and generation stays
// O(n) per game. Run inside the dev container (no host node install here):
//   docker exec -u 1000:1000 -w /app quantumchess-frontend-1 \
//     node tests/generate-engine-fixtures.mjs
//
// Regenerating REPLACES the pinned behavior — only do that when an engine
// rules change is intentional, and say so in the commit message.
//
// Imports From: ../src/review/replayCore.js, ../src/chessboard/quantumEngine.js,
//   ../src/chessboard/gameConstants.js, ../src/chessboard/boardUtils.js, ./fixtureUtil.mjs
// Exported To: None (writes ./fixtures/engine-games.json)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReviewTimeline } from '../src/review/replayCore.js';
import {
  applyQuantumConstraints,
  buildOccupancy,
  evaluateTerminalAfterMove,
  generateLegalReplies,
} from '../src/chessboard/quantumEngine.js';
import { createStartingPieces } from '../src/chessboard/gameConstants.js';
import { fromAlgebraic, toAlgebraic } from '../src/chessboard/boardUtils.js';
import { hashSig, mulberry32 } from './fixtureUtil.mjs';

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'engine-games.json');
const SEEDS = Array.from({ length: 13 }, (_, i) => i + 1);
const MAX_HALFMOVES = 60;
// Castles are rare under uniform random play; bias toward them so the fixture
// set is guaranteed to exercise that replay path.
const SPECIAL_MOVE_BIAS = 0.7;

// En passant windows are a single half-move wide and essentially never arise
// from random play, so one seed opens with the classic setup (e4, a6, e5, d5
// leaves white an e5xd6 en passant) and pickReply always takes an available
// en passant capture.
const SCRIPTED_OPENINGS = {
  13: [
    ['e2', 'e4'],
    ['a7', 'a6'],
    ['e4', 'e5'],
    ['d7', 'd5'],
  ],
};

function pickReply(replies, rng) {
  const eps = replies.filter((r) => r.type === 'enpassant');
  if (eps.length > 0) return eps[Math.floor(rng() * eps.length)];
  const castles = replies.filter((r) => r.type === 'castle');
  const pool = castles.length > 0 && rng() < SPECIAL_MOVE_BIAS ? castles : replies;
  return pool[Math.floor(rng() * pool.length)];
}

// Mirror gameSlice.js recording exactly: { from, to, side, enPassant } per
// half-move, castle as two records both flagged castle: true.
function recordsFor(reply, side) {
  if (reply.type === 'castle') {
    const { plan } = reply;
    return [
      { from: plan.piece1_from, to: plan.piece1_to, side, enPassant: false, castle: true },
      { from: plan.piece2_from, to: plan.piece2_to, side, enPassant: false, castle: true },
    ];
  }
  return [{ from: reply.from, to: reply.to, side, enPassant: reply.type === 'enpassant' }];
}

// Advance generation state by one chosen reply. Only what move generation
// consumes needs to be right here (pieces, capture count, the en passant
// window on lastMove); the authoritative snapshots come from the final
// buildReviewTimeline over the recorded moves.
function advance(state, reply) {
  const { pieces, side } = state;
  let nextPieces;
  let lastMove;

  if (reply.type === 'castle') {
    nextPieces = applyQuantumConstraints(reply.resultPieces);
    lastMove = {
      side,
      pieceId: reply.plan.piece1_id,
      from: reply.plan.piece1_from,
      to: reply.plan.piece1_to,
      isDoubleStep: false,
      crossedSquare: null,
      measuredSquares: [],
    };
  } else {
    nextPieces = reply.resultPieces;
    const mover = buildOccupancy(pieces).get(reply.from);
    lastMove = {
      side,
      pieceId: mover ? mover.id : null,
      from: reply.from,
      to: reply.to,
      isDoubleStep: false,
      crossedSquare: null,
      measuredSquares: [],
    };
    // Double-step detection (mirrors replayCore) so en passant windows open
    // during generation just like they do on replay.
    if (reply.type === 'move' && mover && (mover.moveCount || 0) === 0) {
      const fromPos = fromAlgebraic(reply.from);
      const toPos = fromAlgebraic(reply.to);
      const dir = side === 'white' ? 1 : -1;
      const movedFinal = nextPieces.find((p) => p.id === mover.id && !p.captured) || null;
      if (
        fromPos && toPos && movedFinal &&
        fromPos.fileIndex === toPos.fileIndex &&
        toPos.rankIndex - fromPos.rankIndex === 2 * dir &&
        movedFinal.possibleTypes.includes('p')
      ) {
        lastMove.isDoubleStep = true;
        lastMove.crossedSquare = toAlgebraic(fromPos.fileIndex, fromPos.rankIndex + dir);
      }
    }
  }

  const captureCounter = nextPieces.filter((p) => p.captured).length;
  const terminal = evaluateTerminalAfterMove(nextPieces, side, captureCounter, lastMove);
  return {
    pieces: nextPieces,
    side: side === 'white' ? 'black' : 'white',
    captureCounter,
    lastMove,
    terminal,
  };
}

const fixtures = [];
let totalEp = 0;
let totalCastles = 0;

for (const seed of SEEDS) {
  const rng = mulberry32(seed * 2654435761);
  const moves = [];
  let state = {
    pieces: createStartingPieces(),
    side: 'white',
    captureCounter: 0,
    lastMove: null,
    terminal: null,
  };

  const script = SCRIPTED_OPENINGS[seed] || [];

  for (let halfmoves = 0; halfmoves < MAX_HALFMOVES && !state.terminal; halfmoves += 1) {
    const replies = generateLegalReplies(state.pieces, state.side, state.captureCounter, state.lastMove);
    if (replies.length === 0) break;
    let reply;
    if (halfmoves < script.length) {
      const [from, to] = script[halfmoves];
      reply = replies.find((r) => r.type === 'move' && r.from === from && r.to === to);
      if (!reply) throw new Error(`seed ${seed}: scripted opening move ${from}→${to} is not legal`);
    } else {
      reply = pickReply(replies, rng);
    }
    moves.push(...recordsFor(reply, state.side));
    state = advance(state, reply);
  }

  // The replay path is the single source of truth for the expectations.
  const timeline = buildReviewTimeline(moves);
  if (timeline.incomplete) {
    throw new Error(
      `seed ${seed}: an engine-legal move did not replay — ` +
      'generateLegalReplies and replayCore disagree; fix that before generating fixtures',
    );
  }
  const final = timeline.snapshots[timeline.snapshots.length - 1];

  const epCount = moves.filter((m) => m.enPassant).length;
  const castleCount = moves.filter((m) => m.castle).length / 2;
  totalEp += epCount;
  totalCastles += castleCount;

  fixtures.push({
    seed,
    moves,
    expected: {
      snapshotCount: timeline.snapshots.length,
      sigHashes: timeline.snapshots.map((s) => hashSig(s.positionSig)),
      captureCounter: final.captureCounter,
      gameOver: final.gameOver,
      winner: final.winner,
      gameOverReason: final.gameOverReason,
    },
  });
  console.log(
    `seed ${String(seed).padStart(2)}: ${timeline.snapshots.length - 1} replayed half-moves, ` +
    `${epCount} ep, ${castleCount} castles, ` +
    `${final.gameOver ? `over (${final.gameOverReason}, winner=${final.winner})` : 'cut off'}`,
  );
}

if (totalEp === 0) throw new Error('fixture set has no en passant capture — raise SPECIAL_MOVE_BIAS or add seeds');
if (totalCastles === 0) throw new Error('fixture set has no castle — raise SPECIAL_MOVE_BIAS or add seeds');

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(fixtures, null, 1)}\n`);
console.log(`\nwrote ${fixtures.length} games (${totalEp} ep, ${totalCastles} castles) to ${OUT_PATH}`);
