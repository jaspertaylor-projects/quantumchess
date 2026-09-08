import { describe, expect, it } from 'vitest';
import data from '../src/puzzle/minedPreviewData.json';
import { buildMinedPuzzle, isDailyCandidate, loadDailyMinedPuzzle } from '../src/puzzle/minedPreview.js';
import { advanceEntry } from '../src/chessboard/advanceCore.js';
import { computePositionSignature, generateLegalReplies, isCensusConsistent } from '../src/chessboard/quantumEngine.js';

const signature = (state) => computePositionSignature(state.pieces, state.sideToMove, state.lastMove || null);
const released = data.chains.filter((chain) => chain.provenance?.seed === 16);

function advance(state, move) {
  expect(generateLegalReplies(state.pieces, state.sideToMove, state.captureCounter, state.lastMove)).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: move.type, from: move.from, to: move.to })]),
  );
  const result = advanceEntry(state, move);
  expect(result.ok).toBe(true);
  for (const side of ['white', 'black']) expect(isCensusConsistent(result.snap.pieces, side)).toBe(true);
  return result.snap;
}

describe('September puzzle release', () => {
  it('releases three distinct, fully verified puzzles', () => {
    expect(released).toHaveLength(3);
    for (const chain of released) {
      expect(isDailyCandidate(chain)).toBe(true);
      expect(chain.verification).toMatchObject({ status: 'verified', required: 3, attempted: 3 });
      expect(chain.verification.verdicts).toHaveLength(3);
      chain.verification.verdicts.forEach((verdict, plyIdx) => {
        expect(verdict).toMatchObject({ plyIdx, verdict: 'agree', depth: 8, parHolds: true, swingHolds: true });
      });
      expect(data.chains.filter((candidate) => signature(candidate.start) === signature(chain.start))).toHaveLength(1);
    }
  });

  for (const chain of released) {
    it(`replays seed 16/${chain.provenance.chainIndex}, including the intro, replies and complete gauge tables`, () => {
      let state = advance({ ...chain.intro, sideToMove: 'black' }, { type: 'move', ...chain.mistake });
      expect(signature(state)).toBe(signature(chain.start));
      state = chain.start;
      chain.steps.forEach((step, index) => {
        const table = chain.evalTables[index];
        expect(table.sig).toBe(signature(state));
        const legalKeys = generateLegalReplies(state.pieces, 'white', state.captureCounter, state.lastMove)
          .filter((move) => ['move', 'enpassant'].includes(move.type))
          .map((move) => `${move.from}>${move.to}${move.type === 'enpassant' ? 'ep' : ''}`);
        expect(Object.keys(table.evals).sort()).toEqual(legalKeys.sort());
        expect(Object.values(table.evals).every(Number.isFinite)).toBe(true);
        state = advance(state, step.bestMove);
        if (index < chain.steps.length - 1) state = advance(state, chain.blackReplies[index]);
      });
    });
  }

  it('serves the new puzzles on their scheduled dates without falling back', async () => {
    for (const date of ['2026-09-09', '2026-09-10', '2026-09-11']) {
      const idx = data.schedule[date];
      expect(data.chains[idx].provenance.seed).toBe(16);
      const direct = buildMinedPuzzle(data.chains[idx], idx, { date, isDaily: true });
      const daily = await loadDailyMinedPuzzle(date);
      expect(daily.start).toEqual(direct.start);
      expect(daily.parMoves).toEqual(direct.parMoves);
    }
  });
});
