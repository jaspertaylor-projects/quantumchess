// Purpose: Pin simultaneous Heal support across the reference and packed
// engines using the launch daily position that exposed the edge case.

import { describe, expect, it } from 'vitest';

import minedData from '../src/puzzle/minedPreviewData.json';
import { simulateStandardMove } from '../src/chessboard/quantumEngine.js';
import { packBoard, parseSquare, unpackBoard } from '../src/ai/fast/fastBoard.js';
import { makeStandardMove } from '../src/ai/fast/fastRules.js';

describe('joint Heal volley', () => {
  it('restores Knight on b2 and Pawn on c5 when only the pair is census-valid', () => {
    const chainIdx = minedData.schedule['2026-07-17'];
    const pieces = minedData.chains[chainIdx].start.pieces;
    const mover = pieces.find((piece) => !piece.captured && piece.square === 'b4');

    const reference = simulateStandardMove(pieces, mover.id, 'a3', 0);
    expect(reference.ok).toBe(true);
    expect(reference.healedSquares).toEqual(['b2', 'c5']);
    expect(reference.failedHealSquares).toEqual([]);
    expect(reference.pieces.find((piece) => piece.square === 'b2').possibleTypes)
      .toEqual(['p', 'n', 'r', 'q', 'k']);
    expect(reference.pieces.find((piece) => piece.square === 'c5').possibleTypes)
      .toEqual(['p', 'n']);

    const packed = packBoard(pieces);
    const moverIdx = pieces.findIndex((piece) => piece.id === mover.id);
    expect(makeStandardMove(packed, moverIdx, parseSquare('a3'))).toBe(true);
    const fastPieces = unpackBoard(packed);
    expect(fastPieces.find((piece) => piece.square === 'b2').possibleTypes)
      .toEqual(['p', 'n', 'r', 'q', 'k']);
    expect(fastPieces.find((piece) => piece.square === 'c5').possibleTypes)
      .toEqual(['p', 'n']);
  });
});
