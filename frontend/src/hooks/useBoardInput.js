// frontend/src/hooks/useBoardInput.js
// Purpose: All board interaction — selection, click/drag move input, the
// quantum-castle two-piece gesture, en passant disambiguation, tray
// highlights, and the highlight overlays. The click and drop paths share
// one guard chain and one commit path, so the rules cannot drift between
// input methods. Extracted from App.jsx.
// Imports From: None
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useState } from 'react';

export default function useBoardInput({
  pieces,
  sideToMove,
  gameOver,
  winner,
  canMakeMove,
  gameInstanceId,
  gameStarted,
  userTeam,
  getPieceAtSquare,
  getLegalMoves,
  getEnPassantMoves,
  movePiece,
  canCastleBetween,
  castlePieces,
  checkingSquaresBySide,
  showCheckOverlay,
  commitEngineResult,
  online,
  intro,
  promptStartGame,
  guardExternalOver,
  setInfoMessage,
  isOnlineGameRef,
  aiEnabledRef,
}) {
  const { introGuide } = intro;

  const [selectedId, setSelectedId] = useState(null);
  // Pending disambiguation between an en passant capture and a quiet move to
  // the same square.
  const [pendingEpChoice, setPendingEpChoice] = useState(null);
  const [trayHighlights, setTrayHighlights] = useState([]);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  // Pending en passant choices are per-turn.
  useEffect(() => {
    setPendingEpChoice(null);
  }, [sideToMove, gameInstanceId]);

  // Local hotseat controls BOTH sides; online and AI games control only the
  // user's side. (isOnline alone missed AI games — you could move the bot's
  // pieces during its think time via the click path.)
  const controlsBothSides = useCallback(
    () => !isOnlineGameRef.current && !aiEnabledRef.current,
    [isOnlineGameRef, aiEnabledRef]
  );
  const isUsersTurn = useCallback(
    () => controlsBothSides() || sideToMove === userTeam,
    [controlsBothSides, sideToMove, userTeam]
  );
  const ownsPiece = useCallback(
    (piece) => controlsBothSides() || Boolean(piece && piece.side === userTeam),
    [controlsBothSides, userTeam]
  );

  // Commit a move (standard or en passant), carrying any marked measurement.
  const performMove = useCallback((pieceId, toSquare, { enPassant = false } = {}) => {
    const movingPiece = pieces.find((p) => p.id === pieceId);
    if (!movingPiece) {
      setSelectedId(null);
      setPendingEpChoice(null);
      return;
    }
    const fromSquare = movingPiece.square || null;
    const result = movePiece(pieceId, toSquare, { enPassant });
    if (commitEngineResult(result) && fromSquare) {
      online.relayMove({ from: fromSquare, to: toSquare, side: movingPiece.side, enPassant });
    }
    setSelectedId(null);
    setPendingEpChoice(null);
  }, [pieces, movePiece, commitEngineResult, online]);

  // Attempt the quantum castle between two pieces: commits + relays on
  // success, reports the refusal reason otherwise. Returns whether it landed.
  const tryCastle = useCallback((idA, idB, side) => {
    const { canCastle, reason, plan } = canCastleBetween(idA, idB);
    if (!canCastle) {
      setInfoMessage(reason || 'Cannot castle with these pieces.');
      return false;
    }
    const result = castlePieces(idA, idB);
    if (commitEngineResult(result)) {
      online.relayCastle({ side, plan });
      return true;
    }
    return false;
  }, [canCastleBetween, castlePieces, commitEngineResult, online, setInfoMessage]);

  // Route a destination square to the right kind of move. Returns false if the
  // square is neither a legal move nor an en passant capture for the piece.
  const commitMoveOrChoose = useCallback((pieceId, toSquare) => {
    if (introGuide) {
      const movingPiece = pieces.find((p) => p.id === pieceId);
      const onScript = movingPiece && movingPiece.square === introGuide.from && toSquare === introGuide.to;
      if (!onScript) {
        // Not an illegal move, just off-script: nudge back to the glow.
        intro.nudgeOffScript();
        setSelectedId(null);
        return true;
      }
      intro.onGuidedMovePlayed();
    }
    const legal = new Set(getLegalMoves(pieceId));
    const isEp = getEnPassantMoves(pieceId).some((ep) => ep.to === toSquare);
    const isLegal = legal.has(toSquare);
    if (isEp && isLegal) {
      // Both readings exist: ask the player which world they are asserting.
      setPendingEpChoice({ pieceId, to: toSquare });
      return true;
    }
    if (isEp) {
      performMove(pieceId, toSquare, { enPassant: true });
      return true;
    }
    if (isLegal) {
      performMove(pieceId, toSquare);
      return true;
    }
    return false;
  }, [getLegalMoves, getEnPassantMoves, performMove, introGuide, intro, pieces]);

  // Shared entry guard for board interaction: pre-game it either nudges to
  // setup (returns false) or seats the intro game; then the external-over and
  // history/turn guards apply. Returns true when the interaction may proceed.
  const beginBoardInteraction = useCallback(() => {
    if (!gameStarted) {
      if (!intro.introFreePlay) { promptStartGame(); return false; }
      intro.ensureIntroGame();
    }
    if (guardExternalOver()) return false;
    if (!canMakeMove) {
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      return false;
    }
    if (!isUsersTurn()) {
      setInfoMessage('Not your turn.');
      return false;
    }
    return true;
  }, [gameStarted, intro, promptStartGame, guardExternalOver, canMakeMove, gameOver, winner, isUsersTurn, setInfoMessage]);

  // A second click on one of the mover's own pieces: try the quantum castle
  // with the current selection, then (castle or not) select the clicked
  // piece. Shared by the square- and piece-click handlers.
  // While a guide is up, castling is allowed ONLY when it IS the guided move
  // (the intro's quantum-castle beat); any other pair nudges back on script.
  const guideAllowsCastle = useCallback((sqA, sqB) => {
    if (!introGuide || !introGuide.castle) return false;
    const pair = [sqA, sqB].sort().join(',');
    return pair === [introGuide.from, introGuide.to].sort().join(',');
  }, [introGuide]);

  const selectOwnPiece = useCallback((clickedId, clickedSide) => {
    if (selectedId && selectedId !== clickedId) {
      const left = pieces.find((p) => p.id === selectedId);
      if (left && ownsPiece(left)) {
        const clicked = pieces.find((p) => p.id === clickedId);
        if (introGuide && !(clicked && guideAllowsCastle(left.square, clicked.square))) {
          // Off-script castling would sidestep the choreography.
          intro.nudgeOffScript();
          setSelectedId(clickedId);
          setTrayHighlights([]);
          return;
        }
        if (tryCastle(selectedId, clickedId, clickedSide)) {
          if (introGuide) intro.onGuidedMovePlayed();
          setSelectedId(null);
          setTrayHighlights([]);
          return;
        }
      } else {
        setInfoMessage('You can only castle with your own pieces in online games.');
      }
    }
    setSelectedId(clickedId);
    setTrayHighlights([]);
  }, [selectedId, pieces, ownsPiece, introGuide, intro, tryCastle, setInfoMessage, guideAllowsCastle]);

  // Move the current selection to a destination square (click paths).
  const moveSelectionTo = useCallback((toSquare) => {
    const movingPiece = pieces.find((p) => p.id === selectedId);
    if (!movingPiece || movingPiece.side !== sideToMove) {
      setSelectedId(null);
      return;
    }
    if (!ownsPiece(movingPiece)) {
      setInfoMessage('You can only move your own pieces in online games.');
      setSelectedId(null);
      return;
    }
    if (!commitMoveOrChoose(selectedId, toSquare)) {
      setInfoMessage('Illegal move.');
      setSelectedId(null);
    }
  }, [pieces, selectedId, sideToMove, ownsPiece, commitMoveOrChoose, setInfoMessage]);

  const handleSquareClick = (data) => {
    if (!beginBoardInteraction()) return;

    const { square } = data;
    const piece = getPieceAtSquare(square);

    if (piece) {
      if (!ownsPiece(piece)) {
        setInfoMessage('You can only select your own pieces in online games.');
        return;
      }
      if (piece.side === sideToMove) selectOwnPiece(piece.id, piece.side);
      return;
    }

    if (selectedId) moveSelectionTo(square);
  };

  const handlePieceClick = ({ id }) => {
    if (!beginBoardInteraction()) return;

    const clicked = pieces.find((x) => x.id === id);
    if (!clicked) return;

    // Note: clicking an opponent piece is legitimate — it is how captures and
    // measurement targeting work. Ownership checks are applied per-action.
    if (clicked.side === sideToMove) {
      selectOwnPiece(id, clicked.side);
      return;
    }

    if (selectedId && clicked.square) moveSelectionTo(clicked.square);
  };

  const handlePieceDragStart = useCallback((piece) => {
    if (!piece) return false;
    if (!gameStarted) {
      if (!intro.introFreePlay) { promptStartGame(); return false; }
      intro.ensureIntroGame();
    }
    if (guardExternalOver()) return false;
    if (!canMakeMove) return false;
    if (isOnlineGameRef.current || aiEnabledRef.current) {
      if (piece.side !== userTeam) return false;
      if (sideToMove !== userTeam) return false;
    } else if (piece.side !== sideToMove) {
      return false;
    }
    setSelectedId(piece.id);
    setTrayHighlights([]);
    return true;
  }, [sideToMove, canMakeMove, userTeam, guardExternalOver, gameStarted, promptStartGame, intro, isOnlineGameRef, aiEnabledRef]);

  const handlePieceDrop = useCallback(({ id, from, to }) => {
    if (!gameStarted) {
      if (!intro.introFreePlay) { promptStartGame(); setSelectedId(null); return; }
      intro.ensureIntroGame();
    }
    if (guardExternalOver()) {
      setSelectedId(null);
      return;
    }
    if (!canMakeMove) {
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      setSelectedId(null);
      return;
    }

    const restricted = isOnlineGameRef.current || aiEnabledRef.current;
    if (restricted && sideToMove !== userTeam) {
      setInfoMessage('Not your turn.');
      setSelectedId(null);
      return;
    }

    const movingPiece = pieces.find((p) => p.id === id);
    if (!movingPiece) {
      setSelectedId(null);
      return;
    }

    if (restricted && movingPiece.side !== userTeam) {
      if (isOnlineGameRef.current) {
        setInfoMessage('You can only move your own pieces in online games.');
      } else {
        const you = userTeam === 'white' ? 'White' : 'Black';
        setInfoMessage(`You are playing ${you} vs AI.`);
      }
      setSelectedId(null);
      return;
    }

    const fromSquare = movingPiece.square || from || null;

    // If the drop ends on the original square or is null, treat as a
    // selection tap, not a move.
    if (!to || to === fromSquare) {
      setInfoMessage('');
      setSelectedId(movingPiece.id);
      return;
    }

    const targetAtDest = getPieceAtSquare(to);
    if (targetAtDest && targetAtDest.side === movingPiece.side && targetAtDest.id !== id) {
      if (introGuide && !guideAllowsCastle(movingPiece.square, targetAtDest.square)) {
        // Off-script castling would sidestep the choreography.
        intro.nudgeOffScript();
      } else if (tryCastle(id, targetAtDest.id, movingPiece.side)) {
        if (introGuide) intro.onGuidedMovePlayed();
      }
      setSelectedId(null);
      return;
    }

    if (!commitMoveOrChoose(id, to)) {
      setInfoMessage('Illegal move.');
      setSelectedId(null);
    }
  }, [pieces, getPieceAtSquare, tryCastle, canMakeMove, gameOver, winner, sideToMove, userTeam, guardExternalOver, commitMoveOrChoose, gameStarted, promptStartGame, intro, introGuide, guideAllowsCastle, isOnlineGameRef, aiEnabledRef, setInfoMessage]);

  const handleDragHover = useCallback(() => {}, []);
  const handleSquareRightClick = useCallback(() => {}, []);

  const handleSetHighlights = useCallback((arr) => {
    setTrayHighlights(Array.isArray(arr) ? arr : []);
  }, []);

  const handleClearHighlights = useCallback(() => {
    setTrayHighlights([]);
  }, []);

  const selectedMoves = useMemo(() => {
    if (!selectedId) return [];
    return getLegalMoves(selectedId);
  }, [selectedId, getLegalMoves]);

  const baseHighlights = useMemo(() => {
    const list = [];
    if (selectedId) {
      const piece = pieces.find((p) => p.id === selectedId);
      if (piece && piece.square) {
        list.push({ square: piece.square, color: 'rgba(97, 218, 251, 0.35)' });
      }
      for (const sq of selectedMoves) {
        list.push({ square: sq, color: 'rgba(255, 206, 84, 0.35)' });
      }
      // En passant destinations get a warmer tint: this move is a capture.
      for (const ep of getEnPassantMoves(selectedId)) {
        list.push({ square: ep.to, color: 'rgba(255, 120, 70, 0.45)' });
      }
    }
    return list;
  }, [selectedId, selectedMoves, pieces, getEnPassantMoves]);

  const checkHighlights = useMemo(() => {
    if (!showCheckOverlay) return [];
    const list = [];
    const opponent = sideToMove === 'white' ? 'black' : 'white';
    const squares = (checkingSquaresBySide && checkingSquaresBySide[opponent]) ? checkingSquaresBySide[opponent] : [];
    for (const sq of squares) {
      list.push({ square: sq, color: 'rgba(255, 0, 0, 0.22)' });
    }
    return list;
  }, [checkingSquaresBySide, sideToMove, showCheckOverlay]);

  const combinedHighlights = useMemo(() => {
    const combined = [];
    if (checkHighlights && checkHighlights.length) combined.push(...checkHighlights);
    if (baseHighlights && baseHighlights.length) combined.push(...baseHighlights);
    if (trayHighlights && trayHighlights.length) combined.push(...trayHighlights);
    // Choreographed move: light the destination in the same gold as the glow.
    if (introGuide) combined.push({ square: introGuide.to, color: 'rgba(255, 200, 80, 0.4)' });
    return combined;
  }, [baseHighlights, checkHighlights, trayHighlights, introGuide]);

  return {
    selectedId,
    setSelectedId,
    clearSelection,
    pendingEpChoice,
    setPendingEpChoice,
    selectedMoves,
    combinedHighlights,
    performMove,
    handleSquareClick,
    handlePieceClick,
    handlePieceDragStart,
    handlePieceDrop,
    handleDragHover,
    handleSquareRightClick,
    handleSetHighlights,
    handleClearHighlights,
  };
}
