// frontend/tests/generate-engine-fixtures.mjs
// Purpose: One-time (re)generator for the engine replay regression fixtures.
// Plays seeded pseudo-random games through the real engine, records the moves
// in the exact stored format gameSlice.js uses for qc_games.moves, and pins
// what buildReviewTimeline produces for them today. The paired test replays
// the fixtures and fails if any future engine change alters the outcome.
//
// Generation advances state incrementally (like live play does) through the
// shared advanceCore, and only the final buildReviewTimeline call defines
// the expected values — so the pinned expectations are exactly the replay
// path's output, and generation stays O(n) per game. Run inside the dev
// container (no host node install here):
//   docker exec -u 1000:1000 -w /app quantumchess-frontend-1 \
//     node tests/generate-engine-fixtures.mjs
//
// Regenerating REPLACES the pinned behavior — only do that when an engine
// rules change is intentional, and say so in the commit message.
//
// Imports From: ../src/review/replayCore.js, ../src/chessboard/advanceCore.js,
//   ../src/chessboard/quantumEngine.js, ./fixtureUtil.mjs
// Exported To: None (writes ./fixtures/engine-games.json)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReviewTimeline } from '../src/review/replayCore.js';
import { advanceEntry, makeInitialSnapshot } from '../src/chessboard/advanceCore.js';
import { generateLegalReplies } from '../src/chessboard/quantumEngine.js';
import { hashSig, mulberry32 } from './fixtureUtil.mjs';

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'engine-games.json');
const SEEDS = Array.from({ length: 13 }, (_, i) => i + 1);
// Random games can run deep before checkmate or a draw, so the cap
// must sit comfortably above that for the set to include finished games.
const MAX_HALFMOVES = 140;
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

// The stored/relayed entry shape advanceCore replays — generation advances
// through the exact same path the review replay uses, so a mismatch is
// impossible by construction (the buildReviewTimeline check below is now a
// belt-and-braces assertion).
function entryFor(reply) {
  if (reply.type === 'castle') {
    return { type: 'castle', piece1_from: reply.plan.piece1_from, piece2_from: reply.plan.piece2_from };
  }
  return { type: 'move', from: reply.from, to: reply.to, enPassant: reply.type === 'enpassant' };
}

const fixtures = [];
let totalEp = 0;
let totalCastles = 0;

for (const seed of SEEDS) {
  const rng = mulberry32(seed * 2654435761);
  const moves = [];
  let snap = makeInitialSnapshot();
  const snaps = [snap];

  const script = SCRIPTED_OPENINGS[seed] || [];

  for (let halfmoves = 0; halfmoves < MAX_HALFMOVES && !snap.gameOver; halfmoves += 1) {
    const replies = generateLegalReplies(snap.pieces, snap.sideToMove, snap.captureCounter, snap.lastMove);
    if (replies.length === 0) break;
    let reply;
    if (halfmoves < script.length) {
      const [from, to] = script[halfmoves];
      reply = replies.find((r) => r.type === 'move' && r.from === from && r.to === to);
      if (!reply) throw new Error(`seed ${seed}: scripted opening move ${from}→${to} is not legal`);
    } else {
      reply = pickReply(replies, rng);
    }
    moves.push(...recordsFor(reply, snap.sideToMove));
    const adv = advanceEntry(snap, entryFor(reply), snaps);
    if (!adv.ok) {
      throw new Error(
        `seed ${seed}: an engine-legal move did not replay — ` +
        'generateLegalReplies and advanceCore disagree; fix that before generating fixtures',
      );
    }
    snap = adv.snap;
    snaps.push(snap);
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
