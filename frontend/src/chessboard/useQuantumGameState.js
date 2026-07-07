// frontend/src/chessboard/useQuantumGameState.js
// Purpose: Manage Quantum Chess state with an immutable timeline. Enforces collapse, dynamic promotion-aware global capacities, check pruning, flexible castling, move-into-check prevention, and checkmate detection with game-over handling. Supports external resets via a key to start a fresh game state.
// Imports From: ./boardUtils.js, ./gameConstants.js, ./quantumEngine.js
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fromAlgebraic, toAlgebraic } from './boardUtils.js';
import {
  createStartingPieces,
} from './gameConstants.js';
import {
  applyQuantumConstraints,
  buildOccupancy,
  clonePieces,
  computePositionSignature,
  computeThreatenedSquaresForSide,
  evaluateTerminalAfterMove,
  generateLegalReplies,
  listEnPassantCaptures,
  simulateCastle,
  simulateEnPassant,
  simulateStandardMove,
  movesForType,
  canSideCaptureSquare,
  computeCastlePlanInPosition,
} from './quantumEngine.js';

const FIFTY_MOVE_HALFMOVES = 100;

function makeInitialSnapshot() {
  const pieces = createStartingPieces();
  return {
    pieces,
    sideToMove: 'white',
    captureCounter: 0,
    gameOver: false,
    winner: null,
    gameOverReason: null,
    lastMove: null,
    halfmoveClock: 0,
    positionSig: computePositionSignature(pieces, 'white', null),
  };
}

function countPossibilities(pieces) {
  let sum = 0;
  for (const p of pieces) sum += (p.possibleTypes || []).length;
  return sum;
}

export default function useQuantumGameState(resetKey = 0) {
  const [history, setHistory] = useState(() => [makeInitialSnapshot()]);
  const [viewIndex, setViewIndexState] = useState(0);

  const lastMoveSignatureRef = useRef(null);

  // Reset the entire timeline when resetKey changes (e.g., starting a new game)
  useEffect(() => {
    setHistory([makeInitialSnapshot()]);
    setViewIndexState(0);
    lastMoveSignatureRef.current = null;
  }, [resetKey]);

  const current = history[Math.min(Math.max(0, viewIndex), history.length - 1)];
  const pieces = current.pieces;
  const sideToMove = current.sideToMove;
  const captureCounter = current.captureCounter;
  const gameOver = current.gameOver || false;
  const winner = current.winner || null;
  const gameOverReason = current.gameOverReason || null;
  const lastMove = current.lastMove || null;
  const halfmoveClock = current.halfmoveClock || 0;

  const canMakeMove = viewIndex === history.length - 1 && !gameOver;

  const setViewIndex = useCallback((idx) => {
    setViewIndexState((prev) => {
      const bounded = Math.max(0, Math.min(idx, history.length - 1));
      if (bounded === prev) return prev;
      return bounded;
    });
  }, [history.length]);

  const pushSnapshot = useCallback((snapInput) => {
    setHistory((prev) => {
      const positionSig = computePositionSignature(snapInput.pieces, snapInput.sideToMove, snapInput.lastMove || null);

      let over = Boolean(snapInput.gameOver);
      let win = snapInput.winner ?? null;
      let reason = snapInput.gameOverReason ?? null;

      // Threefold repetition: this exact position (including quantum state)
      // has now occurred three times across the timeline.
      if (!over) {
        let repeats = 1;
        for (const s of prev) {
          if (s.positionSig === positionSig) repeats += 1;
        }
        if (repeats >= 3) {
          over = true;
          win = null;
          reason = 'threefold repetition';
        }
      }

      const snap = {
        pieces: clonePieces(snapInput.pieces),
        sideToMove: snapInput.sideToMove,
        captureCounter: snapInput.captureCounter,
        gameOver: over,
        winner: win,
        gameOverReason: reason,
        lastMove: snapInput.lastMove || null,
        halfmoveClock: snapInput.halfmoveClock || 0,
        positionSig,
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
      const list = movesForType(t, f, r, occupancy, piece.side, { isFirstMove });
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

  // En passant captures available to the side to move (guarded against
  // leaving a collapsed King capturable, matching getLegalMoves).
  const enPassantMovesForSide = useMemo(() => {
    if (gameOver) return [];
    const candidates = listEnPassantCaptures(pieces, sideToMove, lastMove);
    const opponent = sideToMove === 'white' ? 'black' : 'white';
    return candidates.filter((ep) => {
      const sim = simulateEnPassant(pieces, ep.pieceId, ep.to, ep.victimId, captureCounter);
      if (!sim.ok) return false;
      const kings = sim.pieces.filter((p) => !p.captured && p.side === sideToMove && p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k');
      for (const k of kings) {
        if (k.square && canSideCaptureSquare(sim.pieces, opponent, k.square)) return false;
      }
      return true;
    });
  }, [pieces, sideToMove, lastMove, captureCounter, gameOver]);

  const getEnPassantMoves = useCallback((pieceId) => {
    return enPassantMovesForSide.filter((ep) => ep.pieceId === pieceId);
  }, [enPassantMovesForSide]);

  const movePiece = useCallback((pieceId, toSquare, options = {}) => {
    if (!canMakeMove) return { success: false, reason: gameOver ? 'Game over.' : 'Cannot make moves while viewing history.' };

    const { enPassant = false } = options || {};

    const prevPieces = pieces;
    const moving = prevPieces.find((p) => p.id === pieceId && !p.captured);
    if (!moving) return { success: false, reason: 'Piece not found.' };
    if (moving.side !== sideToMove) return { success: false, reason: 'It is not your turn.' };

    const fromSquareAlg = moving.square;
    const wasFirstMove = (moving.moveCount || 0) === 0;
    const moveSignature = `${sideToMove}:${pieceId}:${fromSquareAlg}->${toSquare}:${enPassant ? 'ep' : 'std'}`;
    if (lastMoveSignatureRef.current === moveSignature) return { success: false };

    let sim;
    if (enPassant) {
      const ep = enPassantMovesForSide.find((e) => e.pieceId === pieceId && e.to === toSquare);
      if (!ep) return { success: false, reason: 'En passant is not available for that move.' };
      sim = simulateEnPassant(prevPieces, pieceId, toSquare, ep.victimId, captureCounter);
    } else {
      sim = simulateStandardMove(prevPieces, pieceId, toSquare, captureCounter);
    }
    if (!sim.ok) return { success: false, reason: sim.reason || 'Illegal move.' };

    const movingSide = moving.side;
    const kings = sim.pieces.filter((p) => !p.captured && p.side === movingSide && p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k');
    if (kings.length > 0) {
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

    // Record the move so the opponent can answer a double-step en passant,
    // and which squares this move's measurement pulse touched (UI feedback).
    const nextLastMove = {
      side: movingSide,
      pieceId,
      from: fromSquareAlg,
      to: toSquare,
      isDoubleStep: false,
      crossedSquare: null,
      measuredSquares: sim.measuredSquares || [],
    };
    const movedFinal = finalPieces.find((p) => p.id === pieceId && !p.captured) || null;
    if (!enPassant && wasFirstMove) {
      const fromPos = fromAlgebraic(fromSquareAlg);
      const toPos = fromAlgebraic(toSquare);
      const dir = movingSide === 'white' ? 1 : -1;
      if (
        fromPos && toPos && movedFinal &&
        fromPos.fileIndex === toPos.fileIndex &&
        toPos.rankIndex - fromPos.rankIndex === 2 * dir &&
        movedFinal.possibleTypes.includes('p')
      ) {
        nextLastMove.isDoubleStep = true;
        nextLastMove.crossedSquare = toAlgebraic(fromPos.fileIndex, fromPos.rankIndex + dir);
      }
    }

    // Fifty-move clock: "progress" is a capture, a definite pawn move, a
    // promotion, or any net loss of possibilities (information gained — the
    // quantum analog of irreversibility). Fifty full moves without progress
    // is a dead position and the game is drawn.
    const definitePawnMove = Boolean(movedFinal && movedFinal.possibleTypes.length === 1 && movedFinal.possibleTypes[0] === 'p');
    const promotedNow = Boolean(movedFinal && movedFinal.wasPromoted && !moving.wasPromoted);
    const informationGained = countPossibilities(finalPieces) < countPossibilities(prevPieces);
    const progress = sim.didCapture || definitePawnMove || promotedNow || informationGained;
    const nextHalfmoveClock = progress ? 0 : halfmoveClock + 1;

    const terminal = evaluateTerminalAfterMove(finalPieces, movingSide, nextCaptureCounter, nextLastMove);
    let nextGameOver = false;
    let nextWinner = null;
    let nextReason = null;
    if (terminal === 'checkmate') {
      nextGameOver = true;
      nextWinner = movingSide;
      nextReason = 'checkmate';
    } else if (terminal === 'stalemate') {
      nextGameOver = true;
      nextReason = 'stalemate';
    } else if (nextHalfmoveClock >= FIFTY_MOVE_HALFMOVES) {
      nextGameOver = true;
      nextReason = 'fifty-move rule';
    }

    pushSnapshot({
      pieces: finalPieces,
      sideToMove: nextSide,
      captureCounter: nextCaptureCounter,
      gameOver: nextGameOver,
      winner: nextWinner,
      gameOverReason: nextReason,
      lastMove: nextLastMove,
      halfmoveClock: nextHalfmoveClock,
    });

    lastMoveSignatureRef.current = moveSignature;

    return { success: true };
  }, [pieces, sideToMove, captureCounter, canMakeMove, pushSnapshot, gameOver, enPassantMovesForSide, halfmoveClock]);

  // Rebuild the whole timeline from a relayed move list — used when rejoining
  // an online game after a reload. Entries are the server's history records:
  // { type: 'move', from, to, enPassant } or { type: 'castle', piece1_from,
  // piece2_from }. Returns the applied moves as { from, to, side } records
  // (two per castle) so the caller can repopulate the move-list store.
  const replayMoves = useCallback((entries) => {
    let snap = makeInitialSnapshot();
    const snaps = [snap];
    const applied = [];

    for (const e of Array.isArray(entries) ? entries : []) {
      const prevPieces = snap.pieces;
      const side = snap.sideToMove;
      const cc = snap.captureCounter;
      const occ = buildOccupancy(prevPieces);
      let finalPieces = null;
      let nextLastMove = null;
      let nextCaptureCounter = cc;
      let progress = false;

      if (e && e.type === 'castle') {
        const p1 = occ.get(e.piece1_from);
        const p2 = occ.get(e.piece2_from);
        if (!p1 || !p2) break;
        const res = computeCastlePlanInPosition(prevPieces, side, p1.id, p2.id);
        if (!res.canCastle || !res.plan) break;
        const sim = simulateCastle(prevPieces, res.plan);
        if (!sim.ok) break;
        finalPieces = applyQuantumConstraints(sim.pieces);
        nextLastMove = {
          side,
          pieceId: res.plan.piece1_id,
          from: res.plan.piece1_from,
          to: res.plan.piece1_to,
          isDoubleStep: false,
          crossedSquare: null,
          measuredSquares: sim.measuredSquares || [],
        };
        progress = countPossibilities(finalPieces) < countPossibilities(prevPieces);
        applied.push({ from: res.plan.piece1_from, to: res.plan.piece1_to, side, castle: true });
        applied.push({ from: res.plan.piece2_from, to: res.plan.piece2_to, side, castle: true });
      } else if (e && typeof e.from === 'string' && typeof e.to === 'string') {
        const piece = occ.get(e.from);
        if (!piece) break;
        const wasFirstMove = (piece.moveCount || 0) === 0;
        let sim = null;
        let usedEnPassant = false;
        if (e.enPassant) {
          const ep = listEnPassantCaptures(prevPieces, side, snap.lastMove)
            .find((x) => x.pieceId === piece.id && x.to === e.to);
          if (ep) {
            sim = simulateEnPassant(prevPieces, piece.id, e.to, ep.victimId, cc);
            usedEnPassant = sim.ok;
          }
        }
        if (!sim || !sim.ok) sim = simulateStandardMove(prevPieces, piece.id, e.to, cc);
        if (!sim.ok) break;
        finalPieces = sim.pieces;
        nextCaptureCounter = sim.didCapture ? cc + 1 : cc;
        nextLastMove = {
          side,
          pieceId: piece.id,
          from: e.from,
          to: e.to,
          isDoubleStep: false,
          crossedSquare: null,
          measuredSquares: sim.measuredSquares || [],
        };
        const movedFinal = finalPieces.find((p) => p.id === piece.id && !p.captured) || null;
        if (!usedEnPassant && wasFirstMove) {
          const fromPos = fromAlgebraic(e.from);
          const toPos = fromAlgebraic(e.to);
          const dir = side === 'white' ? 1 : -1;
          if (
            fromPos && toPos && movedFinal &&
            fromPos.fileIndex === toPos.fileIndex &&
            toPos.rankIndex - fromPos.rankIndex === 2 * dir &&
            movedFinal.possibleTypes.includes('p')
          ) {
            nextLastMove.isDoubleStep = true;
            nextLastMove.crossedSquare = toAlgebraic(fromPos.fileIndex, fromPos.rankIndex + dir);
          }
        }
        const definitePawnMove = Boolean(movedFinal && movedFinal.possibleTypes.length === 1 && movedFinal.possibleTypes[0] === 'p');
        const promotedNow = Boolean(movedFinal && movedFinal.wasPromoted && !piece.wasPromoted);
        progress = sim.didCapture || definitePawnMove || promotedNow ||
          countPossibilities(finalPieces) < countPossibilities(prevPieces);
        applied.push({ from: e.from, to: e.to, side, enPassant: usedEnPassant });
      } else {
        break;
      }

      const nextSide = side === 'white' ? 'black' : 'white';
      const nextHalfmove = progress ? 0 : (snap.halfmoveClock || 0) + 1;
      const terminal = evaluateTerminalAfterMove(finalPieces, side, nextCaptureCounter, nextLastMove);
      let over = false;
      let win = null;
      let reason = null;
      if (terminal === 'checkmate') { over = true; win = side; reason = 'checkmate'; }
      else if (terminal === 'stalemate') { over = true; reason = 'stalemate'; }
      else if (nextHalfmove >= FIFTY_MOVE_HALFMOVES) { over = true; reason = 'fifty-move rule'; }

      const positionSig = computePositionSignature(finalPieces, nextSide, nextLastMove);
      if (!over) {
        let repeats = 1;
        for (const s of snaps) if (s.positionSig === positionSig) repeats += 1;
        if (repeats >= 3) { over = true; reason = 'threefold repetition'; }
      }

      snap = {
        pieces: clonePieces(finalPieces),
        sideToMove: nextSide,
        captureCounter: nextCaptureCounter,
        gameOver: over,
        winner: win,
        gameOverReason: reason,
        lastMove: nextLastMove,
        halfmoveClock: nextHalfmove,
        positionSig,
      };
      snaps.push(snap);
      if (over) break;
    }

    setHistory(snaps);
    setViewIndexState(snaps.length - 1);
    lastMoveSignatureRef.current = null;
    return applied;
  }, []);

  const canCastleBetween = useCallback((idA, idB) => {
    const result = computeCastlePlanInPosition(pieces, sideToMove, idA, idB);
    if (!result.canCastle) return result;

    const sim = simulateCastle(pieces, result.plan);
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

    const { canCastle, reason, plan } = computeCastlePlanInPosition(pieces, sideToMove, idA, idB);
    if (!canCastle) return { success: false, reason: reason || 'Castling is not possible.' };

    const signature = `${sideToMove}:castle:${plan.piece1_id},${plan.piece2_id}:${plan.piece1_from}->${plan.piece1_to}`;
    if (lastMoveSignatureRef.current === signature) return { success: false };

    const sim = simulateCastle(pieces, plan);
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

    const finalPieces = applyQuantumConstraints(sim.pieces);
    const nextSide = sideToMove === 'white' ? 'black' : 'white';

    const nextLastMove = {
      side: moverSide,
      pieceId: plan.piece1_id,
      from: plan.piece1_from,
      to: plan.piece1_to,
      isDoubleStep: false,
      crossedSquare: null,
      measuredSquares: sim.measuredSquares || [],
    };

    const informationGained = countPossibilities(finalPieces) < countPossibilities(pieces);
    const nextHalfmoveClock = informationGained ? 0 : halfmoveClock + 1;

    const terminal = evaluateTerminalAfterMove(finalPieces, moverSide, captureCounter, nextLastMove);
    let nextGameOver = false;
    let nextWinner = null;
    let nextReason = null;
    if (terminal === 'checkmate') {
      nextGameOver = true;
      nextWinner = moverSide;
      nextReason = 'checkmate';
    } else if (terminal === 'stalemate') {
      nextGameOver = true;
      nextReason = 'stalemate';
    } else if (nextHalfmoveClock >= FIFTY_MOVE_HALFMOVES) {
      nextGameOver = true;
      nextReason = 'fifty-move rule';
    }

    pushSnapshot({
      pieces: finalPieces,
      sideToMove: nextSide,
      captureCounter,
      gameOver: nextGameOver,
      winner: nextWinner,
      gameOverReason: nextReason,
      lastMove: nextLastMove,
      halfmoveClock: nextHalfmoveClock,
    });

    lastMoveSignatureRef.current = signature;

    return { success: true };
  }, [pieces, sideToMove, captureCounter, canMakeMove, pushSnapshot, gameOver, halfmoveClock]);

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
    gameOverReason,
    halfmoveClock,
    lastMove,

    getPieceAtSquare,
    getLegalMoves,
    movePiece,
    canCastleBetween,
    castlePieces,
    replayMoves,

    // En passant
    getEnPassantMoves,
    enPassantMovesForSide,
  };
}
