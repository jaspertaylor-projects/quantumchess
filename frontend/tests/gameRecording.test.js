import { describe, expect, it } from 'vitest';
import { gameInstanceNeedsRecording } from '../src/hooks/useGameRecording.js';

describe('finished-game recording guard', () => {
  it('claims every distinct game instance even when popup close and restart are batched', () => {
    expect(gameInstanceNeedsRecording(null, 1)).toBe(true);
    expect(gameInstanceNeedsRecording(1, 1)).toBe(false);
    expect(gameInstanceNeedsRecording(1, 2)).toBe(true);
    expect(gameInstanceNeedsRecording(2, 3)).toBe(true);
  });
});
