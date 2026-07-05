// frontend/src/App.jsx
// Purpose: Render the Quantum Chess UI, manage game state, and integrate online matchmaking with a server-authoritative chess clock. Handles legal moves, castling, checkmate, and syncs moves and clock over WebSocket. Includes optional local AI opponent via alpha-beta search. Adds in-game actions (resign/draw) and defers game start until New Game or first white move.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx, ./chessboard/useQuantumGameState.js, ./settings/SettingsModal.jsx, ./settings/usePieceColors.js, ./settings/useBoardColors.js, ./settings/usePlayerBarColors.js, ./tray/SideTray.jsx, ./tray/RulesModal.jsx, ./store/gameSlice.js, ./store/settingsSlice.js, ./chessboard/rasterPrewarm.js, ./tray/matchmakingClient.js, ./components/AppHeader.jsx, ./components/PlayerBar.jsx, ./components/WinnerModal.jsx, ./hooks/useChessClock.js, ./hooks/clockUtils.js, ./ai/useLocalAi.js
// Exported To: None
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';
import useQuantumGameState from './chessboard/useQuantumGameState.js';
import useMeasurementColors, { DEFAULT_MEASUREMENT_COLORS, hexToRgbString } from './settings/useMeasurementColors.js';
import useIndicatorSettings from './settings/useIndicatorSettings.js';
import SettingsModal from './settings/SettingsModal.jsx';
import usePieceColors, { DEFAULT_WHITE, DEFAULT_BLACK } from './settings/usePieceColors.js';
import useBoardColors, { DEFAULT_BOARD } from './settings/useBoardColors.js';
import usePlayerBarColors, { DEFAULT_PLAYER_BAR_COLORS } from './settings/usePlayerBarColors.js';
import SideTray from './tray/SideTray.jsx';
import RulesModal from './tray/RulesModal.jsx';
import TutorialModal from './tutorial/TutorialModal.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import ConsentBanner from './components/ConsentBanner.jsx';
import { initAds, maybeShowGameEndAd } from './ads/adService.js';
import useAuth from './account/useAuth.js';
import AccountModal from './account/AccountModal.jsx';
import { recordFinishedGame } from './account/gameSync.js';
import { useDispatch, useSelector } from 'react-redux';
import { addMove, resetGame, setUserTeam } from './store/gameSlice.js';
import { setGameSettings } from './store/settingsSlice.js';
import { prewarmAllPieceSvgs, invalidateSvgCaches, prewarmCapturedPieceSvgs } from './chessboard/svgPrewarm.js';
import { getOrCreateClientId, joinQueue, waitForMatch, leaveQueue, connectToRoomWs, sendMoveWs, sendCastleWs, sendGameOverWs } from './tray/matchmakingClient.js';
import AppHeader from './components/AppHeader.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import WinnerModal from './components/WinnerModal.jsx';
import EnPassantChoiceModal from './components/EnPassantChoiceModal.jsx';
import useChessClock from './hooks/useChessClock.js';
import { formatClock, clampMs } from './hooks/clockUtils.js';
import useLocalAi from './ai/useLocalAi.js';
import { getBotById, DEFAULT_BOT_ID, botInitials } from './ai/bots.js';

export default function App() {
  const boardStageRef = useRef(null);
  const topBarRef = useRef(null);
  const bottomBarRef = useRef(null);
  const [boardSize, setBoardSize] = useState(0);
  const [trayHeight, setTrayHeight] = useState(0);

  // Increment this to reset the engine timeline (fresh game state)
  const [gameInstanceId, setGameInstanceId] = useState(0);

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
    gameOverReason,
    lastMove,
    // en passant
    getEnPassantMoves,
  } = useQuantumGameState(gameInstanceId);

  const [selectedId, setSelectedId] = useState(null);
  // Pending disambiguation between an en passant capture and a quiet move to the same square.
  const [pendingEpChoice, setPendingEpChoice] = useState(null);
  // Narrow-screen (phone) layout: stack the tray under the board.
  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 760 : false));

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesInitialPage, setRulesInitialPage] = useState(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialLessonId, setTutorialLessonId] = useState(null);

  // Ads: dormant until VITE_ADSENSE_CLIENT is configured (post-approval).
  useEffect(() => {
    initAds();
  }, []);

  // First visit: instead of a modal wall, glow the Rules/tutorial and Sign-up
  // buttons and let the player dismiss with "Got it". Stored per-browser.
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem('qcOnboardSeen')) setOnboarding(true);
    } catch (_) {
      // storage unavailable — skip onboarding glow
    }
  }, []);
  const dismissOnboarding = useCallback(() => {
    setOnboarding(false);
    try {
      localStorage.setItem('qcOnboardSeen', '1');
    } catch (_) {
      // ignore
    }
  }, []);

  const closeTutorial = useCallback(() => {
    setTutorialOpen(false);
    setTutorialLessonId(null);
    try {
      localStorage.setItem('qcTutorialSeen', '1');
    } catch (_) {
      // ignore
    }
  }, []);
  const [trayHighlights, setTrayHighlights] = useState([]);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [showCheckOverlay, setShowCheckOverlay] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [showWinPopup, setShowWinPopup] = useState(false);

  // Tracks whether a game is considered "started". Initially false until a New Game starts or White makes the first move.
  const [gameStarted, setGameStarted] = useState(false);
  // Allows ending the game by actions outside the core engine (resign/draw), disabling further interaction and showing a result.
  const [externalGameOver, setExternalGameOver] = useState({ over: false, text: '' });

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
  const { measurementColors, setMeasurementColors } = useMeasurementColors();
  const { indicators, setIndicators } = useIndicatorSettings();
  const auth = useAuth();

  const dispatch = useDispatch();
  const userTeam = useSelector((state) => state.game.userTeam || 'white');
  const timeControl = useSelector((state) => state.settings.timeControl || '5+0');
  const moves = useSelector((state) => state.game.moves || []);

  const aiEnabledRef = useRef(false);
  const aiDifficultyRef = useRef('medium');
  // The selected AI opponent (null when not playing vs AI). State so the
  // player bars re-render with the bot's name, rating, and avatar.
  const [aiBot, setAiBot] = useState(null);

  const selectedMoves = useMemo(() => {
    if (!selectedId) return [];
    return getLegalMoves(selectedId);
  }, [selectedId, getLegalMoves]);

  const selectedPiece = useMemo(() => {
    if (!selectedId) return null;
    return pieces.find((p) => p.id === selectedId && !p.captured) || null;
  }, [selectedId, pieces]);

  // Rings on every piece the last move's measurement pulse touched, in the
  // measuring side's color. Cleared naturally when the next move lands.
  const measuredMarks = useMemo(() => {
    if (!lastMove || !Array.isArray(lastMove.measuredSquares) || lastMove.measuredSquares.length === 0) return [];
    const colors = measurementColors || DEFAULT_MEASUREMENT_COLORS;
    const rgb = hexToRgbString(colors[lastMove.side] || colors.white);
    return lastMove.measuredSquares.map((sq) => ({ square: sq, rgb }));
  }, [lastMove, measurementColors]);

  // Player identities: the human is "Anonymous"; a bot shows its name,
  // rating, and avatar; the second local player is "Stranger". Online games
  // keep the classic White/Black labels.
  const botSide = aiBot ? (userTeam === 'white' ? 'black' : 'white') : null;
  const botAvatar = aiBot ? { initials: botInitials(aiBot), hue: aiBot.hue ?? 200, imageUrl: `/bots/${aiBot.id}.png`, name: aiBot.name, tagline: aiBot.tagline || '' } : null;
  const anonymousAvatar = {
    initials: 'A',
    hue: 145,
    imageUrl: '/bots/anonymous.png',
    name: 'Anonymous',
    tagline: '',
    hoverNote: { text: 'Not affiliated with chess.com. Yet.', linkText: 'say hi', href: 'mailto:jaspertaylor15@protonmail.com' },
  };
  const strangerAvatar = { initials: 'S', hue: 320, imageUrl: '/bots/stranger.png', name: 'Stranger', tagline: '' };
  const isOnlineBars = isOnlineGameRef.current;
  // Signed-in players appear under their unique account username and rating.
  const selfName = (auth.profile && auth.profile.username) || 'Anonymous';
  const selfRating = auth.profile && Number.isFinite(auth.profile.rating) ? auth.profile.rating : '????';
  const nameFor = (side) => {
    if (botSide === side) return aiBot.name;
    if (isOnlineBars) return side === 'white' ? 'White' : 'Black';
    return side === userTeam ? selfName : 'Stranger';
  };
  const avatarFor = (side) => {
    if (botSide === side) return botAvatar;
    if (isOnlineBars) return null;
    return side === userTeam ? anonymousAvatar : strangerAvatar;
  };
  const whitePlayer = nameFor('white');
  const blackPlayer = nameFor('black');
  const ratingFor = (side) => {
    if (botSide === side) return aiBot.rating;
    if (!isOnlineBars && side === userTeam) return selfRating;
    return '????';
  };
  const whiteRating = ratingFor('white');
  const blackRating = ratingFor('black');
  const whiteAvatar = avatarFor('white');
  const blackAvatar = avatarFor('black');
  // The bar layout follows the table: your side sits at the bottom, the
  // opponent (bot or otherwise) across from you at the top.
  const topBarSide = userTeam === 'white' ? 'black' : 'white';
  const bottomBarSide = userTeam;

  // Signed-out players' "????" rating doubles as a sign-up call to action.
  const ratingClickFor = (side) =>
    !isOnlineBars && side === userTeam && !auth.user ? () => setAccountOpen(true) : null;

  const barPropsFor = (side) => (side === 'white' ? {
    side: 'white',
    playerName: whitePlayer,
    rating: whiteRating,
    onRatingClick: ratingClickFor('white'),
    avatar: whiteAvatar,
    tagline: botSide === 'white' ? (aiBot.tagline || null) : null,
    clockText: effectiveClock.whiteText,
    clockActive: effectiveClock.whiteActive,
    clockLow: effectiveClock.whiteLow,
    capturedPawns: whiteCapturedPawns,
    capturedOthers: whiteCapturedOthers,
  } : {
    side: 'black',
    playerName: blackPlayer,
    rating: blackRating,
    onRatingClick: ratingClickFor('black'),
    avatar: blackAvatar,
    tagline: botSide === 'black' ? (aiBot.tagline || null) : null,
    clockText: effectiveClock.blackText,
    clockActive: effectiveClock.blackActive,
    clockLow: effectiveClock.blackLow,
    capturedPawns: blackCapturedPawns,
    capturedOthers: blackCapturedOthers,
  });

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

      // In the side-by-side layout the tray sits next to the board, so its
      // width (clamp(260px, 38vmin, 360px)) must be reserved or the row
      // overflows and gets clipped on wide monitors.
      let widthBudget = rawWidth;
      if (!isNarrow) {
        const vmin = Math.min(window.innerWidth, window.innerHeight);
        const trayWidth = Math.min(360, Math.max(260, Math.round(0.38 * vmin)));
        widthBudget = Math.max(0, rawWidth - trayWidth - 16);
      }

      const rawSize = Math.min(widthBudget, availableHeight);
      const cell = Math.max(1, Math.floor(rawSize / 8));
      const quantizedSize = cell * 8;
      setBoardSize(quantizedSize);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The player bars mount when a game starts and change the space available
    // to the board; watch them too so the board re-fits around them.
    if (topBarRef.current) ro.observe(topBarRef.current);
    if (bottomBarRef.current) ro.observe(bottomBarRef.current);
    window.addEventListener('orientationchange', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [isNarrow, gameStarted]);

  const currentPieceSize = useMemo(() => {
    if (!boardSize || boardSize <= 0) return 64;
    return Math.max(8, Math.floor(boardSize / 8));
  }, [boardSize]);

  // Player bars span exactly the board + gap + side tray, centered with them.
  const barsWidth = useMemo(() => {
    if (!boardSize || boardSize <= 0 || isNarrow) return null;
    const vmin = Math.min(window.innerWidth, window.innerHeight);
    const trayWidth = Math.min(360, Math.max(260, Math.round(0.38 * vmin)));
    return boardSize + 12 + trayWidth;
  }, [boardSize, isNarrow]);

  const barWrapStyle = useMemo(() => ({
    width: barsWidth ? `${barsWidth}px` : '100%',
    maxWidth: '100%',
  }), [barsWidth]);

  useEffect(() => {
    if (!currentPieceSize || currentPieceSize <= 0) return;
    prewarmAllPieceSvgs({ cssVarsBySide: svgStyles });
    prewarmCapturedPieceSvgs({ cssVarsBySide: svgStyles });
  }, [currentPieceSize, svgStyles]);

  const reportedGameOverRef = useRef(false);
  useEffect(() => {
    if (!gameOver) {
      reportedGameOverRef.current = false;
      return;
    }
    setShowWinPopup(true);
    // Tell the server so it stops the clocks and informs the opponent. Both
    // clients derive the same result deterministically; first report wins.
    if (isOnlineGameRef.current && !reportedGameOverRef.current && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
      reportedGameOverRef.current = true;
      sendGameOverWs(wsApiRef.current, {
        roomId: mmRoomIdRef.current,
        clientId: mmClientIdRef.current,
        winner: winner || null,
        reason: gameOverReason || 'rules',
      });
    }
  }, [gameOver, winner, gameOverReason]);

  useEffect(() => {
    // silent: abandoning a game via "End & New Game" goes straight to the
    // setup panel with no winner popup.
    if (externalGameOver.over && !externalGameOver.silent) {
      setShowWinPopup(true);
    }
  }, [externalGameOver]);

  // A genuine game end (winner popup) is the interstitial ad break point;
  // silent abandons never trigger it. The ad service applies frequency caps
  // and is a complete no-op until a publisher id is configured.
  useEffect(() => {
    if (showWinPopup) maybeShowGameEndAd();
  }, [showWinPopup]);

  // Accounts (optional): save finished games for signed-in players and
  // apply Elo against rated bots. Saved exactly once per game end.
  const [accountOpen, setAccountOpen] = useState(false);
  const gameRecordedRef = useRef(false);
  useEffect(() => {
    if (!showWinPopup) {
      gameRecordedRef.current = false;
      return;
    }
    if (gameRecordedRef.current || !auth.user) return;
    gameRecordedRef.current = true;

    const text = externalGameOver.over ? externalGameOver.text || '' : '';
    const winnerSide = gameOver
      ? winner || null
      : /White (wins|resigns)/i.test(text)
        ? (/resigns/i.test(text) ? 'black' : 'white')
        : /Black (wins|resigns)/i.test(text)
          ? (/resigns/i.test(text) ? 'white' : 'black')
          : null;
    const result = winnerSide == null ? 'draw' : winnerSide === userTeam ? 'win' : 'loss';
    const vsBot = Boolean(aiBot) && !isOnlineGameRef.current;

    recordFinishedGame({
      user: auth.user,
      profile: auth.profile,
      opponent: vsBot ? aiBot.id : (isOnlineGameRef.current ? 'online' : 'local'),
      opponentRating: vsBot ? aiBot.rating : null,
      userSide: userTeam,
      result,
      moves,
    })
      .then(() => auth.refreshProfile())
      .catch(() => {});
  }, [showWinPopup, gameOver, winner, externalGameOver, userTeam, aiBot, moves]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Start the game implicitly if a first move has been recorded
  useEffect(() => {
    if (!gameStarted && Array.isArray(moves) && moves.length > 0) {
      setGameStarted(true);
    }
  }, [moves, gameStarted]);

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
      maxWidth: isNarrow ? 'min(96vmin, 1200px)' : 'min(98vw, 1500px)',
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
      justifyContent: isNarrow ? 'flex-start' : 'center',
      gap: 8,
      boxSizing: 'border-box',
      overflow: 'hidden',
    },
    boardRow: {
      width: '100%',
      display: 'flex',
      flexDirection: isNarrow ? 'column' : 'row',
      alignItems: isNarrow ? 'stretch' : 'center',
      justifyContent: 'center',
      gap: isNarrow ? 8 : 12,
      flex: isNarrow ? 1 : undefined,
      minHeight: 0,
    },
    boardHolder: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
  };

  const isOnline = useCallback(() => Boolean(isOnlineGameRef.current), []);
  // Local hotseat controls BOTH sides; online and AI games control only the
  // user's side. (isOnline alone missed AI games — you could move the bot's
  // pieces during its think time via the click path.)
  const controlsBothSides = useCallback(
    () => !isOnlineGameRef.current && !aiEnabledRef.current,
    []
  );
  const isUsersTurn = useCallback(
    () => controlsBothSides() || sideToMove === userTeam,
    [controlsBothSides, sideToMove, userTeam]
  );
  const ownsPiece = useCallback(
    (piece) => controlsBothSides() || Boolean(piece && piece.side === userTeam),
    [controlsBothSides, userTeam]
  );

  const guardExternalOver = useCallback(() => {
    if (externalGameOver.over) {
      setInfoMessage(externalGameOver.text || 'Game over.');
      return true;
    }
    return false;
  }, [externalGameOver]);

  // Pending en passant choices are per-turn.
  useEffect(() => {
    setPendingEpChoice(null);
  }, [sideToMove, gameInstanceId]);

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
    if (result.success && fromSquare) {
      dispatch(addMove({ from: fromSquare, to: toSquare, side: movingPiece.side }));
      if (isOnline() && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
        sendMoveWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, from: fromSquare, to: toSquare, side: movingPiece.side, enPassant });
      }
      setInfoMessage('');
      setGameStarted(true);
    } else if (!result.success && result.hasOwnProperty('reason')) {
      setInfoMessage(result.reason || 'Illegal move.');
    }
    setSelectedId(null);
    setPendingEpChoice(null);
  }, [pieces, movePiece, dispatch, isOnline]);

  // Route a destination square to the right kind of move. Returns false if the
  // square is neither a legal move nor an en passant capture for the piece.
  const commitMoveOrChoose = useCallback((pieceId, toSquare) => {
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
  }, [getLegalMoves, getEnPassantMoves, performMove]);

  const handleSquareClick = (data) => {
    if (guardExternalOver()) return;

    if (!canMakeMove) {
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      return;
    }

    if (!isUsersTurn()) {
      setInfoMessage("Not your turn.");
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
                setGameStarted(true);
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
      if (!commitMoveOrChoose(selectedId, square)) {
        setInfoMessage('Illegal move.');
        setSelectedId(null);
      }
    }
  };

  const handlePieceClick = ({ id }) => {
    if (guardExternalOver()) return;

    if (!canMakeMove) {
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      return;
    }

    if (!isUsersTurn()) {
      setInfoMessage("Not your turn.");
      return;
    }

    const clicked = pieces.find((x) => x.id === id);
    if (!clicked) return;

    // Note: clicking an opponent piece is legitimate — it is how captures and
    // measurement targeting work. Ownership checks are applied per-action below.

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
              setGameStarted(true);
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
      const destSquare = clicked.square;
      if (destSquare && commitMoveOrChoose(selectedId, destSquare)) {
        return;
      }
      setInfoMessage('Illegal move.');
      setSelectedId(null);
      return;
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

  // Engaging with a glowing onboarding button also retires the glow.
  const handleOpenSettings = useCallback(() => { setSettingsOpen(true); dismissOnboarding(); }, [dismissOnboarding]);
  const handleOpenRules = useCallback(() => { setRulesOpen(true); dismissOnboarding(); }, [dismissOnboarding]);
  const handleOpenAccount = useCallback(() => { setAccountOpen(true); dismissOnboarding(); }, [dismissOnboarding]);

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

      if (msg.type === 'game_over') {
        const winSide = msg.winner === 'white' || msg.winner === 'black' ? msg.winner : null;
        const reason = typeof msg.reason === 'string' && msg.reason ? msg.reason : 'time';
        let text;
        if (reason === 'time') {
          text = winSide ? `${winSide[0].toUpperCase()}${winSide.slice(1)} wins on time.` : 'Game over on time.';
        } else if (!winSide) {
          text = `Draw by ${reason}.`;
        } else {
          text = `${winSide[0].toUpperCase()}${winSide.slice(1)} wins by ${reason}.`;
        }
        setExternalGameOver({ over: true, text });
        setInfoMessage(text);
        maybeApplyClock(msg.clock);
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
        const wsEnPassant = Boolean(msg.enPassant);
        let result = movePiece(piece.id, to, { enPassant: wsEnPassant });
        if (!result || !result.success) {
          // Robustness for interpretation mismatches: try the other reading.
          result = movePiece(piece.id, to, { enPassant: !wsEnPassant });
        }
        if (result && result.success) {
          dispatch(addMove({ from, to, side: sideMsg === 'white' || sideMsg === 'black' ? sideMsg : piece.side }));
          setInfoMessage('Opponent moved.');
          setGameStarted(true);
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
          setGameStarted(true);
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

    // Bump engine reset key to clear the internal timeline and view index
    setGameInstanceId((n) => n + 1);

    isOnlineGameRef.current = false;
    aiEnabledRef.current = false;
    aiDifficultyRef.current = settings && typeof settings.aiDifficulty === 'string' ? settings.aiDifficulty : 'medium';
    setAiBot(null);

    try { if (wsApiRef.current) wsApiRef.current.close(); } catch (_) {}
    wsApiRef.current = null;

    setServerClock({ active: 'none', whiteMs: 5 * 60 * 1000, blackMs: 5 * 60 * 1000 });

    // Starting a new game via the tray explicitly marks the session as started
    setGameStarted(true);
    setExternalGameOver({ over: false, text: '' });

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
      const bot = getBotById((settings && settings.aiBotId) || DEFAULT_BOT_ID) || getBotById(DEFAULT_BOT_ID);
      setAiBot(bot);
      aiDifficultyRef.current = bot ? bot.tier : aiDifficultyRef.current;
      const pref = settings && typeof settings.preferredSide === 'string' ? settings.preferredSide : 'random';
      let side = 'white';
      if (pref === 'white' || pref === 'black') {
        side = pref;
      } else {
        side = Math.random() < 0.5 ? 'white' : 'black';
      }
      dispatch(setUserTeam(side));
      setInfoMessage(`New game vs AI started. You are ${side[0].toUpperCase()}${side.slice(1)}.`);
      return;
    }

    // Local 2 Player always seats Anonymous as White at the bottom.
    dispatch(setUserTeam('white'));
    setInfoMessage('New local game started.');
  }, [dispatch, startWsConnection]);

  const handlePieceDragStart = useCallback((piece) => {
    if (!piece) return false;
    if (guardExternalOver()) return false;
    if (!canMakeMove) return false;
    if (isOnlineGameRef.current) {
      if (piece.side !== userTeam) return false;
      if (sideToMove !== userTeam) return false;
    } else {
      if (aiEnabledRef.current) {
        const userSide = userTeam;
        if (piece.side !== userSide) return false;
        if (sideToMove !== userSide) return false;
      } else {
        if (piece.side !== sideToMove) return false;
      }
    }
    setSelectedId(piece.id);
    setTrayHighlights([]);
    return true;
  }, [sideToMove, canMakeMove, userTeam, guardExternalOver]);

  const handlePieceDrop = useCallback(({ id, from, to }) => {
    if (guardExternalOver()) { 
      setSelectedId(null); 
      return; 
    }
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
    if (!isOnlineGameRef.current && aiEnabledRef.current && sideToMove !== userTeam) {
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
    if (!isOnlineGameRef.current && aiEnabledRef.current && movingPiece.side !== userTeam) {
      const you = userTeam === 'white' ? 'White' : 'Black';
      setInfoMessage(`You are playing ${you} vs AI.`);
      setSelectedId(null);
      return;
    }

    const fromSquare = movingPiece.square || from || null;

    // If the drop ends on the original square or is null, treat as a selection tap, not a move.
    if (!to || to === fromSquare) {
      setInfoMessage('');
      setSelectedId(movingPiece.id);
      return;
    }

    const targetAtDest = getPieceAtSquare(to);
    if (targetAtDest && targetAtDest.side === movingPiece.side && targetAtDest.id !== id) {
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
          setGameStarted(true);
        } else {
          if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Castling failed.');
        }
      } else {
        setInfoMessage(reason || 'Cannot castle with these pieces.');
      }
      setSelectedId(null);
      return;
    }

    if (!commitMoveOrChoose(id, to)) {
      setInfoMessage('Illegal move.');
      setSelectedId(null);
    }
  }, [pieces, getPieceAtSquare, canCastleBetween, castlePieces, getLegalMoves, movePiece, dispatch, canMakeMove, gameOver, winner, sideToMove, userTeam, guardExternalOver, commitMoveOrChoose]);

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
    if (settings.measurement) setMeasurementColors(settings.measurement);
    if (settings.indicators) setIndicators(settings.indicators);
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

    invalidateSvgCaches('piece-colors-changed');
    await prewarmAllPieceSvgs({
      cssVarsBySide: newSvgStyles,
      sizes: [currentPieceSize, 64, 26],
      renderHint: currentPieceSize <= 56 ? 'crisp' : 'precision',
    });
    await prewarmCapturedPieceSvgs({ cssVarsBySide: newSvgStyles, sizes: [26], renderHint: 'crisp' });
  }, [whiteColors, blackColors, setWhiteColors, setBlackColors, setBoardColors, setPlayerBarColors, setMeasurementColors, setShowCoordinates, setShowCheckOverlay, currentPieceSize]);

  const winnerText = useMemo(() => {
    if (!gameOver) return '';
    if (!winner) return `Draw by ${gameOverReason || 'agreement'}.`;
    const w = winner[0].toUpperCase() + winner.slice(1);
    return `${w} wins by ${gameOverReason || 'checkmate'}!`;
  }, [gameOver, winner, gameOverReason]);

  const localClock = useChessClock({
    timeControl,
    sideToMove,
    isLive: false, // offline games are untimed
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
        whiteActive: gameStarted && !externalGameOver.over && active === 'white' && w > 0 && b > 0,
        blackActive: gameStarted && !externalGameOver.over && active === 'black' && w > 0 && b > 0,
        whiteLow,
        blackLow,
      };
    }
    return localClock;
  }, [serverClock, localClock, gameStarted, externalGameOver]);

  const aiSide = useMemo(() => (userTeam === 'white' ? 'black' : 'white'), [userTeam]);

  const applyEngineMove = useCallback((mv, side) => {
    if (!mv) return;
    if (isOnlineGameRef.current) return;
    if (!aiEnabledRef.current) return;
    if (sideToMove !== side) return;

    if (mv.type === 'move' || mv.type === 'enpassant') {
      const piece = getPieceAtSquare(mv.from);
      if (!piece) return;
      const res = movePiece(piece.id, mv.to, { enPassant: mv.type === 'enpassant' });
      if (res && res.success) {
        dispatch(addMove({ from: mv.from, to: mv.to, side }));
        setInfoMessage('AI moved.');
        setGameStarted(true);
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
        setGameStarted(true);
      }
      return;
    }
  }, [dispatch, sideToMove, getPieceAtSquare, movePiece, canCastleBetween, castlePieces]);

  useLocalAi({
    enabled: !isOnlineGameRef.current && aiEnabledRef.current,
    aiSide,
    difficulty: aiDifficultyRef.current,
    botId: aiBot ? aiBot.id : null,
    pieces,
    sideToMove,
    canMakeMove,
    gameOver,
    lastMove,
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

  const isPlaying = useMemo(() => gameStarted && !gameOver && !externalGameOver.over, [gameStarted, gameOver, externalGameOver]);

  const [confirmState, setConfirmState] = useState(null); // { title, message, confirmLabel, danger, run }

  const handleResign = useCallback(() => {
    // In local hotseat the side to move resigns; otherwise the human's side.
    const isHotseat = !isOnlineGameRef.current && !aiEnabledRef.current;
    const resigning = isHotseat ? sideToMove : userTeam;
    const side = resigning === 'white' ? 'White' : 'Black';
    const opp = side === 'White' ? 'Black' : 'White';
    setConfirmState({
      title: `Resign as ${side}?`,
      message: `${opp} will win the game.`,
      confirmLabel: 'Resign',
      danger: true,
      run: () => {
        setExternalGameOver({ over: true, text: `${side} resigns. ${opp} wins.` });
        setInfoMessage(`${side} resigned.`);
      },
    });
  }, [userTeam, sideToMove]);

  const handleOfferDraw = useCallback(() => {
    setConfirmState({
      title: 'Agree to a draw?',
      message: 'The game ends immediately as a draw by agreement.',
      confirmLabel: 'Draw',
      danger: false,
      run: () => {
        setExternalGameOver({ over: true, text: 'Draw by agreement.' });
        setInfoMessage('Draw agreed.');
      },
    });
  }, []);

  const [newGameSignal, setNewGameSignal] = useState(0);
  const handleRequestNewGame = useCallback(() => {
    setConfirmState({
      title: 'End this game?',
      message: 'The current game will be abandoned and you can set up a new one.',
      confirmLabel: 'End & New Game',
      danger: true,
      run: () => {
        setExternalGameOver({ over: true, text: 'Game abandoned.', silent: true });
        setInfoMessage('Game ended. Set up your next game.');
        setNewGameSignal((s) => s + 1);
      },
    });
  }, []);

  const resolvedWinnerText = useMemo(() => (externalGameOver.over ? externalGameOver.text : winnerText), [externalGameOver, winnerText]);

  const showClockUI = isOnlineGameRef.current; // only show timers for online games

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      <AppHeader svgStyles={svgStyles} />

      <div className="qc-board-area" style={styles.boardArea}>
        <div className="qc-board-stack" style={styles.boardStack}>
          <div className="qc-board-stage" style={styles.boardStage} ref={boardStageRef}>
            <div className="qc-bar-wrap" style={barWrapStyle}>
              <PlayerBar
                {...barPropsFor(topBarSide)}
                playerBarColors={playerBarColors}
                svgStyles={svgStyles}
                barRef={topBarRef}
                showClock={showClockUI}
              />
            </div>

            {(() => {
              const trayEl = (
                <SideTray
                  height={isNarrow ? 0 : trayHeight}
                  stacked={isNarrow}
                  infoMessage={infoMessage}
                  onOpenSettings={handleOpenSettings}
                  onOpenRules={handleOpenRules}
                  onStartGame={handleStartGame}
                  onSetHighlights={handleSetHighlights}
                  onClearHighlights={handleClearHighlights}
                  onSeekToIndex={handleSeekToIndex}
                  externalIndex={currentMoveIndex}
                  isPlaying={isPlaying}
                  onResign={handleResign}
                  onOfferDraw={handleOfferDraw}
                  onRequestNewGame={handleRequestNewGame}
                  newGameSignal={newGameSignal}
                  onOpenAccount={handleOpenAccount}
                  accountSignedIn={Boolean(auth.user)}
                  onboarding={onboarding}
                  onDismissOnboarding={dismissOnboarding}
                />
              );
              const whiteBarEl = (
                <div className="qc-bar-wrap" style={barWrapStyle}>
                  <PlayerBar
                    {...barPropsFor(bottomBarSide)}
                    playerBarColors={playerBarColors}
                    svgStyles={svgStyles}
                    barRef={bottomBarRef}
                    showClock={showClockUI}
                  />
                </div>
              );

              return (
                <>
                  <div className="qc-board-row" style={styles.boardRow}>
                    <div className="qc-board-holder" style={styles.boardHolder}>
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
                        measureTargetMarks={measuredMarks}
                        indicators={indicators}
                        measurementColors={measurementColors}
                        legalMoves={selectedMoves}
                        maxVisualSize={boardSize > 0 ? `${boardSize}px` : 'min(85vmin, 720px)'}
                        borderColor="transparent"
                        shadow="rgba(0, 0, 0, 0.15)"
                        pieceSvgStyles={svgStyles}
                        onResize={handleBoardResize}
                        squareColors={boardColors}
                      />
                    </div>
                    {!isNarrow ? trayEl : null}
                  </div>

                  {whiteBarEl}
                  {isNarrow ? trayEl : null}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <footer
        className="qc-site-footer"
        style={{
          textAlign: 'center',
          padding: '10px 0 16px',
          fontSize: 12,
          color: theme.textSecondary,
          opacity: 0.7,
        }}
      >
        <a href="/about.html" style={{ color: theme.textSecondary, textDecoration: 'none', margin: '0 8px' }}>About</a>
        <span style={{ opacity: 0.4 }}>·</span>
        <a href="/privacy.html" style={{ color: theme.textSecondary, textDecoration: 'none', margin: '0 8px' }}>Privacy</a>
      </footer>

      <ConsentBanner />

      <WinnerModal
        open={showWinPopup}
        winnerText={resolvedWinnerText}
        title={externalGameOver.over ? 'Game Over' : (winner ? 'Checkmate' : 'Draw')}
        onClose={() => setShowWinPopup(false)}
      />

      <EnPassantChoiceModal
        open={Boolean(pendingEpChoice)}
        onEnPassant={() => {
          if (pendingEpChoice) performMove(pendingEpChoice.pieceId, pendingEpChoice.to, { enPassant: true });
        }}
        onQuiet={() => {
          if (pendingEpChoice) performMove(pendingEpChoice.pieceId, pendingEpChoice.to, { enPassant: false });
        }}
        onCancel={() => {
          setPendingEpChoice(null);
          setSelectedId(null);
        }}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        whiteColors={whiteColors}
        blackColors={blackColors}
        boardColors={boardColors}
        playerBarColors={playerBarColors}
        measurementColors={measurementColors}
        indicators={indicators}
        showCoordinates={showCoordinates}
        showCheckOverlay={showCheckOverlay}
        defaultWhiteColors={DEFAULT_WHITE}
        defaultBlackColors={DEFAULT_BLACK}
        defaultBoardColors={DEFAULT_BOARD}
        defaultPlayerBarColors={DEFAULT_PLAYER_BAR_COLORS}
        defaultMeasurementColors={DEFAULT_MEASUREMENT_COLORS}
        onAccept={handleAcceptSettings}
      />

      <RulesModal
        open={rulesOpen}
        onClose={() => { setRulesOpen(false); setRulesInitialPage(null); }}
        initialPageTitle={rulesInitialPage}
        onPlayLesson={(lessonId) => {
          setRulesOpen(false);
          setRulesInitialPage(null);
          setTutorialLessonId(lessonId);
          setTutorialOpen(true);
        }}
      />

      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} auth={auth} />

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState ? confirmState.title : ''}
        message={confirmState ? confirmState.message : ''}
        confirmLabel={confirmState ? confirmState.confirmLabel : 'Confirm'}
        danger={Boolean(confirmState && confirmState.danger)}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const run = confirmState && confirmState.run;
          setConfirmState(null);
          if (run) run();
        }}
      />

      <TutorialModal
        open={tutorialOpen}
        onClose={closeTutorial}
        pieceSvgStyles={svgStyles}
        initialLessonId={tutorialLessonId}
        onOpenRules={(pageTitle) => {
          closeTutorial();
          setRulesInitialPage(pageTitle);
          setRulesOpen(true);
        }}
      />
    </div>
  );
}
