// Purpose: Pin the experimental cascade-zap rule in both gameplay engines:
// zaps may trigger census collapses, King erasure falls down the value ladder,
// and only a target with no removable identity receives a shield.
// Imports From: ../src/chessboard/quantumEngine.js, ../src/ai/fast/*
// Exported To: None (vitest)

import { describe, expect, it } from 'vitest';

import { applyContactZapHeal } from '../src/chessboard/quantumEngine.js';
import { BLACK, packBoard, unpackBoard } from '../src/ai/fast/fastBoard.js';
import { contactZapHeal } from '../src/ai/fast/fastRules.js';

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
      out.push(piece(
        `${side}-${type}-${i}`,
        side,
        null,
        [type],
        { captured: true, captureIndex: captureIndex++ },
      ));
    }
  }
  return out;
}

function resolveBoth(pieces, moverSide, moverId) {
  const reference = applyContactZapHeal(pieces, moverSide, [moverId]);
  const packed = packBoard(pieces);
  const moverIdx = pieces.findIndex((candidate) => candidate.id === moverId);
  contactZapHeal(packed, moverSide === 'black' ? BLACK : 0, moverIdx, -1);
  return { reference, fastPieces: unpackBoard(packed) };
}

function liveTypes(pieces, id) {
  return pieces.find((candidate) => candidate.id === id)?.possibleTypes;
}

describe('census-propagating zaps', () => {
  it('lets one zap collapse a closed census chain elsewhere', () => {
    const pieces = [
      piece('WP', 'white', 'e4', ['p']),
      ...capturedSet('white', { p: 7, n: 2, b: 2, r: 2, q: 1, k: 1 }),
      piece('BA', 'black', 'e8', ['q', 'k']),
      piece('BT', 'black', 'd5', ['r', 'k']),
      piece('BC', 'black', 'a8', ['r', 'q']),
      ...capturedSet('black', { p: 8, n: 2, b: 2, r: 1 }),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WP');

    expect(reference.zappedSquares).toEqual(['d5']);
    expect(reference.fizzledSquares).toEqual([]);
    expect(liveTypes(reference.pieces, 'BT')).toEqual(['r']);
    expect(liveTypes(reference.pieces, 'BA')).toEqual(['k']);
    expect(liveTypes(reference.pieces, 'BC')).toEqual(['q']);
    expect(liveTypes(fastPieces, 'BT')).toEqual(['r']);
    expect(liveTypes(fastPieces, 'BA')).toEqual(['k']);
    expect(liveTypes(fastPieces, 'BC')).toEqual(['q']);
  });

  it('falls through from King when the target holds the final royal branch', () => {
    const pieces = [
      piece('WN', 'white', 'f3', ['n']),
      piece('BT', 'black', 'e5', ['r', 'q', 'k']),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WN');

    expect(reference.zappedSquares).toEqual(['e5']);
    expect(reference.fizzledSquares).toEqual([]);
    expect(liveTypes(reference.pieces, 'BT')).toEqual(['r', 'k']);
    expect(liveTypes(fastPieces, 'BT')).toEqual(['r', 'k']);
  });

  it('shields only the incompatible fallback when two royal sheds cannot coexist', () => {
    const pieces = [
      piece('WN', 'white', 'd4', ['n']),
      piece('BA', 'black', 'b3', ['q', 'k']),
      piece('BB', 'black', 'f3', ['q', 'k']),
      ...capturedSet('black', { p: 8, n: 2, b: 2, r: 2 }),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WN');

    expect(reference.zappedSquares).toEqual(['b3']);
    expect(reference.fizzledSquares).toEqual(['f3']);
    expect(liveTypes(reference.pieces, 'BA')).toEqual(['k']);
    expect(liveTypes(reference.pieces, 'BB')).toEqual(['q']);
    expect(liveTypes(fastPieces, 'BA')).toEqual(['k']);
    expect(liveTypes(fastPieces, 'BB')).toEqual(['q']);
  });

  it('shields only when the contacted piece has no identity it can shed', () => {
    const pieces = [
      piece('WN', 'white', 'f3', ['n']),
      piece('BK', 'black', 'e5', ['k']),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WN');

    expect(reference.zappedSquares).toEqual([]);
    expect(reference.fizzledSquares).toEqual(['e5']);
    expect(liveTypes(reference.pieces, 'BK')).toEqual(['k']);
    expect(liveTypes(fastPieces, 'BK')).toEqual(['k']);
  });
});
