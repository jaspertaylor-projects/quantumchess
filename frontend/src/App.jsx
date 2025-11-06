// frontend/src/App.jsx
// Purpose: Render the Quantum Chess UI, manage game state, and integrate online matchmaking with a server-authoritative chess clock. Handles legal moves, castling, checkmate, and syncs moves and clock over WebSocket. Includes optional local AI opponent via alpha-beta search.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx, ./chessboard/useQuantumGameState.js, ./settings/SettingsModal.jsx, ./settings/usePieceColors.js, ./settings/useBoardColors.js, ./settings/usePlayerBarColors.js, ./tray/SideTray.jsx, ./tray/RulesModal.jsx, ./store/gameSlice.js, ./store/settingsSlice.js, ./chessboard/rasterPrewarm.js, ./tray/matchmakingClient.js, ./components/AppHeader.jsx, ./components/PlayerBar.jsx, ./components/WinnerModal.jsx, ./hooks/useChessClock.js, ./hooks/clockUtils.js, ./ai/useLocalAi.js
// Exported To: None
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';
import useQuantumGameState from './chessboard/useQuantumGameState.js';
import SettingsModal from './settings/SettingsModal.jsx';
import usePieceColors, { DEFAULT_WHITE, DEFAULT_BLACK } from './settings/usePieceColors.js';
import useBoardColors, { DEFAULT_BOARD } from './settings/useBoardColors.js';
import usePlayerBarColors, { DEFAULT_PLAYER_BAR_COLORS } from './settings/usePlayerBarColors.js';
import SideTray from './tray/SideTray.jsx';
import RulesModal from './tray/RulesModal.jsx';
import { useDispatch, useSelector } from 'react-redux';
import { addMove, resetGame, setUserTeam } from './store/gameSlice.js';
import { setGameSettings } from './store/settingsSlice.js';
import { prewarmAllPiecePngs, invalidateRasterPngs, prewarmCapturedPiecePngs } from './chessboard/rasterPrewarm.js';
import { getOrCreateClientId, joinQueue, waitForMatch, leaveQueue, connectToRoomWs, sendMoveWs, sendCastleWs } from './tray/matchmakingClient.js';
import AppHeader from './components/AppHeader.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import WinnerModal from './components/WinnerModal.jsx';
import useChessClock from './hooks/useChessClock.js';
import { formatClock, clampMs } from './hooks/clockUtils.js';
import useLocalAi from './ai/useLocalAi.js';

export default function App() {
  const boardStageRef = useRef(null);
  const topBarRef = useRef(null);
  const bottomBarRef = useRef(null);
  const [boardSize, setBoardSize] = useState(0);
  const [trayHeight, setTrayHeight] = useState(0);

  const {
    pieces,
    sideToMove,
    getPieceAtSquare,
    getLegalMoves,
    movePiece,
    checkingSquaresBySide,
    canCastleBetween,
    castlePieces,
    // timeline
    viewIndex,
    historyLength,
    setViewIndex,
    canMakeMove,
    // game state
    gameOver,
    winner,
  } = useQuantumGameState();

  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [trayHighlights, setTrayHighlights] = useState([]);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [showCheckOverlay, setShowCheckOverlay] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [showWinPopup, setShowWinPopup] = useState(false);

  const [gameInstanceId, setGameInstanceId] = useState(0);

  const [mmActive, setMmActive] = useState(false);
  const mmAbortRef = useRef(false);
  const mmClientIdRef = useRef(null);
  const mmRoomIdRef = useRef(null);
  const wsApiRef = useRef(null);
  const isOnlineGameRef = useRef(false);
  const wsMessageHandlerRef = useRef(null);

  const [serverClock, setServerClock] = useState({ active: 'none', whiteMs: 5 * 60 * 1000, blackMs: 5 * 60 * 1000 });

  const { whiteColors, blackColors, setWhiteColors, setBlackColors, svgStyles } = usePieceColors();
  const { boardColors, setBoardColors } = useBoardColors();
  const { playerBarColors, setPlayerBarColors } = usePlayerBarColors();

  const dispatch = useDispatch();
  const userTeam = useSelector((state) => state.game.userTeam || 'white');
  const timeControl = useSelector((state) => state.settings.timeControl || '5+0');
  const moves = useSelector((state) => state.game.moves || []);

  const aiEnabledRef = useRef(false);
  const aiDifficultyRef = useRef('medium');

  const selectedMoves = useMemo(() => {
    if (!selectedId) return [];
    return getLegalMoves(selectedId);
  }, [selectedId, getLegalMoves]);

  const whitePlayer = 'White';
  const blackPlayer = 'Black';
  const whiteRating = '????';
  const blackRating = '????';

  useEffect(() => {
    const el = boardStageRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const rawWidth = Math.floor(rect.width);
      let rawHeight = Math.floor(rect.height);

      const topH = topBarRef.current ? Math.ceil(topBarRef.current.getBoundingClientRect().height) : 0;
      const bottomH = bottomBarRef.current ? Math.ceil(bottomBarRef.current.getBoundingClientRect().height) : 0;
      const verticalGaps = 16;
      const availableHeight = Math.max(0, rawHeight - topH - bottomH - verticalGaps);

      const rawSize = Math.min(rawWidth, availableHeight);
      const cell = Math.max(1, Math.floor(rawSize / 8));
      const quantizedSize = cell * 8;
      setBoardSize(quantizedSize);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('orientationchange', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  const currentPieceSize = useMemo(() => {
    if (!boardSize || boardSize <= 0) return 64;
    return Math.max(8, Math.floor(boardSize / 8));
  }, [boardSize]);

  useEffect(() => {
    if (!currentPieceSize || currentPieceSize <= 0) return;
    prewarmAllPiecePngs({ cssVarsBySide: svgStyles, sizes: [currentPieceSize, 64, 26], renderHint: currentPieceSize <= 56 ? 'crisp' : 'precision' });
    prewarmCapturedPiecePngs({ cssVarsBySide: svgStyles, sizes: [26], renderHint: 'crisp' });
  }, [currentPieceSize, svgStyles]);

  useEffect(() => {
    if (gameOver) {
      setShowWinPopup(true);
    }
  }, [gameOver]);

  useEffect(() => {
    return () => {
      mmAbortRef.current = true;
      const id = mmClientIdRef.current;
      try {
        if (wsApiRef.current) wsApiRef.current.close();
      } catch (_) {}
      if (id) {
        leaveQueue(id).catch(() => {});
      }
    };
  }, []);

  const styles = {
    appContainer: {
      backgroundColor: theme.boardAreaBackground,
      color: theme.textPrimary,
      height: '100vh',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 'env(safe-area-inset-top)',
      paddingRight: 'env(safe-area-inset-right)',
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
      paddingLeft: 'env(safe-area-inset-left)',
      boxSizing: 'border-box',
      gap: '0.5rem',
      overflow: 'hidden',
    },
    boardArea: {
      flex: 1,
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      padding: 'clamp(8px, 2vh, 16px)',
      overflow: 'hidden',
      backgroundColor: theme.boardAreaBackground,
    },
    boardStack: {
      width: '100%',
      height: '100%',
      maxWidth: 'min(96vmin, 1200px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'stretch',
      gap: '8px',
      boxSizing: 'border-box',
    },
    boardStage: {
      width: '100%',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      boxSizing: 'border-box',
      overflow: 'hidden',
    },
    boardRow: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
  };

  const isOnline = useCallback(() => Boolean(isOnlineGameRef.current), []);
  const isUsersTurn = useCallback(() => !isOnline() || sideToMove === userTeam, [isOnline, sideToMove, userTeam]);
  const ownsPiece = useCallback((piece) => !isOnline() || (piece && piece.side === userTeam), [isOnline, userTeam]);

  const handleSquareClick = (data) => {
    if (!canMakeMove) {
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      return;
    }

    if (isOnline() && !isUsersTurn()) {
      setInfoMessage('Not your turn.');
      return;
    }

    const { square } = data;
    const piece = getPieceAtSquare(square);

    if (piece) {
      if (!ownsPiece(piece)) {
        setInfoMessage('You can only select your own pieces in online games.');
        return;
      }
      if (piece.side === sideToMove) {
        if (selectedId && selectedId !== piece.id) {
          const left = pieces.find((p) => p.id === selectedId);
          if (left && ownsPiece(left)) {
            const { canCastle, reason, plan } = canCastleBetween(selectedId, piece.id);
            if (canCastle) {
              const result = castlePieces(selectedId, piece.id);
              if (result.success) {
                dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: piece.side }));
                dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: piece.side }));
                if (isOnline() && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
                  sendCastleWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, side: piece.side, plan });
                }
                setSelectedId(null);
                setTrayHighlights([]);
                setInfoMessage('');
                return;
              } else {
                if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Castling failed.');
              }
            } else {
              setInfoMessage(reason || 'Cannot castle with these pieces.');
            }
          } else {
            setInfoMessage('You can only castle with your own pieces in online games.');
          }
        }
        setSelectedId(piece.id);
        setTrayHighlights([]);
      }
      return;
    }

    if (selectedId) {
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
      const legal = new Set(getLegalMoves(selectedId));
      if (legal.has(square)) {
        const fromSquare = movingPiece && movingPiece.square ? movingPiece.square : null;
        const result = movePiece(selectedId, square);
        if (result.success && fromSquare) {
          dispatch(addMove({ from: fromSquare, to: square, side: movingPiece.side }));
          if (isOnline() && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
            sendMoveWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, from: fromSquare, to: square, side: movingPiece.side });
          }
          setInfoMessage('');
        } else if (!result.success) {
          if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Illegal move.');
        }
        setSelectedId(null);
      } else {
        setInfoMessage('Illegal move.');
        setSelectedId(null);
      }
    }
  };

  const handlePieceClick = ({ id }) => {
    if (!canMakeMove) {
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      return;
    }

    if (isOnline() && !isUsersTurn()) {
      setInfoMessage('Not your turn.');
      return;
    }

    const clicked = pieces.find((x) => x.id === id);
    if (!clicked) return;

    if (!ownsPiece(clicked)) {
      setInfoMessage('You can only select your own pieces in online games.');
      return;
    }

    if (clicked.side === sideToMove) {
      if (selectedId && selectedId !== id) {
        const left = pieces.find((p) => p.id === selectedId);
        if (left && ownsPiece(left)) {
          const { canCastle, reason, plan } = canCastleBetween(selectedId, id);
          if (canCastle) {
            const result = castlePieces(selectedId, id);
            if (result.success) {
              dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: clicked.side }));
              dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: clicked.side }));
              if (isOnline() && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
                sendCastleWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, side: clicked.side, plan });
              }
              setSelectedId(null);
              setTrayHighlights([]);
              setInfoMessage('');
              return;
            } else {
              if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Castling failed.');
            }
          } else {
            setInfoMessage(reason || 'Cannot castle with these pieces.');
          }
        } else {
          setInfoMessage('You can only castle with your own pieces in online games.');
        }
      }
      setSelectedId(id);
      setTrayHighlights([]);
      return;
    }

    if (selectedId) {
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
      const legal = new Set(getLegalMoves(selectedId));
      const destSquare = clicked.square;
      if (destSquare && legal.has(destSquare)) {
        const fromSquare = movingPiece.square || null;
        const result = movePiece(selectedId, destSquare);
        if (result.success && fromSquare) {
          dispatch(addMove({ from: fromSquare, to: destSquare, side: movingPiece.side }));
          if (isOnline() && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
            sendMoveWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, from: fromSquare, to: destSquare, side: movingPiece.side });
          }
          setInfoMessage('');
        } else if (!result.success) {
          if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Illegal move.');
        }
        setSelectedId(null);
      } else {
        setInfoMessage('Illegal move.');
        setSelectedId(null);
      }
    }
  };

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
    }
    return list;
  }, [selectedId, selectedMoves, pieces]);

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
    if (baseHighlights && baseHighlights.length) combined.push(...baseHighlights);
    if (checkHighlights && checkHighlights.length) combined.push(...checkHighlights);
    if (trayHighlights && trayHighlights.length) combined.push(...trayHighlights);
    return combined;
  }, [baseHighlights, checkHighlights, trayHighlights]);

  const whiteCapturedPawns = useMemo(() => {
    return pieces
      .filter((p) => p.captured && p.side === 'white' && Array.isArray(p.possibleTypes) && p.possibleTypes[0] === 'p')
      .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
  }, [pieces]);

  const whiteCapturedOthers = useMemo(() => {
    return pieces
      .filter((p) => p.captured && p.side === 'white' && Array.isArray(p.possibleTypes) && p.possibleTypes[0] !== 'p')
      .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
  }, [pieces]);

  const blackCapturedPawns = useMemo(() => {
    return pieces
      .filter((p) => p.captured && p.side === 'black' && Array.isArray(p.possibleTypes) && p.possibleTypes[0] === 'p')
      .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
  }, [pieces]);

  const blackCapturedOthers = useMemo(() => {
    return pieces
      .filter((p) => p.captured && p.side === 'black' && Array.isArray(p.possibleTypes) && p.possibleTypes[0] !== 'p')
      .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
  }, [pieces]);

  const handleBoardResize = useCallback((px) => {
    setTrayHeight(px);
  }, []);

  const handleSquareRightClick = useCallback(() => {}, []);

  const handleSetHighlights = useCallback((arr) => {
    setTrayHighlights(Array.isArray(arr) ? arr : []);
  }, []);

  const handleClearHighlights = useCallback(() => {
    setTrayHighlights([]);
  }, []);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleOpenRules = useCallback(() => setRulesOpen(true), []);

  useEffect(() => {
    wsMessageHandlerRef.current = (msg) => {
      if (!msg || typeof msg !== 'object') return;
      const myId = mmClientIdRef.current;

      const maybeApplyClock = (clock) => {
        if (!clock) return;
        const w = clampMs(Number(clock.whiteMs || 0));
        const b = clampMs(Number(clock.blackMs || 0));
        const active = clock.active === 'white' || clock.active === 'black' ? clock.active : 'none';
        setServerClock({ whiteMs: w, blackMs: b, active });
      };

      if (msg.type === 'welcome') {
        console.debug('[WS][client] welcome', { you: msg.you, turn: msg.turn, seq: msg.seq });
        maybeApplyClock(msg.clock);
        return;
      }
      if (msg.type === 'room_state') {
        console.debug('[WS][client] room_state', { connected: msg.connected, turn: msg.turn, seq: msg.seq });
        maybeApplyClock(msg.clock);
        return;
      }
      if (msg.type === 'clock_update') {
        maybeApplyClock(msg.clock);
        return;
      }
      if (msg.type === 'error') {
        const detail = typeof msg.detail === 'string' ? msg.detail : 'Server rejected the last action.';
        console.warn('[WS][client] error', { detail });
        setInfoMessage(detail);
        return;
      }

      if (msg.type === 'move') {
        if (msg.by && myId && msg.by === myId) {
          maybeApplyClock(msg.clock);
          return;
        }
        const from = msg.from;
        const to = msg.to;
        const sideMsg = msg.side;
        if (typeof from !== 'string' || typeof to !== 'string') return;
        const piece = getPieceAtSquare(from);
        if (!piece) {
          console.warn('[WS][client] move: piece not found at from square', { from, to, sideMsg });
          maybeApplyClock(msg.clock);
          return;
        }
        const result = movePiece(piece.id, to);
        if (result && result.success) {
          dispatch(addMove({ from, to, side: sideMsg === 'white' || sideMsg === 'black' ? sideMsg : piece.side }));
          setInfoMessage('Opponent moved.');
          console.debug('[WS][client] applied opponent move', { from, to, side: sideMsg });
        } else {
          console.warn('[WS][client] failed to apply opponent move', { from, to, sideMsg });
        }
        maybeApplyClock(msg.clock);
        return;
      }

      if (msg.type === 'castle') {
        if (msg.by && myId && msg.by === myId) {
          maybeApplyClock(msg.clock);
          return;
        }
        const { piece1_from, piece1_to, piece2_from, piece2_to, side: sideMsg } = msg;
        const p1 = getPieceAtSquare(piece1_from);
        const p2 = getPieceAtSquare(piece2_from);
        if (!p1 || !p2) {
          console.warn('[WS][client] castle: pieces not found at from squares', { p1: piece1_from, p2: piece2_from });
          maybeApplyClock(msg.clock);
          return;
        }
        const { canCastle, plan } = canCastleBetween(p1.id, p2.id);
        if (!canCastle || !plan) {
          console.warn('[WS][client] castle: cannot castle between received pieces', { piece1_from, piece2_from });
          maybeApplyClock(msg.clock);
          return;
        }
        const result = castlePieces(p1.id, p2.id);
        if (result && result.success) {
          dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: sideMsg }));
          dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: sideMsg }));
          setInfoMessage('Opponent castled.');
          console.debug('[WS][client] applied opponent castle', { plan, side: sideMsg });
        } else {
          console.warn('[WS][client] failed to apply opponent castle', { plan, side: sideMsg });
        }
        maybeApplyClock(msg.clock);
        return;
      }

      console.debug('[WS][client] unhandled message', msg);
    };
  }, [getPieceAtSquare, movePiece, canCastleBetween, castlePieces, dispatch]);

  const attachWsHandlers = useCallback(() => {
    if (!wsApiRef.current) return;
    const api = wsApiRef.current;
    api._bound = true;
  }, []);

  const startWsConnection = useCallback(({ roomId, clientId, side }) => {
    try {
      if (wsApiRef.current) wsApiRef.current.close();
    } catch (_) {}

    wsApiRef.current = connectToRoomWs({
      roomId,
      clientId,
      onOpen: () => {
        setInfoMessage(`Connected to room ${String(roomId).slice(0, 6)}`);
        console.debug('[WS][client] open', { roomId, clientId, side });
      },
      onClose: () => {
        setInfoMessage('Disconnected from game server.');
        console.debug('[WS][client] close', { roomId, clientId });
        setServerClock({ active: 'none', whiteMs: 5 * 60 * 1000, blackMs: 5 * 60 * 1000 });
      },
      onMessage: (msg) => {
        const fn = wsMessageHandlerRef.current;
        if (typeof fn === 'function') fn(msg);
      },
      onError: () => {
        console.error('[WS][client] error');
      },
    });

    attachWsHandlers();
  }, [attachWsHandlers]);

  const handleStartGame = useCallback((settings) => {
    mmAbortRef.current = true;

    dispatch(setGameSettings(settings));
    dispatch(resetGame());

    setGameInstanceId((n) => n + 1);

    isOnlineGameRef.current = false;
    aiEnabledRef.current = false;
    aiDifficultyRef.current = settings && typeof settings.aiDifficulty === 'string' ? settings.aiDifficulty : 'medium';

    try { if (wsApiRef.current) wsApiRef.current.close(); } catch (_) {}
    wsApiRef.current = null;

    setServerClock({ active: 'none', whiteMs: 5 * 60 * 1000, blackMs: 5 * 60 * 1000 });

    if (settings && settings.gameMode === 'online') {
      const clientId = getOrCreateClientId();
      mmClientIdRef.current = clientId;
      mmAbortRef.current = false;

      (async () => {
        try {
          const join = await joinQueue({ clientId });
          if (join.status === 'matched') {
            const side = (join.side === 'white' || join.side === 'black') ? join.side : 'white';
            const roomId = join.roomId;
            mmRoomIdRef.current = roomId;
            isOnlineGameRef.current = true;
            dispatch(setUserTeam(side));
            setInfoMessage(`Matched! You are ${side.toUpperCase()}. Room ${String(join.roomId || '').slice(0, 6)}`);
            setMmActive(false);
            startWsConnection({ roomId, clientId, side });
            return;
          }
          if (join.status === 'queued') {
            setInfoMessage('Searching for an opponent...');
            setMmActive(true);
            const found = await waitForMatch(clientId, {
              intervalMs: 1200,
              timeoutMs: 60000,
              shouldStop: () => mmAbortRef.current,
            });
            if (found && found.status === 'matched') {
              const side = (found.side === 'white' || found.side === 'black') ? found.side : 'white';
              const roomId = found.roomId;
              mmRoomIdRef.current = roomId;
              isOnlineGameRef.current = true;
              dispatch(setUserTeam(side));
              setInfoMessage(`Matched! You are ${side.toUpperCase()}. Room ${String(found.roomId || '').slice(0, 6)}`);
              setMmActive(false);
              startWsConnection({ roomId, clientId, side });
            } else {
              setInfoMessage('Still searching for an opponent...');
            }
            return;
          }
          setInfoMessage('Matchmaking error. Please try again.');
        } catch (e) {
          setInfoMessage('Failed to contact matchmaking service.');
        }
      })();
      return;
    }

    if (settings && settings.gameMode === 'ai') {
      aiEnabledRef.current = true;
      dispatch(setUserTeam('white'));
      setInfoMessage('New game vs AI started.');
      return;
    }

    setInfoMessage('New local game started.');
  }, [dispatch, startWsConnection]);

  const handlePieceDragStart = useCallback((piece) => {
    if (!piece) return false;
    if (!canMakeMove) return false;
    if (isOnlineGameRef.current) {
      if (piece.side !== userTeam) return false;
      if (sideToMove !== userTeam) return false;
    } else {
      if (aiEnabledRef.current) {
        if (piece.side !== 'white') return false;
        if (sideToMove !== 'white') return false;
      } else {
        if (piece.side !== sideToMove) return false;
      }
    }
    setSelectedId(piece.id);
    setTrayHighlights([]);
    return true;
  }, [sideToMove, canMakeMove, userTeam]);

  const handlePieceDrop = useCallback(({ id, from, to }) => {
    if (!canMakeMove) { 
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      setSelectedId(null); 
      return; 
    }

    if (isOnlineGameRef.current && sideToMove !== userTeam) {
      setInfoMessage('Not your turn.');
      setSelectedId(null);
      return;
    }
    if (!isOnlineGameRef.current && aiEnabledRef.current && sideToMove !== 'white') {
      setInfoMessage('Not your turn.');
      setSelectedId(null);
      return;
    }

    const movingPiece = pieces.find((p) => p.id === id);
    if (!movingPiece) {
      setSelectedId(null);
      return;
    }

    if (isOnlineGameRef.current && movingPiece.side !== userTeam) {
      setInfoMessage('You can only move your own pieces in online games.');
      setSelectedId(null);
      return;
    }
    if (!isOnlineGameRef.current && aiEnabledRef.current && movingPiece.side !== 'white') {
      setInfoMessage('You are playing White vs AI.');
      setSelectedId(null);
      return;
    }

    if (!to) {
      setSelectedId(null);
      return;
    }

    const targetAtDest = getPieceAtSquare(to);
    if (targetAtDest && targetAtDest.side === movingPiece.side) {
      const { canCastle, reason, plan } = canCastleBetween(id, targetAtDest.id);
      if (canCastle) {
        const result = castlePieces(id, targetAtDest.id);
        if (result.success) {
          dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: movingPiece.side }));
          dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: movingPiece.side }));
          if (isOnlineGameRef.current && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
            sendCastleWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, side: movingPiece.side, plan });
          }
          setInfoMessage('');
        } else {
          if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Castling failed.');
        }
      } else {
        setInfoMessage(reason || 'Cannot castle with these pieces.');
      }
      setSelectedId(null);
      return;
    }

    const legal = new Set(getLegalMoves(id));
    if (!legal.has(to)) {
      setInfoMessage('Illegal move.');
      setSelectedId(null);
      return;
    }
    const fromSquare = movingPiece.square || from || null;
    const result = movePiece(id, to);
    if (result.success && fromSquare) {
      dispatch(addMove({ from: fromSquare, to, side: movingPiece.side }));
      if (isOnlineGameRef.current && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
        sendMoveWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, from: fromSquare, to, side: movingPiece.side });
      }
      setInfoMessage('');
    } else if (!result.success) {
      if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Move failed due to game constraints.');
    }
    setSelectedId(null);
  }, [pieces, getPieceAtSquare, canCastleBetween, castlePieces, getLegalMoves, movePiece, dispatch, canMakeMove, gameOver, winner, sideToMove, userTeam]);

  const handleDragHover = useCallback(() => {}, []);

  const handleSeekToIndex = useCallback((moveIndex) => {
    setSelectedId(null);
    if (typeof moveIndex !== 'number') return;
    if (moveIndex < 0) {
      setViewIndex(0);
    } else {
      const snapIndex = Math.max(0, Math.min(historyLength - 1, moveIndex + 1));
      setViewIndex(snapIndex);
    }
  }, [historyLength, setViewIndex]);

  function colorsEqual(a, b) {
    if (!a || !b) return false;
    return a.icon === b.icon && a.bandFill === b.bandFill && a.bandStroke === b.bandStroke;
  }

  const handleAcceptSettings = useCallback(async (settings) => {
    const whiteChanged = !colorsEqual(whiteColors, settings.white);
    const blackChanged = !colorsEqual(blackColors, settings.black);
    const anyPieceColorChanged = whiteChanged || blackChanged;

    if (whiteChanged) setWhiteColors(settings.white);
    if (blackChanged) setBlackColors(settings.black);

    setBoardColors(settings.board);
    setPlayerBarColors(settings.playerBar);
    setShowCoordinates(settings.coordinates);
    setShowCheckOverlay(settings.checkOverlay);

    if (!anyPieceColorChanged) {
      return;
    }

    const effectiveWhite = whiteChanged ? settings.white : whiteColors;
    const effectiveBlack = blackChanged ? settings.black : blackColors;

    const newSvgStyles = {
      white: {
        ['--band-fill']: effectiveWhite.bandFill,
        ['--band-stroke']: effectiveWhite.bandStroke,
        ['--icon-color']: effectiveWhite.icon,
      },
      black: {
        ['--band-fill']: effectiveBlack.bandFill,
        ['--band-stroke']: effectiveBlack.bandStroke,
        ['--icon-color']: effectiveBlack.icon,
      },
    };

    invalidateRasterPngs('piece-colors-changed');
    await prewarmAllPiecePngs({
      cssVarsBySide: newSvgStyles,
      sizes: [currentPieceSize, 64, 26],
      renderHint: currentPieceSize <= 56 ? 'crisp' : 'precision',
    });
    await prewarmCapturedPiecePngs({ cssVarsBySide: newSvgStyles, sizes: [26], renderHint: 'crisp' });
  }, [whiteColors, blackColors, setWhiteColors, setBlackColors, setBoardColors, setPlayerBarColors, setShowCoordinates, setShowCheckOverlay, currentPieceSize]);

  const winnerText = useMemo(() => {
    if (!gameOver) return '';
    if (!winner) return 'Game over.';
    const w = winner[0].toUpperCase() + winner.slice(1);
    return `${w} wins by checkmate!`;
  }, [gameOver, winner]);

  const localClock = useChessClock({
    timeControl,
    sideToMove,
    isLive: canMakeMove && !gameOver && !isOnlineGameRef.current,
    moves,
    gameInstanceId,
  });

  const effectiveClock = useMemo(() => {
    if (isOnlineGameRef.current) {
      const w = clampMs(serverClock.whiteMs || 0);
      const b = clampMs(serverClock.blackMs || 0);
      const active = serverClock.active === 'white' || serverClock.active === 'black' ? serverClock.active : 'none';
      const whiteText = formatClock(w);
      const blackText = formatClock(b);
      const whiteLow = w <= 10000;
      const blackLow = b <= 10000;
      return {
        whiteMs: w,
        blackMs: b,
        whiteText,
        blackText,
        whiteActive: active === 'white' && w > 0 && b > 0,
        blackActive: active === 'black' && w > 0 && b > 0,
        whiteLow,
        blackLow,
      };
    }
    return localClock;
  }, [serverClock, localClock]);

  const aiSide = useMemo(() => (userTeam === 'white' ? 'black' : 'white'), [userTeam]);

  const applyEngineMove = useCallback((mv, side) => {
    if (!mv) return;
    if (isOnlineGameRef.current) return;
    if (!aiEnabledRef.current) return;
    if (sideToMove !== side) return;

    if (mv.type === 'move') {
      const piece = getPieceAtSquare(mv.from);
      if (!piece) return;
      const res = movePiece(piece.id, mv.to);
      if (res && res.success) {
        dispatch(addMove({ from: mv.from, to: mv.to, side }));
        setInfoMessage('AI moved.');
      }
      return;
    }
    if (mv.type === 'castle') {
      const plan = mv.plan;
      const p1 = getPieceAtSquare(plan.piece1_from);
      const p2 = getPieceAtSquare(plan.piece2_from);
      if (!p1 || !p2) return;
      const { canCastle } = canCastleBetween(p1.id, p2.id);
      if (!canCastle) return;
      const res = castlePieces(p1.id, p2.id);
      if (res && res.success) {
        dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side }));
        dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side }));
        setInfoMessage('AI castled.');
      }
      return;
    }
  }, [dispatch, sideToMove, getPieceAtSquare, movePiece, canCastleBetween, castlePieces]);

  useLocalAi({
    enabled: !isOnlineGameRef.current && aiEnabledRef.current,
    aiSide,
    difficulty: aiDifficultyRef.current,
    pieces,
    sideToMove,
    canMakeMove,
    gameOver,
    onApplyMove: applyEngineMove,
  });

  // Map timeline viewIndex to the currently selected move index (-1 means before any moves)
  const currentMoveIndex = useMemo(() => {
    const idx = viewIndex - 1;
    const capped = Math.min(moves.length - 1, Math.max(-1, idx));
    return Number.isFinite(capped) ? capped : -1;
  }, [viewIndex, moves.length]);

  // Keyboard navigation: left/right arrows step through move history
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e) return;
      const key = e.key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target;
      if (target) {
        const tag = (target.tagName || '').toLowerCase();
        const editable = target.isContentEditable === true;
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable) {
          return;
        }
      }
      e.preventDefault();

      const total = moves.length;
      const curr = currentMoveIndex;
      let nextIdx = curr;
      if (key === 'ArrowLeft') {
        nextIdx = Math.max(-1, curr - 1);
      } else if (key === 'ArrowRight') {
        nextIdx = Math.min(total - 1, curr + 1);
      }
      if (nextIdx === curr) return;

      setSelectedId(null);
      const snapIndex = Math.max(0, Math.min(historyLength - 1, nextIdx + 1));
      setViewIndex(snapIndex);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentMoveIndex, moves.length, historyLength, setViewIndex]);

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      <AppHeader svgStyles={svgStyles} />

      <div className="qc-board-area" style={styles.boardArea}>
        <div className="qc-board-stack" style={styles.boardStack}>
          <div className="qc-board-stage" style={styles.boardStage} ref={boardStageRef}>
            <PlayerBar
              side="black"
              playerName={blackPlayer}
              rating={blackRating}
              playerBarColors={playerBarColors}
              clockText={effectiveClock.blackText}
              clockActive={effectiveClock.blackActive}
              clockLow={effectiveClock.blackLow}
              capturedPawns={blackCapturedPawns}
              capturedOthers={blackCapturedOthers}
              svgStyles={svgStyles}
              barRef={topBarRef}
            />

            <div className="qc-board-row" style={styles.boardRow}>
              <Board
                orientation={userTeam}
                showCoordinates={showCoordinates}
                highlights={combinedHighlights}
                onSquareClick={handleSquareClick}
                onSquareRightClick={handleSquareRightClick}
                onPieceClick={handlePieceClick}
                onPieceDragStart={handlePieceDragStart}
                onPieceDrop={handlePieceDrop}
                onDragHover={handleDragHover}
                pieces={pieces}
                selectedId={selectedId}
                legalMoves={selectedMoves}
                maxVisualSize={boardSize > 0 ? `${boardSize}px` : 'min(85vmin, 720px)'}
                borderColor="transparent"
                shadow="rgba(0, 0, 0, 0.15)"
                pieceSvgStyles={svgStyles}
                onResize={handleBoardResize}
                squareColors={boardColors}
              />

              <SideTray
                height={trayHeight}
                infoMessage={infoMessage}
                onOpenSettings={handleOpenSettings}
                onOpenRules={handleOpenRules}
                onStartGame={handleStartGame}
                onSetHighlights={handleSetHighlights}
                onClearHighlights={handleClearHighlights}
                onSeekToIndex={handleSeekToIndex}
                externalIndex={currentMoveIndex}
              />
            </div>

            <PlayerBar
              side="white"
              playerName={whitePlayer}
              rating={whiteRating}
              playerBarColors={playerBarColors}
              clockText={effectiveClock.whiteText}
              clockActive={effectiveClock.whiteActive}
              clockLow={effectiveClock.whiteLow}
              capturedPawns={whiteCapturedPawns}
              capturedOthers={whiteCapturedOthers}
              svgStyles={svgStyles}
              barRef={bottomBarRef}
            />
          </div>
        </div>
      </div>

      <WinnerModal open={showWinPopup} winnerText={winnerText} onClose={() => setShowWinPopup(false)} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        whiteColors={whiteColors}
        blackColors={blackColors}
        boardColors={boardColors}
        playerBarColors={playerBarColors}
        showCoordinates={showCoordinates}
        showCheckOverlay={showCheckOverlay}
        defaultWhiteColors={DEFAULT_WHITE}
        defaultBlackColors={DEFAULT_BLACK}
        defaultBoardColors={DEFAULT_BOARD}
        defaultPlayerBarColors={DEFAULT_PLAYER_BAR_COLORS}
        onAccept={handleAcceptSettings}
      />

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
