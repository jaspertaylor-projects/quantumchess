// frontend/tests/fastEngineDiff.test.js
// Purpose: The differential net under the fast (packed/journaled) engine.
// The reference engine is ground truth; at real positions sampled from every
// fixture game the fast engine must agree EXACTLY: same legal moves in the
// same order, identical resulting positions (masks, flags, moveCount,
// captureIndex), bit-identical evaluation scores, perfect journal rollback
// (undo assertion), and identical search results (move, score, depth, node
// count) at fixed depth. Any intentional rules change that regenerates the
// fixtures re-certifies the fast engine automatically through this file.
// Imports From: ../src/review/replayCore.js, ../src/chessboard/quantumEngine.js,
//   ../src/ai/alphaBetaEngine.js, ../src/ai/fast/*, ./fixtures/engine-games.json
// Exported To: None (vitest)

import { describe, expect, it } from 'vitest';

import { buildReviewTimeline } from '../src/review/replayCore.js';
import { generateLegalReplies } from '../src/chessboard/quantumEngine.js';
import { evaluatePosition, searchBestMove, analyzeRootMoves, DEFAULT_WEIGHTS } from '../src/ai/alphaBetaEngine.js';
import {
  packBoard, unpackBoard, snapshotWords, wordsEqual, setFastDebug,
  ALGEBRAIC, BLACK,
} from '../src/ai/fast/fastBoard.js';
import { forEachLegalReply } from '../src/ai/fast/fastRules.js';
import { evaluateFast } from '../src/ai/fast/fastEval.js';
import { searchBestMoveFast, analyzeRootMovesFast, epFromLastMove } from '../src/ai/fast/fastSearch.js';
import fixtures from './fixtures/engine-games.json';

setFastDebug(true);

const sideBitOf = (s) => (s === 'black' ? BLACK : 0);

// Positions sampled from every fixture game (every 3rd ply): the same corpus
// family the perf benchmark uses, but denser.
function corpus() {
  const out = [];
  for (const { seed, moves } of fixtures) {
    const { snapshots } = buildReviewTimeline(moves);
    for (let ply = 0; ply < snapshots.length; ply += 3) {
      const snap = snapshots[ply];
      if (snap.gameOver) continue;
      out.push({ id: `seed${seed}@${ply}`, pieces: snap.pieces, sideToMove: snap.sideToMove, lastMove: snap.lastMove });
    }
  }
  return out;
}
const POSITIONS = corpus();

// The heavy sweeps run for minutes; yield to the event loop periodically so
// the vitest worker can answer RPC pings (otherwise the run reports an
// unhandled onTaskUpdate timeout and exits nonzero despite passing tests).
const tick = () => new Promise((resolve) => setImmediate(resolve));

// Compare a reference piece against an unpacked fast piece on every field the
// reference engine produces.
function expectPieceEqual(fast, ref, ctx) {
  expect(fast.id, ctx).toBe(ref.id);
  expect(fast.side, ctx).toBe(ref.side);
  expect(fast.square, ctx).toBe(ref.captured ? null : ref.square);
  expect(fast.captured, ctx).toBe(Boolean(ref.captured));
  expect(fast.possibleTypes, ctx).toEqual(ref.possibleTypes);
  expect(fast.baseTypes, ctx).toEqual(Array.isArray(ref.baseTypes) ? ref.baseTypes : ref.possibleTypes);
  expect(fast.promoTypes, ctx).toEqual(Array.isArray(ref.promoTypes) ? ref.promoTypes : []);
  expect(fast.moveCount, ctx).toBe(ref.moveCount || 0);
  expect(Boolean(fast.wasPromoted), ctx).toBe(Boolean(ref.wasPromoted));
  expect(Boolean(fast.castled), ctx).toBe(Boolean(ref.castled));
  expect(fast.captureIndex, ctx).toBe(ref.captureIndex);
}

function descKey(desc, bd) {
  if (desc.kind === 'castle') {
    return `castle:${ALGEBRAIC[desc.plan.from1]}>${ALGEBRAIC[desc.plan.to1]}:${ALGEBRAIC[desc.plan.from2]}>${ALGEBRAIC[desc.plan.to2]}`;
  }
  return `${desc.kind}:${ALGEBRAIC[desc.from]}>${ALGEBRAIC[desc.to]}`;
}

function refKey(mv) {
  if (mv.type === 'castle') {
    return `castle:${mv.plan.piece1_from}>${mv.plan.piece1_to}:${mv.plan.piece2_from}>${mv.plan.piece2_to}`;
  }
  return `${mv.type}:${mv.from}>${mv.to}`;
}

describe('fast engine differential net', () => {
  it(`corpus covers all fixture games (${POSITIONS.length} positions)`, () => {
    expect(POSITIONS.length).toBeGreaterThan(100);
  });

  it('pack/unpack roundtrip is lossless', () => {
    for (const pos of POSITIONS) {
      const bd = packBoard(pos.pieces);
      const back = unpackBoard(bd);
      for (let i = 0; i < pos.pieces.length; i++) {
        expectPieceEqual(back[i], pos.pieces[i], `${pos.id} piece ${i}`);
      }
    }
  });

  it('legal replies match: order, moves, resulting positions, undo', async () => {
    let n = 0;
    for (const pos of POSITIONS) {
      if ((n += 1) % 10 === 0) await tick();
      const ref = generateLegalReplies(pos.pieces, pos.sideToMove, 0, pos.lastMove);
      const bd = packBoard(pos.pieces);
      const before = snapshotWords(bd);
      const side = sideBitOf(pos.sideToMove);

      const fastMoves = [];
      forEachLegalReply(bd, side, epFromLastMove(bd, pos.lastMove), (desc) => {
        const moveBumps = new Map([[desc.pieceIdx, 1]]);
        if (desc.kind === 'castle') moveBumps.set(desc.plan.i2, 1);
        const captureIndexFor = new Map();
        if (desc.victimIdx >= 0) captureIndexFor.set(desc.victimIdx, 0);
        fastMoves.push({
          key: descKey(desc, bd),
          victimId: desc.kind === 'enpassant' ? bd.ids[desc.victimIdx] : undefined,
          result: unpackBoard(bd, { moveBumps, captureIndexFor }),
          evalScore: evaluateFast(bd, DEFAULT_WEIGHTS),
        });
      });

      // Undo assertion: the full generation walk must restore the board.
      expect(wordsEqual(bd.words, before), `${pos.id} board restored`).toBe(true);
      expect(bd.journal.length, `${pos.id} journal drained`).toBe(0);

      expect(fastMoves.length, `${pos.id} reply count`).toBe(ref.length);
      for (let m = 0; m < ref.length; m++) {
        const ctx = `${pos.id} move ${m} (${refKey(ref[m])})`;
        expect(fastMoves[m].key, ctx).toBe(refKey(ref[m]));
        if (ref[m].type === 'enpassant') expect(fastMoves[m].victimId, ctx).toBe(ref[m].victimId);
        for (let i = 0; i < ref[m].resultPieces.length; i++) {
          expectPieceEqual(fastMoves[m].result[i], ref[m].resultPieces[i], `${ctx} piece ${i}`);
        }
        // Bit-identical evaluation of the child position.
        expect(fastMoves[m].evalScore, `${ctx} eval`).toBe(evaluatePosition(ref[m].resultPieces, DEFAULT_WEIGHTS));
      }
    }
  // Shared CI runners have taken ~119 seconds here. Keep every assertion,
  // but allow runner-speed variation; this is correctness, not a benchmark.
  }, 300000);

  it('root evaluation is bit-identical', () => {
    for (const pos of POSITIONS) {
      const bd = packBoard(pos.pieces);
      expect(evaluateFast(bd, DEFAULT_WEIGHTS), pos.id).toBe(evaluatePosition(pos.pieces, DEFAULT_WEIGHTS));
    }
  });

  it('searchBestMove matches at fixed depth 2 (move, score, depth, nodes)', async () => {
    for (let k = 0; k < POSITIONS.length; k += 6) {
      const pos = POSITIONS[k];
      await tick();
      const opts = {
        pieces: pos.pieces,
        sideToMove: pos.sideToMove,
        lastMove: pos.lastMove,
        bot: { search: { maxDepth: 2, widths: [16, 8], timeMs: 600000, noise: 0 } },
        openingVariety: false,
        adaptiveDepth: false,
      };
      const ref = searchBestMove(opts);
      const fast = searchBestMoveFast(opts);
      const ctx = pos.id;
      expect(fast.depth, ctx).toBe(ref.depth);
      expect(fast.nodes, ctx).toBe(ref.nodes);
      expect(fast.score, ctx).toBe(ref.score);
      if (ref.move === null) {
        expect(fast.move, ctx).toBeNull();
      } else {
        expect(refKey(fast.move), ctx).toBe(refKey(ref.move));
        for (let i = 0; i < ref.move.resultPieces.length; i++) {
          expectPieceEqual(fast.move.resultPieces[i], ref.move.resultPieces[i], `${ctx} result piece ${i}`);
        }
      }
    }
  }, 300000);

  it('searchBestMove matches at depth 3 on a spot-check set', async () => {
    for (const id of ['seed1@33', 'seed2@33', 'seed1@60', 'seed3@21']) {
      const pos = POSITIONS.find((p) => p.id === id);
      if (!pos) continue;
      await tick();
      const opts = {
        pieces: pos.pieces,
        sideToMove: pos.sideToMove,
        lastMove: pos.lastMove,
        bot: { search: { maxDepth: 3, widths: [12, 8, 6], timeMs: 600000, noise: 0 } },
        openingVariety: false,
        adaptiveDepth: false,
      };
      const ref = searchBestMove(opts);
      const fast = searchBestMoveFast(opts);
      expect(fast.nodes, id).toBe(ref.nodes);
      expect(fast.score, id).toBe(ref.score);
      expect(refKey(fast.move), id).toBe(refKey(ref.move));
    }
  }, 300000);

  it('analyzeRootMoves matches at depth 2 on a spot-check set', async () => {
    for (let k = 0; k < POSITIONS.length; k += 24) {
      const pos = POSITIONS[k];
      await tick();
      const opts = {
        pieces: pos.pieces,
        sideToMove: pos.sideToMove,
        lastMove: pos.lastMove,
        depth: 2,
        widths: [64, 10],
        timeMs: Infinity,
      };
      const ref = analyzeRootMoves(opts);
      const fast = analyzeRootMovesFast(opts);
      const ctx = pos.id;
      expect(fast.nodes, ctx).toBe(ref.nodes);
      expect(fast.moves.length, ctx).toBe(ref.moves.length);
      for (let m = 0; m < ref.moves.length; m++) {
        expect(fast.moves[m].score, `${ctx} move ${m}`).toBe(ref.moves[m].score);
        expect(refKey(fast.moves[m].move), `${ctx} move ${m}`).toBe(refKey(ref.moves[m].move));
      }
    }
  }, 300000);
});
