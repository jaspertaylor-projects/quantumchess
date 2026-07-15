import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDailyMinedPuzzle } from '../src/puzzle/minedPreview.js';
import minedData from '../src/puzzle/minedPreviewData.json';
import {
  getMinedPuzzleResult,
  minedPuzzleDay,
  recordMinedPuzzleResult,
} from '../src/puzzle/minedPuzzleProgress.js';

describe('mined daily puzzle', () => {
  beforeEach(() => {
    const values = new Map();
    globalThis.localStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    };
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it('selects a playable mined chain deterministically for the day', async () => {
    const a = await loadDailyMinedPuzzle('2026-07-13');
    const b = await loadDailyMinedPuzzle('2026-07-13');
    expect(a).not.toBeNull();
    expect(b.recipe.title).toBe(a.recipe.title);
    expect(a).toMatchObject({ date: '2026-07-13', isDaily: true });
    expect(a.intro?.pieces).toHaveLength(a.start.pieces.length);
    const moverBefore = a.intro.pieces.find((piece) =>
      !piece.captured && piece.side === 'black' && piece.square === a.mistake.from);
    expect(moverBefore).toBeTruthy();
    expect(a.start.pieces.find((piece) => piece.id === moverBefore.id)?.square).toBe(a.mistake.to);
  });

  it('serves the scheduled chain on pinned dates, rotation elsewhere', async () => {
    for (const [date, idx] of Object.entries(minedData.schedule)) {
      const puzzle = await loadDailyMinedPuzzle(date);
      expect(puzzle, date).not.toBeNull();
      const chain = minedData.chains[idx];
      expect(puzzle.mistake).toMatchObject({ from: chain.mistake.from, to: chain.mistake.to });
    }
    // A date outside the schedule still resolves via rotation.
    expect(await loadDailyMinedPuzzle('2027-01-01')).not.toBeNull();
  });

  it('never opens with a first-grab solution (the gauge-top move must not capture the mistake piece)', () => {
    for (const chain of minedData.chains) {
      const evals = chain.evalTables?.[0]?.evals || {};
      let bestKey = null;
      let best = -Infinity;
      for (const [key, v] of Object.entries(evals)) {
        if (v > best) { best = v; bestKey = key; }
      }
      expect(bestKey, `game ${chain.game} ply ${chain.startPly}`).toBeTruthy();
      expect(bestKey.slice(3, 5), `game ${chain.game} ply ${chain.startPly}`).not.toBe(chain.mistake.to);
    }
  });

  it('carries a verified pre-mistake snapshot for every current puzzle', () => {
    for (const chain of minedData.chains) {
      expect(chain.intro?.pieces).toHaveLength(chain.start.pieces.length);
      const moverBefore = chain.intro.pieces.find((piece) =>
        !piece.captured && piece.side === 'black' && piece.square === chain.mistake.from);
      expect(moverBefore, `game ${chain.game} ply ${chain.startPly}`).toBeTruthy();
      expect(chain.start.pieces.find((piece) => piece.id === moverBefore.id)?.square).toBe(chain.mistake.to);
    }
  });

  it('records completion, including a total collapse', () => {
    const date = minedPuzzleDay(new Date(2026, 6, 13));
    expect(getMinedPuzzleResult(date)).toBeNull();
    recordMinedPuzzleResult(date, { totalCollapse: true });
    expect(getMinedPuzzleResult(date)).toMatchObject({
      completed: true,
      totalCollapse: true,
    });
  });
});
