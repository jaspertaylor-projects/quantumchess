// frontend/tests/engineReplay.test.js
// Purpose: Regression net for the deterministic engine + replay path that the
// premium game-review feature (and saved-game storage) depend on. Replays 20
// pre-recorded pseudo-random games (fixtures/engine-games.json, produced by
// generate-engine-fixtures.mjs) through buildReviewTimeline and asserts the
// outcome is bit-for-bit what it was when the fixtures were generated, plus
// rule invariants on every intermediate position. If an engine change breaks
// this on purpose, regenerate the fixtures and say so in the commit.
// Imports From: ../src/review/replayCore.js, ./fixtureUtil.mjs, ./fixtures/engine-games.json
// Exported To: None (vitest)

import { describe, expect, it } from 'vitest';

import { buildReviewTimeline } from '../src/review/replayCore.js';
import { hashSig } from './fixtureUtil.mjs';
import fixtures from './fixtures/engine-games.json';

describe('engine replay fixtures', () => {
  it('fixture set exercises castling and en passant', () => {
    const allMoves = fixtures.flatMap((f) => f.moves);
    expect(allMoves.some((m) => m.castle)).toBe(true);
    expect(allMoves.some((m) => m.enPassant)).toBe(true);
    expect(fixtures.some((f) => f.expected.gameOver)).toBe(true);
  });

  for (const { seed, moves, expected } of fixtures) {
    describe(`seed ${seed} (${moves.length} stored half-moves)`, () => {
      const timeline = buildReviewTimeline(moves);

      it('replays completely and reproduces the recorded outcome', () => {
        expect(timeline.incomplete).toBe(false);
        expect(timeline.snapshots.length).toBe(expected.snapshotCount);

        const final = timeline.snapshots[timeline.snapshots.length - 1];
        expect(final.captureCounter).toBe(expected.captureCounter);
        expect(final.gameOver).toBe(expected.gameOver);
        expect(final.winner).toBe(expected.winner);
        expect(final.gameOverReason).toBe(expected.gameOverReason);
      });

      it('reproduces every intermediate position signature', () => {
        expect(timeline.snapshots.map((s) => hashSig(s.positionSig))).toEqual(expected.sigHashes);
      });

      it('is deterministic across replays', () => {
        const again = buildReviewTimeline(moves);
        expect(again.snapshots.map((s) => s.positionSig))
          .toEqual(timeline.snapshots.map((s) => s.positionSig));
      });

      it('holds rule invariants at every snapshot', () => {
        for (const snap of timeline.snapshots) {
          // Piece conservation: nothing is ever created or destroyed, only captured.
          expect(snap.pieces).toHaveLength(32);
          expect(snap.pieces.filter((p) => p.side === 'white')).toHaveLength(16);
          expect(snap.pieces.filter((p) => p.side === 'black')).toHaveLength(16);

          const alive = snap.pieces.filter((p) => !p.captured);
          // Every live piece is somewhere, is something, and squares are exclusive.
          const squares = new Set();
          for (const p of alive) {
            expect(typeof p.square).toBe('string');
            expect(squares.has(p.square)).toBe(false);
            squares.add(p.square);
            expect(Array.isArray(p.possibleTypes)).toBe(true);
            expect(p.possibleTypes.length).toBeGreaterThan(0);
          }

          // While the game is live, both sides must still be able to hold a king.
          if (!snap.gameOver) {
            for (const side of ['white', 'black']) {
              const holders = alive.filter((p) => p.side === side && p.possibleTypes.includes('k'));
              expect(holders.length).toBeGreaterThan(0);
            }
          }
        }
      });
    });
  }
});
