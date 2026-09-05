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

  it('shows a shield when King Guard leaves a contacted final King unchanged', () => {
    const pieces = [
      piece('WN', 'white', 'f3', ['n']),
      piece('BK', 'black', 'e5', ['k']),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WN');
    expect(reference.zappedSquares).toEqual([]);
    expect(reference.fizzledSquares).toEqual(['e5']);
    expect(reference.pieces.find((p) => p.id === 'BK').possibleTypes).toEqual(['k']);
    expect(fastPieces.find((p) => p.id === 'BK').possibleTypes).toEqual(['k']);
  });

  it('shows a shield for any contacted measured piece that cannot shed', () => {
    const pieces = [
      piece('WN', 'white', 'f3', ['n']),
      piece('BR', 'black', 'e5', ['r']),
    ];

    const { reference } = resolveBoth(pieces, 'white', 'WN');
    expect(reference.zappedSquares).toEqual([]);
    expect(reference.fizzledSquares).toEqual(['e5']);
    expect(reference.pieces.find((p) => p.id === 'BR').possibleTypes).toEqual(['r']);
  });

  it('gives every enemy contact exactly one zap-or-shield result', () => {
    const pieces = [
      piece('WN', 'white', 'd4', ['n']),
      piece('BA', 'black', 'b3', ['q', 'k']),
      piece('BR', 'black', 'f3', ['r']),
    ];

    const { reference } = resolveBoth(pieces, 'white', 'WN');
    expect(reference.zappedSquares).toEqual(['b3']);
    expect(reference.fizzledSquares).toEqual(['f3']);
    expect(reference.zappedSquares).not.toContain(reference.fizzledSquares[0]);
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

  it('keeps walking the Heal ladder when Pawn and Knight cannot take root', () => {
    const pieces = [
      piece('WP', 'white', 'e4', ['p']),
      piece('WT', 'white', 'd5', ['q']),
      piece('WK', 'white', 'h1', ['k']),
      ...capturedSet('white', { p: 7, n: 2 }),
      piece('BK', 'black', 'h8', ['k']),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WP');
    expect(reference.healedSquares).toEqual(['d5']);
    expect(reference.failedHealSquares).toEqual([]);
    expect(reference.pieces.find((p) => p.id === 'WT').possibleTypes).toEqual(['b', 'q']);
    expect(fastPieces.find((p) => p.id === 'WT').possibleTypes).toEqual(['b', 'q']);
  });

  it('removes the highest identity even when the census collapses a bystander', () => {
    const pieces = [
      piece('WN', 'white', 'f3', ['n']),
      piece('BT', 'black', 'e5', ['b', 'r', 'q', 'k']),
      piece('B1', 'black', 'a8', ['r']),
      piece('B2', 'black', 'b8', ['b', 'q']),
      piece('B3', 'black', 'c8', ['b', 'r']),
      piece('B4', 'black', 'd8', ['b', 'k']),
      piece('B5', 'black', 'f8', ['b']),
      ...capturedSet('black', { p: 8, n: 2 }),
    ];

    const { reference, fastPieces } = resolveBoth(pieces, 'white', 'WN');
    expect(reference.zappedSquares).toEqual(['e5']);
    expect(reference.fizzledSquares).toEqual([]);
    expect(reference.pieces.find((p) => p.id === 'BT').possibleTypes).toEqual(['b', 'r', 'q']);
    expect(reference.pieces.find((p) => p.id === 'B4').possibleTypes).toEqual(['k']);
    expect(fastPieces.find((p) => p.id === 'BT').possibleTypes).toEqual(['b', 'r', 'q']);
    expect(fastPieces.find((p) => p.id === 'B4').possibleTypes).toEqual(['k']);
  });

  it('reports a failed Heal after exhausting every identity', () => {
    const pieces = [
      piece('WP', 'white', 'e4', ['p']),
      piece('WF', 'white', 'd5', ['p', 'n', 'b', 'r', 'q', 'k']),
      piece('BK', 'black', 'h8', ['k']),
    ];

    const { reference } = resolveBoth(pieces, 'white', 'WP');
    expect(reference.healedSquares).toEqual([]);
    expect(reference.failedHealSquares).toEqual(['d5']);
    expect(reference.pieces.find((p) => p.id === 'WF').possibleTypes)
      .toEqual(['p', 'n', 'b', 'r', 'q', 'k']);
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
