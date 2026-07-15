import { describe, expect, it } from 'vitest';
import { staysInSameDecisiveBand } from '../src/review/reviewMoveMarks.js';

describe('review move marks', () => {
  it('suppresses marks while White remains more than eight pawns ahead', () => {
    expect(staysInSameDecisiveBand(8.01, 12)).toBe(true);
  });

  it('suppresses marks while Black remains more than eight pawns ahead', () => {
    expect(staysInSameDecisiveBand(-8.01, -12)).toBe(true);
  });

  it('keeps marks at the boundary or when the winning side changes', () => {
    expect(staysInSameDecisiveBand(8, 12)).toBe(false);
    expect(staysInSameDecisiveBand(12, -12)).toBe(false);
  });
});
