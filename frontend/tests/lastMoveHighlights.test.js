import { describe, expect, it } from 'vitest';
import {
  LAST_MOVE_FROM_COLOR,
  LAST_MOVE_TO_COLOR,
  lastMoveHighlights,
  miniBoardLastMoveHighlights,
} from '../src/chessboard/lastMoveHighlights.js';

describe('last move highlights', () => {
  it('returns no trail for a starting position or incomplete record', () => {
    expect(lastMoveHighlights(null)).toEqual([]);
    expect(lastMoveHighlights({ from: 'e2' })).toEqual([]);
  });

  it('builds the full-board from and to overlays', () => {
    expect(lastMoveHighlights({ from: 'e2', to: 'e4' })).toEqual([
      { square: 'e2', color: LAST_MOVE_FROM_COLOR },
      { square: 'e4', color: LAST_MOVE_TO_COLOR },
    ]);
  });

  it('adapts the same trail for puzzle and tutorial mini boards', () => {
    expect(miniBoardLastMoveHighlights({ from: 'b4', to: 'a3' })).toEqual([
      { sq: 'b4', color: LAST_MOVE_FROM_COLOR },
      { sq: 'a3', color: LAST_MOVE_TO_COLOR },
    ]);
  });
});
