// frontend/src/chessboard/useQuantumGameState.js
// Purpose: Manage Quantum Chess state with an immutable timeline. Enforces collapse, dynamic promotion-aware global capacities, check pruning, flexible castling, move-into-check prevention, and checkmate detection with game-over handling.
// Imports From: ./boardUtils.js, ./gameConstants.js, ./quantumEngine.js
// Exported To: ../App.jsx

import { useCallback, useMemo, useRef, useState } from 'react';
import { fromAlgebraic } from './boardUtils.js';
import {
  createStartingPieces,
} from './gameConstants.js';
import {
  buildOccupancy,
  clonePieces,
  computeThreatenedSquaresForSide,
  enforceGlobalTypeConstraintsToFixpoint,
  generateLegalReplies,
  isCheckmateAfterPositionResolved,
  simulateCastle,
  simulateStandardMove,
} from './quantumEngine.js';

export default function useQuantumGameState() {
  const [history, setHistory] = useState(() => [{
    pieces: createStartingPieces(),
    sideToMove: 'white',
    captureCounter: 0,
    gameOver: false,
    winner: null,
  }]);
  const [viewIndex, setViewIndexState] = useState(0);

  const lastMoveSignatureRef = useRef(null);

  const current = history[Math.min(Math.max(0, viewIndex), history.length - 1)];
  const pieces = current.pieces;
  const sideToMove = current.sideToMove;
  const captureCounter = current.captureCounter;
  const gameOver = current.gameOver || false;
  const winner = current.winner || null;

  const canMakeMove = viewIndex === history.length - 1 && !gameOver;

  const setViewIndex = useCallback((idx) => {
    setViewIndexState((prev) => {
      const bounded = Math.max(0, Math.min(idx, history.length - 1));
      if (bounded === prev) return prev;
      return bounded;
    });
  }, [history.length]);

  const pushSnapshot = useCallback((nextPieces, nextSideToMove, nextCaptureCounter, nextGameOver = false, nextWinner = null) => {
    setHistory((prev) => {
      const snap = {
        pieces: clonePieces(nextPieces),
        sideToMove: nextSideToMove,
        captureCounter: nextCaptureCounter,
        gameOver: Boolean(nextGameOver),
        winner: nextWinner,
      };
      const nextHistory = [...prev, snap];
      setViewIndexState(nextHistory.length - 1);
      return nextHistory;
    });
  }, []);

  const occupancy = useMemo(() => buildOccupancy(pieces), [pieces]);

  const getPieceAtSquare = useCallback((square) => {
    return occupancy.get(square) || null;
  }, [occupancy]);

  const getLegalMoves = useCallback((pieceId) => {
    const piece = pieces.find((p) => p.id === pieceId && !p.captured);
    if (!piece) return [];
    if (piece.side !== sideToMove) return [];
    const pos = fromAlgebraic(piece.square);
    if (!pos) return [];
    const { fileIndex: f, rankIndex: r } = pos;

    const isFirstMove = (piece.moveCount || 0) === 0;

    const merged = new Set();
    for (const t of piece.possibleTypes) {
      const list = (function movesForTypeLocal(tLocal, file, rank, occ, side, options = {}) {
        const { movesForType } = require('./quantumEngine.js');
        return movesForType(tLocal, file, rank, occ, side, options);
      }) (t, f, r, occupancy, piece.side, { isFirstMove });
      for (const sq of list) merged.add(sq);
    }

    const legal = [];
    for (const toSq of merged) {
      const sim = simulateStandardMove(pieces, piece.id, toSq, captureCounter);
      if (!sim.ok) continue;
      const movingSide = piece.side;
      const kings = sim.pieces.filter((p) => !p.captured && p.side === movingSide && p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k');
      let collapsedCapturable = false;
      if (kings.length > 0) {
        const { canSideCaptureSquare } = require('./quantumEngine.js');
        const opponent = movingSide === 'white' ? 'black' : 'white';
        for (const k of kings) {
          if (k.square && canSideCaptureSquare(sim.pieces, opponent, k.square)) { collapsedCapturable = true; break; }
        }
      }
      if (collapsedCapturable) continue;
      legal.push(toSq);
    }

    return legal;
  }, [pieces, occupancy, sideToMove, captureCounter]);

  const checkingSquaresBySide = useMemo(() => {
    const whiteThreats = computeThreatenedSquaresForSide(pieces, 'white');
    const blackThreats = computeThreatenedSquaresForSide(pieces, 'black');
    return {
      white: Array.from(whiteThreats),
      black: Array.from(blackThreats),
    };
  }, [pieces]);

  const movePiece = useCallback((pieceId, toSquare) => {
    if (!canMakeMove) return { success: false, reason: gameOver ? 'Game over.' : 'Cannot make moves while viewing history.' };

    const prevPieces = pieces;
    const moving = prevPieces.find((p) => p.id === pieceId && !p.captured);
    if (!moving) return { success: false, reason: 'Piece not found.' };
    if (moving.side !== sideToMove) return { success: false, reason: 'It is not your turn.' };

    const fromSquareAlg = moving.square;
    const moveSignature = `${sideToMove}:${pieceId}:${fromSquareAlg}->${toSquare}`;
    if (lastMoveSignatureRef.current === moveSignature) return { success: false };

    const sim = simulateStandardMove(prevPieces, pieceId, toSquare, captureCounter);
    if (!sim.ok) return { success: false, reason: sim.reason || 'Illegal move.' };

    const movingSide = moving.side;
    const kings = sim.pieces.filter((p) => !p.captured && p.side === movingSide && p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k');
    if (kings.length > 0) {
      const { canSideCaptureSquare } = require('./quantumEngine.js');
      const opponent = movingSide === 'white' ? 'black' : 'white';
      for (const k of kings) {
        if (k.square && canSideCaptureSquare(sim.pieces, opponent, k.square)) {
          return { success: false, reason: 'Move would leave a collapsed King capturable.' };
        }
      }
    }

    const finalPieces = sim.pieces;

    const nextSide = sideToMove === 'white' ? 'black' : 'white';
    const nextCaptureCounter = sim.didCapture ? captureCounter + 1 : captureCounter;

    const deliveredMate = isCheckmateAfterPositionResolved(finalPieces, moving.side, nextCaptureCounter);

    pushSnapshot(finalPieces, nextSide, nextCaptureCounter, deliveredMate, deliveredMate ? moving.side : null);

    lastMoveSignatureRef.current = moveSignature;

    return { success: true };
  }, [pieces, sideToMove, captureCounter, canMakeMove, pushSnapshot, gameOver]);

  const canCastleBetween = useCallback((idA, idB) => {
    const { computeCastlePlanInPosition, simulateCastle: simCastle, canSideCaptureSquare } = require('./quantumEngine.js');
    const result = computeCastlePlanInPosition(pieces, sideToMove, idA, idB);
    if (!result.canCastle) return result;

    const sim = simCastle(pieces, result.plan);
    if (!sim.ok) return { canCastle: false, reason: sim.reason || 'Castling simulation failed.' };
    const moverSide = pieces.find((p) => p.id === result.plan.piece1_id)?.side || sideToMove;
    const kings = sim.pieces.filter((p) => !p.captured && p.side === moverSide && p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k');
    if (kings.length > 0) {
      const opponent = moverSide === 'white' ? 'black' : 'white';
      for (const k of kings) {
        if (k.square && canSideCaptureSquare(sim.pieces, opponent, k.square)) {
          return { canCastle: false, reason: 'Castling would leave a collapsed King capturable.' };
        }
      }
    }

    return result;
  }, [pieces, sideToMove]);

  const castlePieces = useCallback((idA, idB) => {
    if (!canMakeMove) return { success: false, reason: gameOver ? 'Game over.' : 'Cannot make moves while viewing history.' };

    const { computeCastlePlanInPosition, simulateCastle: simCastle, canSideCaptureSquare } = require('./quantumEngine.js');

    const { canCastle, reason, plan } = computeCastlePlanInPosition(pieces, sideToMove, idA, idB);
    if (!canCastle) return { success: false, reason: reason || 'Castling is not possible.' };

    const signature = `${sideToMove}:castle:${plan.piece1_id},${plan.piece2_id}:${plan.piece1_from}->${plan.piece1_to}`;
    if (lastMoveSignatureRef.current === signature) return { success: false };

    const sim = simCastle(pieces, plan);
    if (!sim.ok) return { success: false, reason: sim.reason || 'Castling failed.' };

    const moverSide = pieces.find((p) => p.id === plan.piece1_id)?.side || sideToMove;
    const kings = sim.pieces.filter((p) => !p.captured && p.side === moverSide && p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k');
    if (kings.length > 0) {
      const opponent = moverSide === 'white' ? 'black' : 'white';
      for (const k of kings) {
        if (k.square && canSideCaptureSquare(sim.pieces, opponent, k.square)) {
          return { success: false, reason: 'Castling would leave a collapsed King capturable.' };
        }
      }
    }

    const finalPieces = enforceGlobalTypeConstraintsToFixpoint(sim.pieces);
    const nextSide = sideToMove === 'white' ? 'black' : 'white';

    const deliveredMate = isCheckmateAfterPositionResolved(finalPieces, moverSide, captureCounter);

    pushSnapshot(finalPieces, nextSide, captureCounter, deliveredMate, deliveredMate ? moverSide : null);

    lastMoveSignatureRef.current = signature;

    return { success: true };
  }, [pieces, sideToMove, captureCounter, canMakeMove, pushSnapshot, gameOver]);

  return {
    pieces,
    sideToMove,
    checkingSquaresBySide,

    viewIndex,
    historyLength: history.length,
    setViewIndex,
    canMakeMove,

    gameOver,
    winner,

    getPieceAtSquare,
    getLegalMoves,
    movePiece,
    canCastleBetween,
    castlePieces,
  };
}
