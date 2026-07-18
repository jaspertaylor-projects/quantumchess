import { describe, expect, it } from 'vitest';
import { buildBotGameFinishedPayload } from '../src/analytics/statsPing.js';

describe('bot game-finished stats ping payload', () => {
  it('passes through a well-formed finish', () => {
    expect(buildBotGameFinishedPayload({
      result: 'win',
      botId: 'sir-hopsalot',
      botTier: 'medium',
      moveCount: 42,
      endReason: 'rules',
    })).toEqual({
      result: 'win',
      botId: 'sir-hopsalot',
      botTier: 'medium',
      moveCount: 42,
      endReason: 'rules',
    });
  });

  it('normalizes unknown results and junk values instead of throwing', () => {
    const payload = buildBotGameFinishedPayload({
      result: 'rage-quit',
      botId: null,
      botTier: undefined,
      moveCount: 'not-a-number',
      endReason: 'x'.repeat(100),
    });
    expect(payload.result).toBe('unknown');
    expect(payload.botId).toBe('');
    expect(payload.botTier).toBe('');
    expect(payload.moveCount).toBe(0);
    expect(payload.endReason).toHaveLength(40);
  });

  it('clamps negative and fractional move counts to whole non-negatives', () => {
    expect(buildBotGameFinishedPayload({ moveCount: -5 }).moveCount).toBe(0);
    expect(buildBotGameFinishedPayload({ moveCount: 12.9 }).moveCount).toBe(12);
  });

  it('builds a safe default payload from nothing', () => {
    expect(buildBotGameFinishedPayload()).toEqual({
      result: 'unknown', botId: '', botTier: '', moveCount: 0, endReason: '',
    });
  });
});
