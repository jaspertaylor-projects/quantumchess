// frontend/src/chessboard/useQuantumGameState.js
// Purpose: Manage Quantum Chess state with an immutable timeline. Enforces collapse, dynamic promotion-aware global capacities, check pruning, flexible castling, move-into-check prevention, and checkmate detection with game-over handling. Supports external resets via a key to start a fresh game state.
// The per-move rules (lastMove/double-step, fifty-move progress, terminal
// evaluation, replay) live in ./advanceCore.js, shared with review/fixtures/miner.
// Imports From: ./advanceCore.js, ./boardUtils.js, ./quantumEngine.js
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fromAlgebraic } from './boardUtils.js';
import { advanceEntry, makeInitialSnapshot, moveOutcome, outcomeToSnapshot } from './advanceCore.js';
import {
  buildOccupancy,
  computeCastlePlanInPosition,
  computeThreatenedSquaresForSide,
  hasCollapsedKingCapturable,
  listEnPassantCaptures,
  mergedDestinations,
  simulateCastle,
  simulateEnPassant,
  simulateStandardMove,
} from './quantumEngine.js';

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

  // Append the next snapshot derived from a moveOutcome — outcomeToSnapshot
  // (shared with replay/fixtures/miner) owns the position signature and the
  // threefold-repetition check, so live play cannot diverge from replay.
  const pushOutcome = useCallback((prevSideToMove, outcome) => {
    setHistory((prev) => {
      const snap = outcomeToSnapshot({ sideToMove: prevSideToMove }, outcome, prev);
      const nextHistory = [...prev, snap];
      setViewIndexState(nextHistory.length - 1);
      return nextHistory;
    });
  }, []);

  const occupancy = useMemo(() => buildOccupancy(pieces), [pieces]);

  // Check applies only to a DEFINITE king (possibleTypes === ['k']) — the
  // revealed-last-holder endgame — so the quantum midgame stays checkless
  // while the finale gets real checkmate. Must match generateLegalReplies,
  // or live play diverges from the AI and terminal evaluation.
  const leavesKingCapturable = useCallback(
    (ps, side) => hasCollapsedKingCapturable(ps, side),
    []
  );

  const getPieceAtSquare = useCallback((square) => {
    return occupancy.get(square) || null;
  }, [occupancy]);

  const getLegalMoves = useCallback((pieceId) => {
    const piece = pieces.find((p) => p.id === pieceId && !p.captured);
    if (!piece) return [];
    if (piece.side !== sideToMove) return [];
    if (!fromAlgebraic(piece.square)) return [];

    const merged = mergedDestinations(piece, occupancy, { isFirstMove: (piece.moveCount || 0) === 0 });

    const legal = [];
    for (const toSq of merged) {
      const sim = simulateStandardMove(pieces, piece.id, toSq, captureCounter);
      if (!sim.ok) continue;
      if (leavesKingCapturable(sim.pieces, piece.side)) continue;
      legal.push(toSq);
    }

    return legal;
  }, [pieces, occupancy, sideToMove, captureCounter, leavesKingCapturable]);

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
    return candidates.filter((ep) => {
      const sim = simulateEnPassant(pieces, ep.pieceId, ep.to, ep.victimId, captureCounter);
      if (!sim.ok) return false;
      return !leavesKingCapturable(sim.pieces, sideToMove);
    });
  }, [pieces, sideToMove, lastMove, captureCounter, gameOver, leavesKingCapturable]);

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

    if (leavesKingCapturable(sim.pieces, moving.side)) {
      return { success: false, reason: 'Move would leave a collapsed King capturable.' };
    }

    const outcome = moveOutcome(
      { pieces: prevPieces, sideToMove, captureCounter, halfmoveClock },
      sim,
      {
        moverId: pieceId,
        from: fromSquareAlg,
        to: toSquare,
        usedEnPassant: enPassant,
        wasFirstMove,
        moverWasPromoted: Boolean(moving.wasPromoted),
      },
    );

    pushOutcome(sideToMove, outcome);

    lastMoveSignatureRef.current = moveSignature;

    // The move's lossless gameSlice-format record — callers dispatch it
    // instead of reconstructing it (single source for saved-game data).
    return {
      success: true,
      records: [{
        from: fromSquareAlg,
        to: toSquare,
        side: sideToMove,
        enPassant: Boolean(enPassant),
        capture: outcome.didCapture,
      }],
    };
  }, [pieces, sideToMove, captureCounter, canMakeMove, pushOutcome, gameOver, enPassantMovesForSide, halfmoveClock, leavesKingCapturable]);

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
      const adv = advanceEntry(snap, e, snaps);
      if (!adv.ok) break;
      applied.push(...adv.records);
      snap = adv.snap;
      snaps.push(snap);
      if (snap.gameOver) break;
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
    if (leavesKingCapturable(sim.pieces, moverSide)) {
      return { canCastle: false, reason: 'Castling would leave a collapsed King capturable.' };
    }

    return result;
  }, [pieces, sideToMove, leavesKingCapturable]);

  const castlePieces = useCallback((idA, idB) => {
    if (!canMakeMove) return { success: false, reason: gameOver ? 'Game over.' : 'Cannot make moves while viewing history.' };

    const { canCastle, reason, plan } = computeCastlePlanInPosition(pieces, sideToMove, idA, idB);
    if (!canCastle) return { success: false, reason: reason || 'Castling is not possible.' };

    const signature = `${sideToMove}:castle:${plan.piece1_id},${plan.piece2_id}:${plan.piece1_from}->${plan.piece1_to}`;
    if (lastMoveSignatureRef.current === signature) return { success: false };

    const sim = simulateCastle(pieces, plan);
    if (!sim.ok) return { success: false, reason: sim.reason || 'Castling failed.' };

    const moverSide = pieces.find((p) => p.id === plan.piece1_id)?.side || sideToMove;
    if (leavesKingCapturable(sim.pieces, moverSide)) {
      return { success: false, reason: 'Castling would leave a collapsed King capturable.' };
    }

    const outcome = moveOutcome(
      { pieces, sideToMove, captureCounter, halfmoveClock },
      sim,
      { moverId: plan.piece1_id, from: plan.piece1_from, to: plan.piece1_to, isCastle: true },
    );

    pushOutcome(sideToMove, outcome);

    lastMoveSignatureRef.current = signature;

    // A castle's two lossless records (both flagged) — see movePiece.
    return {
      success: true,
      records: [
        { from: plan.piece1_from, to: plan.piece1_to, side: sideToMove, castle: true },
        { from: plan.piece2_from, to: plan.piece2_to, side: sideToMove, castle: true },
      ],
    };
  }, [pieces, sideToMove, captureCounter, canMakeMove, pushOutcome, gameOver, halfmoveClock, leavesKingCapturable]);

  // Position-signature counts across the timeline: the AI passes these to
  // the search so a winning bot avoids shuffling into threefold repetition.
  const positionSigCounts = useMemo(() => {
    const counts = {};
    for (const snap of history) {
      if (snap.positionSig) counts[snap.positionSig] = (counts[snap.positionSig] || 0) + 1;
    }
    return counts;
  }, [history]);

  return {
    pieces,
    sideToMove,
    checkingSquaresBySide,
    positionSigCounts,

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
