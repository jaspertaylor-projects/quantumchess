// Purpose: Keep the short-circuit terminal evaluator semantically identical
// to the complete legal-reply materialization used by search and analysis.

import { describe, expect, it } from 'vitest';

import { makeInitialSnapshot } from '../src/chessboard/advanceCore.js';
import {
  evaluateTerminalAfterMove,
  generateLegalReplies,
  isLostInCheck,
  simulateStandardMove,
} from '../src/chessboard/quantumEngine.js';
import { packBoard, snapshotWords, wordsEqual } from '../src/ai/fast/fastBoard.js';
import { forEachLegalReply } from '../src/ai/fast/fastRules.js';

function piece(id, side, square, possibleTypes) {
  return {
    id,
    side,
    square,
    possibleTypes: [...possibleTypes],
    baseTypes: [...possibleTypes],
    promoTypes: [],
    captured: false,
    captureIndex: null,
    moveCount: 1,
    wasPromoted: false,
    castled: false,
  };
}

function materializedTerminal(pieces, moverSide, captureCounter = 0, lastMove = null) {
  const opponent = moverSide === 'white' ? 'black' : 'white';
  const replies = generateLegalReplies(pieces, opponent, captureCounter, lastMove);
  if (replies.length === 0) {
    return isLostInCheck(pieces, opponent) ? 'checkmate' : 'stalemate';
  }
  return replies.every((reply) => isLostInCheck(reply.resultPieces, opponent))
    ? 'checkmate'
    : null;
}

describe('short-circuit terminal evaluation', () => {
  it('matches the complete evaluator in a wide ordinary opening position', () => {
    const start = makeInitialSnapshot();
    const mover = start.pieces.find((candidate) => candidate.square === 'e2');
    const sim = simulateStandardMove(start.pieces, mover.id, 'e4', 0);

    expect(sim.ok).toBe(true);
    expect(generateLegalReplies(sim.pieces, 'black', 0).length).toBeGreaterThan(100);
    expect(evaluateTerminalAfterMove(sim.pieces, 'white', 0))
      .toBe(materializedTerminal(sim.pieces, 'white', 0));
  });

  it('preserves checkmate when every legal continuation loses', () => {
    const pieces = [
      piece('WR', 'white', 'a1', ['r']),
      piece('WK', 'white', 'c3', ['k']),
      piece('BK', 'black', 'h8', ['k']),
      piece('BP1', 'black', 'g7', ['p']),
      piece('BP2', 'black', 'h7', ['p']),
    ];
    const sim = simulateStandardMove(pieces, 'WR', 'a8', 0);

    expect(sim.ok).toBe(true);
    expect(evaluateTerminalAfterMove(sim.pieces, 'white', 0)).toBe('checkmate');
    expect(evaluateTerminalAfterMove(sim.pieces, 'white', 0))
      .toBe(materializedTerminal(sim.pieces, 'white', 0));
  });

  it('preserves stalemate when no reply exists outside check', () => {
    const pieces = [
      piece('WK', 'white', 'c6', ['k']),
      piece('WQ', 'white', 'b6', ['q']),
      piece('BK', 'black', 'a8', ['k']),
    ];

    expect(evaluateTerminalAfterMove(pieces, 'white', 0)).toBe('stalemate');
    expect(evaluateTerminalAfterMove(pieces, 'white', 0))
      .toBe(materializedTerminal(pieces, 'white', 0));
  });

  it('lets the packed reply walker stop early and still restores its board', () => {
    const start = makeInitialSnapshot();
    const board = packBoard(start.pieces);
    const before = snapshotWords(board);
    let visits = 0;

    const completed = forEachLegalReply(board, 0, null, () => {
      visits += 1;
      return false;
    });

    expect(completed).toBe(false);
    expect(visits).toBe(1);
    expect(wordsEqual(board.words, before)).toBe(true);
    expect(board.journal).toHaveLength(0);
  });
});
