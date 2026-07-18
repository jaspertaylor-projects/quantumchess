import { describe, expect, it } from 'vitest';
import { decideDrawFromContext } from '../src/ai/drawDecision.js';

describe('bot draw decisions', () => {
  it('accepts a meaningful disadvantage but rejects a winning position', () => {
    expect(decideDrawFromContext({ botAdvantage: -2, tier: 'hard', moveCount: 8 }).accept).toBe(true);
    expect(decideDrawFromContext({ botAdvantage: 1.2, tier: 'easy', moveCount: 80 }).accept).toBe(false);
  });

  it('rejects an equal-position offer while the game is still young', () => {
    const result = decideDrawFromContext({
      botAdvantage: 0,
      tier: 'medium',
      moveCount: 8,
      livePieceCount: 20,
    });
    expect(result.accept).toBe(false);
  });

  it('accepts repetition pressure and genuinely drawish late positions', () => {
    expect(decideDrawFromContext({
      botAdvantage: 0.4,
      tier: 'hard',
      moveCount: 18,
      repetitionCount: 2,
    }).accept).toBe(true);
    expect(decideDrawFromContext({
      botAdvantage: 0.1,
      tier: 'hard',
      moveCount: 42,
      livePieceCount: 8,
    }).accept).toBe(true);
  });

  it('makes stronger bots less eager to accept a small disadvantage', () => {
    const context = { botAdvantage: -0.8, moveCount: 18, livePieceCount: 20 };
    expect(decideDrawFromContext({ ...context, tier: 'easy' }).accept).toBe(true);
    expect(decideDrawFromContext({ ...context, tier: 'hard' }).accept).toBe(false);
  });
});
