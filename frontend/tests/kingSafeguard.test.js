// Purpose: Pin the royal-safeguard rules across the reference and packed
// engines: Zap cannot remove a team's final King possibility, and Heal can
// restore a missing King even when conservation reveals it immediately.
// Imports From: ../src/chessboard/quantumEngine.js, ../src/ai/fast/*
// Exported To: None (vitest)

import { describe, expect, it } from 'vitest';

import { applyContactZapHeal, evaluateTerminalAfterMove, isLostInCheck } from '../src/chessboard/quantumEngine.js';
import { BLACK, packBoard, unpackBoard } from '../src/ai/fast/fastBoard.js';
import { contactZapHeal, lostInCheck } from '../src/ai/fast/fastRules.js';

function piece(id, side, square, types, { captured = false, captureIndex = null } = {}) {
  return {
    id,
    side,
    square: captured ? null : square,
    possibleTypes: [...types],
    baseTypes: [...types],
    promoTypes: [],
    captured,
    captureIndex,
    moveCount: 1,
    wasPromoted: false,
    castled: false,
  };
}

function capturedSet(side, counts) {
  const out = [];
  let captureIndex = 0;
  for (const [type, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1) {
      out.push(piece(`${side}-${type}-${i}`, side, null, [type], { captured: true, captureIndex: captureIndex++ }));
    }
  }
  return out;
}

function resolveBoth(pieces, moverSide, moverId) {
  const reference = applyContactZapHeal(pieces, moverSide, [moverId]);
  const packed = packBoard(pieces);
  const moverIdx = pieces.findIndex((p) => p.id === moverId);
  contactZapHeal(packed, moverSide === 'black' ? BLACK : 0, moverIdx, -1);
  return { reference, fastPieces: unpackBoard(packed) };
}

describe('royal safeguard', () => {
  it('zaps Queen instead of a side\'s final King possibility', () => {
    const pieces = [
      piece('WN', 'white', 'f3', ['n']),
      piece('BA', 'black', 'e5', ['q', 'k']),
      piece('BR', 'black', 'h8', ['r']),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WN');
    expect(reference.zappedSquares).toEqual(['e5']);
    expect(reference.pieces.find((p) => p.id === 'BA').possibleTypes).toEqual(['k']);
    expect(fastPieces.find((p) => p.id === 'BA').possibleTypes).toEqual(['k']);
  });

  it('redirects every King shed when a volley reaches all holders', () => {
    const pieces = [
      piece('WN', 'white', 'd4', ['n']),
      piece('BA', 'black', 'b3', ['r', 'q', 'k']),
      piece('BB', 'black', 'f3', ['r', 'q', 'k']),
      piece('BC', 'black', 'b5', ['r', 'q', 'k']),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WN');
    expect(reference.zappedSquares).toEqual(['b3', 'b5', 'f3']);
    expect(reference.pieces.filter((p) => p.side === 'black').map((p) => p.possibleTypes)).toEqual([['r', 'k'], ['r', 'k'], ['r', 'k']]);
    expect(fastPieces.filter((p) => p.side === 'black').map((p) => p.possibleTypes)).toEqual([['r', 'k'], ['r', 'k'], ['r', 'k']]);
  });

  it('heals a missing King back and allows conservation to reveal it', () => {
    const pieces = [
      piece('WP', 'white', 'e4', ['p']),
      piece('WQ', 'white', 'd5', ['q']),
      ...capturedSet('white', { p: 7, n: 2, b: 2, r: 2, q: 1 }),
      piece('BK', 'black', 'h8', ['k']),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WP');
    expect(reference.healedSquares).toEqual(['d5']);
    expect(reference.pieces.find((p) => p.id === 'WQ').possibleTypes).toEqual(['k']);
    expect(fastPieces.find((p) => p.id === 'WQ').possibleTypes).toEqual(['k']);
  });

  it('does not treat a temporarily kingless side as already lost', () => {
    const pieces = [
      piece('WP', 'white', 'e4', ['p']),
      piece('BK', 'black', 'h8', ['k']),
    ];
    expect(isLostInCheck(pieces, 'white')).toBe(false);
    expect(evaluateTerminalAfterMove(pieces, 'black', 0)).toBeNull();
    const packed = packBoard(pieces);
    expect(lostInCheck(packed, 0)).toBe(false);
  });
});
