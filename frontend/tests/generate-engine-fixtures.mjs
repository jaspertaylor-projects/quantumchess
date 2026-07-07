// frontend/tests/generate-engine-fixtures.mjs
// Purpose: One-time (re)generator for the engine replay regression fixtures.
// Plays seeded pseudo-random games through the real engine, records the moves
// in the exact stored format gameSlice.js uses for qc_games.moves, and pins
// what buildReviewTimeline produces for them today. The paired test replays
// the fixtures and fails if any future engine change alters the outcome.
//
// Run inside the dev container (node has no host install here):
//   docker exec -u 1000:1000 -w /app quantumchess-frontend-1 \
//     node tests/generate-engine-fixtures.mjs
//
// Regenerating REPLACES the pinned behavior — only do that when an engine
// rules change is intentional, and say so in the commit message.
//
// Imports From: ../src/review/replayCore.js, ../src/chessboard/quantumEngine.js, ./fixtureUtil.mjs
// Exported To: None (writes ./fixtures/engine-games.json)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReviewTimeline } from '../src/review/replayCore.js';
import { generateLegalReplies } from '../src/chessboard/quantumEngine.js';
import { hashSig, mulberry32 } from './fixtureUtil.mjs';

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'engine-games.json');
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const MAX_HALFMOVES = 90;
// Castles and en passant are rare under uniform random play; bias toward them
// so the fixture set is guaranteed to exercise both replay paths.
const SPECIAL_MOVE_BIAS = 0.7;

function pickReply(replies, rng) {
  const specials = replies.filter((r) => r.type !== 'move');
  const pool = specials.length > 0 && rng() < SPECIAL_MOVE_BIAS ? specials : replies;
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

const fixtures = [];
let totalEp = 0;
let totalCastles = 0;

for (const seed of SEEDS) {
  const rng = mulberry32(seed * 2654435761);
  const moves = [];
  let timeline = buildReviewTimeline(moves);
  let snap = timeline.snapshots[timeline.snapshots.length - 1];
  let halfmoves = 0;

  while (!snap.gameOver && halfmoves < MAX_HALFMOVES) {
    const replies = generateLegalReplies(snap.pieces, snap.sideToMove, snap.captureCounter, snap.lastMove);
    if (replies.length === 0) break;
    const reply = pickReply(replies, rng);
    moves.push(...recordsFor(reply, snap.sideToMove));

    timeline = buildReviewTimeline(moves);
    if (timeline.incomplete) {
      throw new Error(
        `seed ${seed}: engine-legal ${reply.type} ${reply.from ?? 'castle'}→${reply.to ?? ''} ` +
        'did not replay — generateLegalReplies and replayCore disagree; fix that before generating fixtures',
      );
    }
    snap = timeline.snapshots[timeline.snapshots.length - 1];
    halfmoves += 1;
  }

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
      captureCounter: snap.captureCounter,
      gameOver: snap.gameOver,
      winner: snap.winner,
      gameOverReason: snap.gameOverReason,
    },
  });
  console.log(
    `seed ${String(seed).padStart(2)}: ${timeline.snapshots.length - 1} half-moves, ` +
    `${epCount} ep, ${castleCount} castles, ` +
    `${snap.gameOver ? `over (${snap.gameOverReason}, winner=${snap.winner})` : 'cut off'}`,
  );
}

if (totalEp === 0) throw new Error('fixture set has no en passant capture — raise SPECIAL_MOVE_BIAS or add seeds');
if (totalCastles === 0) throw new Error('fixture set has no castle — raise SPECIAL_MOVE_BIAS or add seeds');

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(fixtures, null, 1)}\n`);
console.log(`\nwrote ${fixtures.length} games (${totalEp} ep, ${totalCastles} castles) to ${OUT_PATH}`);
