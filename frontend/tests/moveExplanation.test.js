import { describe, expect, it } from 'vitest';
import { explainIllegalMove } from '../src/chessboard/moveExplanation.js';
import { advanceEntry, makeInitialSnapshot } from '../src/chessboard/advanceCore.js';
import { INTRO_TURNS } from '../src/hooks/introSequenceData.js';

describe('move feedback', () => {
  it('distinguishes a blocked path, unavailable movement, and King safety', () => {
    const rook = { id: 'r', side: 'white', square: 'a1', possibleTypes: ['r'] };
    const blocker = { id: 'p', side: 'white', square: 'a2', possibleTypes: ['p'] };
    expect(explainIllegalMove([rook, blocker], rook, 'a4')).toContain('blocked');
    expect(explainIllegalMove([rook], rook, 'b3')).toContain('None can move');
    expect(explainIllegalMove([rook], rook, 'a4')).toContain('King capturable');
    expect(explainIllegalMove([rook, blocker], rook, 'a2')).toContain('own piece');
  });

  it('records census explanations when the second tutorial knight is revealed', () => {
    let snap = makeInitialSnapshot();
    let result;
    for (const turn of INTRO_TURNS.slice(0, 2)) {
      for (const move of [turn.white, turn.black]) {
        result = advanceEntry(snap, { type: 'move', ...move });
        expect(result.ok).toBe(true);
        snap = result.snap;
      }
    }
    expect(result.records[0].explanation).toContain('lost Knight');
    expect(result.records[0].explanation).toContain('census propagates');
  });
});
