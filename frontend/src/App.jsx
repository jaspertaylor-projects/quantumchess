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
import { consumeCheckoutReturn, isAdFree } from './account/billing.js';
import { resolveSaying, loadLocalSayings, saveLocalSayings } from './sayings/sayingsCatalog.js';
import ReviewModal from './review/ReviewModal.jsx';
import AccountModal from './account/AccountModal.jsx';
import { recordFinishedGame, fetchGameMoves } from './account/gameSync.js';
import { useDispatch, useSelector } from 'react-redux';
import { addMove, resetGame, setUserTeam } from './store/gameSlice.js';
import { setGameSettings } from './store/settingsSlice.js';
import { prewarmAllPieceSvgs, invalidateSvgCaches, prewarmCapturedPieceSvgs } from './chessboard/svgPrewarm.js';
import { getOrCreateClientId, joinQueue, waitForMatch, leaveQueue, getStatus, connectToRoomWs, sendMoveWs, sendCastleWs, sendGameOverWs, createPrivateRoom, joinPrivateRoom, buildInviteLink, readJoinCode, stripJoinCode } from './tray/matchmakingClient.js';
import AppHeader from './components/AppHeader.jsx';
import MobileBar from './components/MobileBar.jsx';
import DailyPuzzleModal from './puzzle/DailyPuzzleModal.jsx';
import { getDayResult, todayStr } from './puzzle/puzzleProgress.js';
import NewGamePanel from './tray/NewGamePanel.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import WinnerModal from './components/WinnerModal.jsx';
import EnPassantChoiceModal from './components/EnPassantChoiceModal.jsx';
import useChessClock from './hooks/useChessClock.js';
import { formatClock, clampMs } from './hooks/clockUtils.js';
import useLocalAi from './ai/useLocalAi.js';
import { getBotById, DEFAULT_BOT_ID, botInitials } from './ai/bots.js';

// The active online game is remembered per-browser so a reload or dropped
// connection can rejoin it (the server replays the move history on welcome).
const ACTIVE_GAME_KEY = 'qcActiveOnlineGame';
function saveActiveOnlineGame(roomId, side) {
  try { localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ roomId, side })); } catch (_) {}
}
function readActiveOnlineGame() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_GAME_KEY) || 'null'); } catch (_) { return null; }
}
function clearActiveOnlineGame() {
  try { localStorage.removeItem(ACTIVE_GAME_KEY); } catch (_) {}
}

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
    // rejoin support
    replayMoves,
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
    tagline: 'Unobserved, unrated, undeterred.',
    hoverNote: { text: 'Not affiliated with chess.com. Yet.', linkText: 'say hi', href: 'mailto:contact@quantumchess.ninja' },
  };
  const strangerAvatar = { initials: 'S', hue: 320, imageUrl: '/bots/stranger.png', name: 'Stranger', tagline: 'Wandered in from a parallel branch.' };
  const isOnlineBars = isOnlineGameRef.current;
  // Signed-in players appear under their unique account username and rating.
  const selfName = (auth.profile && auth.profile.username) || 'Anonymous';
  const selfRating = auth.profile && Number.isFinite(auth.profile.rating) ? auth.profile.rating : '????';
  // Premium accounts get their uploaded avatar and tagline on their own bar;
  // other signed-in players get username initials over the anonymous art.
  // Signed-out players wear the Anonymous character's tagline.
  const selfTagline = (auth.profile && auth.profile.tagline) || (auth.profile ? '' : anonymousAvatar.tagline);
  const selfAvatar = auth.profile
    ? {
        initials: (selfName[0] || 'A').toUpperCase(),
        hue: 145,
        imageUrl: auth.profile.avatar_url || '/bots/anonymous.png',
        name: selfName,
        tagline: selfTagline,
      }
    : anonymousAvatar;
  const nameFor = (side) => {
    if (botSide === side) return aiBot.name;
    if (isOnlineBars) return side === 'white' ? 'White' : 'Black';
    return side === userTeam ? selfName : 'Stranger';
  };
  const avatarFor = (side) => {
    if (botSide === side) return botAvatar;
    if (isOnlineBars) return null;
    return side === userTeam ? selfAvatar : strangerAvatar;
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
    tagline: botSide === 'white' ? (aiBot.tagline || null)
      : (isOnlineBars ? null : (userTeam === 'white' ? (selfTagline || null) : strangerAvatar.tagline)),
    speech: speech.white,
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
    tagline: botSide === 'black' ? (aiBot.tagline || null)
      : (isOnlineBars ? null : (userTeam === 'black' ? (selfTagline || null) : strangerAvatar.tagline)),
    speech: speech.black,
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
    if (isOnlineGameRef.current) {
      clearActiveOnlineGame();
      if (mmClientIdRef.current) leaveQueue(mmClientIdRef.current).catch(() => {});
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
  // and is a complete no-op until a publisher id is configured. Premium
  // accounts and tipped ad-free windows skip ads entirely.
  useEffect(() => {
    if (showWinPopup && !isAdFree(auth.profile)) maybeShowGameEndAd();
  }, [showWinPopup, auth.profile]);

  // Accounts (optional): save finished games for signed-in players and
  // apply Elo against rated bots. Saved exactly once per game end.
  const [accountOpen, setAccountOpen] = useState(false);

  // Stripe Checkout returns to /?premium=success|cancelled. The webhook flips
  // the tier server-side, so after a success poll the profile briefly until
  // the upgrade shows up (or 30s passes).
  const [billingReturn, setBillingReturn] = useState(null);
  useEffect(() => {
    const status = consumeCheckoutReturn();
    if (status) {
      setBillingReturn(status);
      setAccountOpen(true);
    }
  }, []);
  useEffect(() => {
    if (billingReturn !== 'success' && billingReturn !== 'tip_thanks') return undefined;
    // Stop polling once the webhook's write has landed: tier for the
    // subscription, ad_free_until for a tip.
    const landed = billingReturn === 'success'
      ? Boolean(auth.profile && auth.profile.tier === 'paid')
      : isAdFree(auth.profile);
    if (landed) return undefined;
    const timer = setInterval(() => { auth.refreshProfile(); }, 2500);
    const stop = setTimeout(() => clearInterval(timer), 30000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [billingReturn, auth.profile, auth.refreshProfile]);

  const isPaidUser = Boolean(auth.profile && auth.profile.tier === 'paid');

  // Premium bots: picking one while free routes to the account panel, where
  // the upgrade card lives.
  const handleRequirePremium = useCallback(() => {
    setMobileNewGameOpen(false);
    setAccountOpen(true);
  }, []);

  // Premium game review: fetch the saved move list on demand, then open the
  // review modal on top of the account panel. Returns whether it actually
  // opened, so quota-limited access (the tipper's one-per-day review) is only
  // charged on success.
  const [reviewGame, setReviewGame] = useState(null); // { game, moves }
  const handleReviewGame = useCallback(async (game) => {
    if (!auth.user || !game) return false;
    const savedMoves = await fetchGameMoves(auth.user, game.id);
    setReviewGame({ game, moves: savedMoves || [] });
    return true;
  }, [auth.user]);
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
      // Narrow layout reserves room for the fixed bottom action bar.
      paddingBottom: isNarrow ? 'calc(env(safe-area-inset-bottom) + 66px)' : 'calc(env(safe-area-inset-bottom) + 12px)',
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
      position: 'relative', // anchors the pre-game start CTA overlay
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
      dispatch(addMove({ from: fromSquare, to: toSquare, side: movingPiece.side, enPassant }));
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

  // Pre-game the board is a preview, not a sandbox: interacting nudges the
  // player to game setup instead of silently starting a hotseat session
  // (which disoriented new players and, on mobile, swapped the home action
  // bar — with the Puzzle/Tutorial buttons — for in-game controls).
  // Mobile opens the setup sheet; desktop pulses the on-board CTA (the
  // setup panel is already visible in the tray).
  const [startCtaPulse, setStartCtaPulse] = useState(0);
  const promptStartGame = useCallback(() => {
    if (isNarrow) setMobileNewGameOpen(true);
    else setStartCtaPulse((n) => n + 1);
    dismissOnboarding();
  }, [isNarrow, dismissOnboarding]);

  const handleSquareClick = (data) => {
    if (!gameStarted) { promptStartGame(); return; }
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
                dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: piece.side, castle: true }));
                dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: piece.side, castle: true }));
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
    if (!gameStarted) { promptStartGame(); return; }
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
              dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: clicked.side, castle: true }));
              dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: clicked.side, castle: true }));
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

  // --- Sayings: transient speech bubbles on the player bars ---------------
  // Bots speak their authored lines; the signed-in player speaks their
  // profile picks (free: presets, premium: custom); the local Stranger and
  // anonymous players use the defaults. Online opponents stay silent (the
  // relay carries no profile data).
  const [speech, setSpeech] = useState({ white: null, black: null });
  const speechTimersRef = useRef({ white: null, black: null });
  const captureSayAtRef = useRef({ white: 0, black: 0 });
  const collapseSaidRef = useRef({ white: false, black: false });
  const prevCapturedRef = useRef({ white: 0, black: 0 });

  // Signed-out players' picks live in localStorage (free presets only).
  const [localSayings, setLocalSayings] = useState(loadLocalSayings);
  const handleSaveLocalSayings = useCallback((picks) => {
    setLocalSayings(saveLocalSayings(picks));
  }, []);

  const sayingTextFor = (side, event) => {
    if (botSide === side) return (aiBot && aiBot.sayings && aiBot.sayings[event]) || null;
    if (isOnlineBars && side !== userTeam) return null;
    if (side === userTeam) {
      return resolveSaying(auth.profile ? auth.profile.sayings : localSayings, event);
    }
    return resolveSaying(null, event);
  };

  const sayNow = (side, event) => {
    const text = sayingTextFor(side, event);
    if (!text) return;
    setSpeech((prev) => ({ ...prev, [side]: text }));
    if (speechTimersRef.current[side]) clearTimeout(speechTimersRef.current[side]);
    speechTimersRef.current[side] = setTimeout(() => {
      setSpeech((prev) => ({ ...prev, [side]: null }));
    }, 4200);
  };

  // New game: clear bubbles and one-shot flags.
  useEffect(() => {
    setSpeech({ white: null, black: null });
    collapseSaidRef.current = { white: false, black: false };
    prevCapturedRef.current = { white: 0, black: 0 };
    captureSayAtRef.current = { white: 0, black: 0 };
  }, [gameInstanceId]);

  // Captures: exactly-one-piece increases only, so replays/rejoins and
  // browsing history never trigger lines; rate-limited per side.
  useEffect(() => {
    const counts = {
      white: whiteCapturedPawns.length + whiteCapturedOthers.length,
      black: blackCapturedPawns.length + blackCapturedOthers.length,
    };
    const prev = prevCapturedRef.current;
    for (const victim of ['white', 'black']) {
      if (counts[victim] === prev[victim] + 1 && !gameOver) {
        const capturer = victim === 'white' ? 'black' : 'white';
        const now = Date.now();
        if (now - captureSayAtRef.current[capturer] > 12000) {
          captureSayAtRef.current[capturer] = now;
          sayNow(capturer, 'capture');
        }
      }
    }
    prevCapturedRef.current = counts;
  }, [whiteCapturedPawns, whiteCapturedOthers, blackCapturedPawns, blackCapturedOthers, gameOver]);

  // Full-army collapse: every surviving piece of a side reduced to a single
  // known type — the opponent gets to gloat, once per game per side.
  useEffect(() => {
    if (gameOver) return;
    for (const side of ['white', 'black']) {
      if (collapseSaidRef.current[side]) continue;
      const alive = pieces.filter((p) => !p.captured && p.side === side);
      if (alive.length > 0 && alive.every((p) => (p.possibleTypes || []).length === 1)) {
        collapseSaidRef.current[side] = true;
        sayNow(side === 'white' ? 'black' : 'white', 'collapse');
      }
    }
  }, [pieces, gameOver]);

  // Game end: winner/loser lines, or a draw line from both.
  useEffect(() => {
    if (!gameOver) return;
    if (winner === 'white' || winner === 'black') {
      sayNow(winner, 'win');
      sayNow(winner === 'white' ? 'black' : 'white', 'loss');
    } else {
      sayNow('white', 'draw');
      sayNow('black', 'draw');
    }
  }, [gameOver, winner]);

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
  const handleOpenTutorial = useCallback(() => { setTutorialOpen(true); dismissOnboarding(); }, [dismissOnboarding]);

  // Daily puzzle: the buttons wear a dot until today's is played. The bump
  // counter re-reads localStorage after the modal closes.
  const [dailyPuzzleOpen, setDailyPuzzleOpen] = useState(false);
  const [puzzleStateBump, setPuzzleStateBump] = useState(0);
  const puzzleUnsolved = useMemo(() => {
    void puzzleStateBump;
    try { return !getDayResult(todayStr()); } catch (_) { return false; }
  }, [puzzleStateBump]);
  const handleOpenPuzzle = useCallback(() => { setDailyPuzzleOpen(true); dismissOnboarding(); }, [dismissOnboarding]);
  const handleClosePuzzle = useCallback(() => { setDailyPuzzleOpen(false); setPuzzleStateBump((n) => n + 1); }, []);

  // Dev tool: ?puzzleDate=YYYY-MM-DD previews any date's puzzle in practice
  // mode (nothing recorded). Dev builds only.
  const [puzzlePreviewDate, setPuzzlePreviewDate] = useState(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const d = new URLSearchParams(window.location.search).get('puzzleDate');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setPuzzlePreviewDate(d);
      setDailyPuzzleOpen(true);
    }
  }, []);

  // Narrow layout: the New Game setup panel lives in a bottom sheet.
  const [mobileNewGameOpen, setMobileNewGameOpen] = useState(false);

  // Challenge a friend: while waiting in a private room, show the invite
  // card. Cleared by the room_state broadcast when the friend connects.
  const [friendWait, setFriendWait] = useState(null); // { code, link }
  const friendWaitRef = useRef(null);
  useEffect(() => { friendWaitRef.current = friendWait; }, [friendWait]);
  const [inviteCopied, setInviteCopied] = useState(false);
  useEffect(() => { setInviteCopied(false); }, [friendWait]);
  const handleCopyInvite = useCallback(async () => {
    if (!friendWaitRef.current) return;
    try {
      await navigator.clipboard.writeText(friendWaitRef.current.link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    } catch (_) { /* input stays selectable for manual copy */ }
  }, []);

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
        // Rejoin: the server replays the room's move history; rebuild the
        // engine timeline from it when this client has no moves yet.
        if (Array.isArray(msg.history) && msg.history.length > 0 && moves.length === 0) {
          const applied = replayMoves(msg.history);
          for (const mv of applied) dispatch(addMove(mv));
          if (applied.length > 0) {
            setGameStarted(true);
            setInfoMessage('Rejoined your game in progress.');
          }
        }
        return;
      }
      if (msg.type === 'room_state') {
        console.debug('[WS][client] room_state', { connected: msg.connected, turn: msg.turn, seq: msg.seq });
        maybeApplyClock(msg.clock);
        // The invited friend just connected: the challenge is on.
        if (friendWaitRef.current && Array.isArray(msg.connected) && msg.connected.length >= 2) {
          setFriendWait(null);
          setInfoMessage('Your friend joined — game on! You are White.');
        }
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
        } else if (reason === 'first-move timeout') {
          // Void, not a draw: nobody ever moved, so the game never counted.
          text = 'Game voided — no first move was made.';
        } else if (!winSide && reason === 'abandonment') {
          text = 'Game voided — a player left before the game began.';
        } else if (!winSide) {
          text = `Draw by ${reason}.`;
        } else {
          text = `${winSide[0].toUpperCase()}${winSide.slice(1)} wins by ${reason}.`;
        }
        clearActiveOnlineGame();
        // Detach from the finished room server-side, or the next Online
        // search would re-match straight into the dead room.
        if (mmClientIdRef.current) leaveQueue(mmClientIdRef.current).catch(() => {});
        // Voided games (no winner, never really played) skip the winner
        // popup — and with it the game-record path — on purpose.
        const voided = !winSide && (reason === 'first-move timeout' || reason === 'abandonment');
        setExternalGameOver({ over: true, text, silent: voided });
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
        let usedEnPassant = wsEnPassant;
        let result = movePiece(piece.id, to, { enPassant: wsEnPassant });
        if (!result || !result.success) {
          // Robustness for interpretation mismatches: try the other reading.
          usedEnPassant = !wsEnPassant;
          result = movePiece(piece.id, to, { enPassant: usedEnPassant });
        }
        if (result && result.success) {
          dispatch(addMove({ from, to, side: sideMsg === 'white' || sideMsg === 'black' ? sideMsg : piece.side, enPassant: usedEnPassant }));
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
          dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: sideMsg, castle: true }));
          dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: sideMsg, castle: true }));
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
  }, [getPieceAtSquare, movePiece, canCastleBetween, castlePieces, dispatch, moves.length, replayMoves]);

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

  // Challenge link: /?join=CODE seats this browser into a friend's private
  // room as black. The read is pure (StrictMode double-invokes initializers);
  // the URL param is stripped in the effect.
  const [pendingJoinCode] = useState(readJoinCode);
  const joinAttemptedRef = useRef(false);
  useEffect(() => {
    if (!pendingJoinCode || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true; // once per page load (StrictMode re-runs effects)
    stripJoinCode();
    const clientId = getOrCreateClientId();
    (async () => {
      try {
        const res = await joinPrivateRoom({ clientId, code: pendingJoinCode });
        if (res.status === 'matched' && res.roomId) {
          const side = res.side === 'black' || res.side === 'white' ? res.side : 'black';
          dispatch(setGameSettings({ gameMode: 'online' }));
          dispatch(resetGame());
          setGameInstanceId((n) => n + 1);
          mmClientIdRef.current = clientId;
          mmRoomIdRef.current = res.roomId;
          isOnlineGameRef.current = true;
          dispatch(setUserTeam(side));
          saveActiveOnlineGame(res.roomId, side);
          setGameStarted(true);
          setExternalGameOver({ over: false, text: '' });
          setInfoMessage(`Challenge accepted — you are ${side[0].toUpperCase()}${side.slice(1)}!`);
          startWsConnection({ roomId: res.roomId, clientId, side });
        } else if (res.status === 'room_full') {
          setInfoMessage('That challenge room is already full.');
        } else {
          setInfoMessage('That challenge link has expired — ask your friend for a new one.');
        }
      } catch (_) {
        setInfoMessage('Could not reach the game server to join the challenge.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJoinCode, startWsConnection]);

  // Rejoin: if this browser has an active online game (reload, dropped
  // connection), reattach to the room. The server keeps the seat warm for a
  // minute after a disconnect before ruling the game abandoned. The effect
  // is idempotent rather than run-once so StrictMode's dev double-mount
  // (which cancels the first run) still rejoins on the second.
  useEffect(() => {
    if (pendingJoinCode) return; // the challenge-link flow owns this session
    const saved = readActiveOnlineGame();
    if (!saved || !saved.roomId) return;
    let cancelled = false;
    (async () => {
      const clientId = getOrCreateClientId();
      try {
        const s = await getStatus(clientId);
        if (cancelled || isOnlineGameRef.current) return;
        if (s && s.status === 'matched' && s.roomId === saved.roomId) {
          const side = s.side === 'black' ? 'black' : 'white';
          mmClientIdRef.current = clientId;
          mmRoomIdRef.current = s.roomId;
          isOnlineGameRef.current = true;
          dispatch(setUserTeam(side));
          setGameStarted(true);
          setInfoMessage('Reconnecting to your game...');
          startWsConnection({ roomId: s.roomId, clientId, side });
        } else {
          clearActiveOnlineGame();
        }
      } catch (_) {
        // Backend unreachable; leave the record for a later attempt.
      }
    })();
    return () => { cancelled = true; };
  }, [dispatch, startWsConnection]);

  // Tear down a private challenge room while still waiting for the friend.
  const handleCancelFriendWait = useCallback(() => {
    setFriendWait(null);
    setGameStarted(false);
    isOnlineGameRef.current = false;
    clearActiveOnlineGame();
    try { if (wsApiRef.current) wsApiRef.current.close(); } catch (_) {}
    wsApiRef.current = null;
    mmRoomIdRef.current = null;
    if (mmClientIdRef.current) leaveQueue(mmClientIdRef.current).catch(() => {});
    setInfoMessage('Challenge cancelled.');
  }, []);

  // Abort an online matchmaking search from the queue.
  const handleCancelSearch = useCallback(() => {
    mmAbortRef.current = true;
    setMmActive(false);
    setGameStarted(false);
    const id = mmClientIdRef.current;
    if (id) leaveQueue(id).catch(() => {});
    setInfoMessage('Search cancelled.');
  }, []);

  const handleStartGame = useCallback((settings) => {
    mmAbortRef.current = true;
    clearActiveOnlineGame();

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

    if (settings && settings.gameMode === 'online' && settings.privateFriend) {
      const clientId = getOrCreateClientId();
      mmClientIdRef.current = clientId;
      mmAbortRef.current = false;

      (async () => {
        try {
          try { await leaveQueue(clientId); } catch (_) {}
          const created = await createPrivateRoom({ clientId });
          if (created.status !== 'waiting' || !created.roomId || !created.code) {
            setGameStarted(false);
            setInfoMessage('Could not open a private room. Please try again.');
            return;
          }
          const link = buildInviteLink(created.code);
          mmRoomIdRef.current = created.roomId;
          isOnlineGameRef.current = true;
          dispatch(setUserTeam('white'));
          saveActiveOnlineGame(created.roomId, 'white');
          setFriendWait({ code: created.code, link });
          setInfoMessage('Waiting for your friend to join…');
          try { await navigator.clipboard.writeText(link); } catch (_) { /* copy button remains */ }
          startWsConnection({ roomId: created.roomId, clientId, side: 'white' });
        } catch (e) {
          setGameStarted(false);
          setInfoMessage('Failed to contact matchmaking service.');
        }
      })();
      return;
    }

    if (settings && settings.gameMode === 'online') {
      const clientId = getOrCreateClientId();
      mmClientIdRef.current = clientId;
      mmAbortRef.current = false;

      (async () => {
        try {
          // Detach from any previous room first: a finished game would
          // otherwise "re-match" us straight back into its dead room.
          try { await leaveQueue(clientId); } catch (_) {}
          const join = await joinQueue({ clientId });
          if (join.status === 'matched') {
            const side = (join.side === 'white' || join.side === 'black') ? join.side : 'white';
            const roomId = join.roomId;
            mmRoomIdRef.current = roomId;
            isOnlineGameRef.current = true;
            dispatch(setUserTeam(side));
            saveActiveOnlineGame(roomId, side);
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
              saveActiveOnlineGame(roomId, side);
              setInfoMessage(`Matched! You are ${side.toUpperCase()}. Room ${String(found.roomId || '').slice(0, 6)}`);
              setMmActive(false);
              startWsConnection({ roomId, clientId, side });
            } else if (!mmAbortRef.current) {
              // Timed out without a match: leave the queue cleanly.
              setMmActive(false);
              setGameStarted(false);
              leaveQueue(clientId).catch(() => {});
              setInfoMessage('No opponent found. Try again in a bit.');
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
    if (!gameStarted) { promptStartGame(); return false; }
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
  }, [sideToMove, canMakeMove, userTeam, guardExternalOver, gameStarted, promptStartGame]);

  const handlePieceDrop = useCallback(({ id, from, to }) => {
    if (!gameStarted) { promptStartGame(); setSelectedId(null); return; }
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
          dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: movingPiece.side, castle: true }));
          dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: movingPiece.side, castle: true }));
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
  }, [pieces, getPieceAtSquare, canCastleBetween, castlePieces, getLegalMoves, movePiece, dispatch, canMakeMove, gameOver, winner, sideToMove, userTeam, guardExternalOver, commitMoveOrChoose, gameStarted, promptStartGame]);

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
        dispatch(addMove({ from: mv.from, to: mv.to, side, enPassant: mv.type === 'enpassant' }));
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
        dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side, castle: true }));
        dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side, castle: true }));
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
        // Online, tell the server so the opponent hears about it too.
        if (isOnlineGameRef.current && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
          sendGameOverWs(wsApiRef.current, {
            roomId: mmRoomIdRef.current,
            clientId: mmClientIdRef.current,
            winner: resigning === 'white' ? 'black' : 'white',
            reason: 'resignation',
          });
          clearActiveOnlineGame();
          leaveQueue(mmClientIdRef.current).catch(() => {});
        }
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
        if (isOnlineGameRef.current && wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current) {
          sendGameOverWs(wsApiRef.current, {
            roomId: mmRoomIdRef.current,
            clientId: mmClientIdRef.current,
            winner: null,
            reason: 'agreement',
          });
          clearActiveOnlineGame();
          leaveQueue(mmClientIdRef.current).catch(() => {});
        }
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
        setMobileNewGameOpen(true); // no-op on desktop; opens the sheet on phones
      },
    });
  }, []);

  const resolvedWinnerText = useMemo(() => (externalGameOver.over ? externalGameOver.text : winnerText), [externalGameOver, winnerText]);

  const showClockUI = isOnlineGameRef.current; // only show timers for online games

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      {/* Phones skip the banner — every vertical pixel goes to the board. */}
      {!isNarrow ? <AppHeader svgStyles={svgStyles} /> : null}

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
                  isOnlineGame={isOnlineGameRef.current}
                  searching={mmActive}
                  onCancelSearch={handleCancelSearch}
                  newGameSignal={newGameSignal}
                  onOpenAccount={handleOpenAccount}
                  accountSignedIn={Boolean(auth.user)}
                  onboarding={onboarding}
                  onDismissOnboarding={dismissOnboarding}
                  isPaid={isPaidUser}
                  onRequirePremium={handleRequirePremium}
                  attentionSignal={startCtaPulse}
                  onOpenPuzzle={handleOpenPuzzle}
                  puzzleUnsolved={puzzleUnsolved}
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
                      {!gameStarted ? (
                        <button
                          type="button"
                          className="qc-board-start-cta"
                          key={`start-cta-${startCtaPulse}`}
                          onClick={promptStartGame}
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 20,
                            padding: '12px 26px',
                            borderRadius: 999,
                            border: `1px solid ${theme.border}`,
                            background: 'rgba(12, 14, 22, 0.88)',
                            color: theme.textPrimary,
                            fontWeight: 900,
                            fontSize: 'clamp(14px, 2.4vw, 17px)',
                            letterSpacing: '0.05em',
                            cursor: 'pointer',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(2px)',
                            animation: startCtaPulse > 0 ? 'qc-cta-pulse 500ms ease-out' : 'none',
                          }}
                        >
                          ▶ Start a Game
                        </button>
                      ) : null}
                    </div>
                    {!isNarrow ? trayEl : null}
                  </div>

                  {whiteBarEl}
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
        <span style={{ opacity: 0.4 }}>·</span>
        <a href="/terms.html" style={{ color: theme.textSecondary, textDecoration: 'none', margin: '0 8px' }}>Terms</a>
      </footer>

      <ConsentBanner />

      {isNarrow ? (
        <>
          <MobileBar
            isPlaying={isPlaying}
            searching={mmActive}
            isOnlineGame={isOnlineGameRef.current}
            infoMessage={infoMessage}
            moveCount={moves.length}
            currentMoveIndex={currentMoveIndex}
            onSeek={handleSeekToIndex}
            onNewGame={isPlaying
              ? handleRequestNewGame
              : () => { setMobileNewGameOpen(true); dismissOnboarding(); }}
            onOpenAccount={handleOpenAccount}
            accountSignedIn={Boolean(auth.user)}
            onOpenTutorial={handleOpenTutorial}
            onOpenSettings={handleOpenSettings}
            onResign={handleResign}
            onOfferDraw={handleOfferDraw}
            onCancelSearch={handleCancelSearch}
            onOpenPuzzle={handleOpenPuzzle}
            puzzleUnsolved={puzzleUnsolved}
          />
          {mobileNewGameOpen ? (
            <div
              className="qc-mobile-newgame-backdrop"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 95,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'flex-end',
              }}
              onClick={() => setMobileNewGameOpen(false)}
            >
              <div
                className="qc-mobile-newgame-sheet"
                style={{
                  width: '100%',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  background: theme.cardBackground,
                  borderTop: `1px solid ${theme.border}`,
                  borderRadius: '14px 14px 0 0',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                  boxSizing: 'border-box',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <NewGamePanel
                  onStartGame={(settings) => {
                    setMobileNewGameOpen(false);
                    handleStartGame(settings);
                  }}
                  isPaid={isPaidUser}
                  onRequirePremium={handleRequirePremium}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

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
        auth={auth}
        localSayings={localSayings}
        onSaveLocalSayings={handleSaveLocalSayings}
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

      {friendWait ? (
        <div
          className="qc-friend-wait"
          role="dialog"
          aria-label="Challenge a friend"
          style={{
            position: 'fixed', top: 84, left: '50%', transform: 'translateX(-50%)',
            zIndex: 950, width: 'min(94vw, 440px)', boxSizing: 'border-box',
            background: theme.cardBackground, border: `1px solid ${theme.border}`,
            borderRadius: 12, boxShadow: `0 12px 32px ${theme.shadow}`,
            color: theme.textPrimary, padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <div style={{ fontWeight: 900, letterSpacing: '0.04em' }}>⚔ Challenge a Friend</div>
          <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
            Send this link — the game starts the moment they open it. You play White.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="qc-friend-wait-link" readOnly value={friendWait.link}
              onFocus={(e) => e.target.select()}
              style={{
                flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '8px 10px',
                borderRadius: 8, border: `1px solid ${theme.border}`,
                background: 'rgba(255,255,255,0.05)', color: theme.textPrimary, fontSize: 13,
              }}
            />
            <button
              type="button" className="qc-friend-wait-copy" onClick={handleCopyInvite}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                backgroundColor: theme.primary, color: theme.secondary,
                fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {inviteCopied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: theme.textSecondary }}>
              Room code: <strong style={{ color: theme.textPrimary, letterSpacing: '0.12em' }}>{friendWait.code}</strong>
              {' '}· waiting…
            </span>
            <button
              type="button" className="qc-friend-wait-cancel" onClick={handleCancelFriendWait}
              style={{
                padding: '7px 12px', borderRadius: 8, border: `1px solid ${theme.border}`,
                background: 'transparent', color: theme.textPrimary, fontWeight: 700,
                fontSize: 12.5, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <AccountModal
        open={accountOpen}
        onClose={() => { setAccountOpen(false); setBillingReturn(null); }}
        auth={auth}
        billingReturn={billingReturn}
        onReviewGame={handleReviewGame}
      />
      <ReviewModal
        open={Boolean(reviewGame)}
        onClose={() => setReviewGame(null)}
        game={reviewGame ? reviewGame.game : null}
        moves={reviewGame ? reviewGame.moves : null}
        pieceSvgStyles={svgStyles}
        indicators={indicators}
        measurementColors={measurementColors}
        squareColors={boardColors}
      />

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

      <DailyPuzzleModal
        open={dailyPuzzleOpen}
        onClose={handleClosePuzzle}
        svgStyleBySide={svgStyles}
        previewDate={puzzlePreviewDate}
      />
    </div>
  );
}
