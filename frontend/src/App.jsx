// frontend/src/App.jsx
// Purpose: The composition root — wires the engine timeline, board input,
// and the extracted feature hooks (online play, intro choreography, player
// bars, sayings, monetization, mined daily puzzle, and layout) into the rendered
// app. The feature logic itself lives in hooks/ and the sibling modules.
// Imports From: ./chessboard/*, ./hooks/*, ./components/*, ./tray/*, ./account/*, ./puzzle/*, ./sayings/*, ./settings/*, ./ai/*, ./store/*
// Exported To: None
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import './App.css';
import Board from './chessboard/Board.jsx';
import useQuantumGameState from './chessboard/useQuantumGameState.js';
import useIndicatorSettings from './settings/useIndicatorSettings.js';
import usePieceColors from './settings/usePieceColors.js';
import useBoardColors from './settings/useBoardColors.js';
import usePlayerBarColors from './settings/usePlayerBarColors.js';
import usePersistentSetting from './settings/usePersistentSetting.js';
import { playCommittedMoveSound, primeMoveAudio } from './audio/moveSounds.js';
import SideTray from './tray/SideTray.jsx';
import ConsentBanner from './components/ConsentBanner.jsx';
import HoverTip from './components/HoverTip.jsx';
import useAuth from './account/useAuth.js';
import { useDispatch, useSelector } from 'react-redux';
import { addMove, resetGame, setUserTeam } from './store/gameSlice.js';
import { setGameSettings } from './store/settingsSlice.js';
import { prewarmAllPieceSvgs, invalidateSvgCaches, prewarmCapturedPieceSvgs } from './chessboard/svgPrewarm.js';
import AppHeader from './components/AppHeader.jsx';
import MobileBar from './components/MobileBar.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import MobileNewGameSheet from './components/MobileNewGameSheet.jsx';
import { StartGameCta, IntroNudgeToast, IntroSpeechOverlay } from './components/BoardOverlays.jsx';
import AppModals from './components/AppModals.jsx';
import appLayoutStyles from './components/appLayoutStyles.js';
import useLocalAi from './ai/useLocalAi.js';
import { canAccessBot, devUnlockAllBots, getActiveBotById, DEFAULT_BOT_ID } from './ai/bots.js';
import { decideBotDrawOffer } from './ai/drawDecision.js';
import useBoardLayout from './hooks/useBoardLayout.js';
import useBoardInput from './hooks/useBoardInput.js';
import useOnlineGame from './hooks/useOnlineGame.js';
import useIntroSequence from './hooks/useIntroSequence.js';
import { INTRO_DIALOGUE } from './hooks/introSequenceData.js';

// Every intro narration page, flattened. The mobile speech lane renders these
// as invisible ghosts so its height is the TALLEST card for the whole intro —
// the board is measured against that fixed lane and never jumps between beats.
const INTRO_SPEECH_GHOST_PAGES = [...new Set(Object.values(INTRO_DIALOGUE).flat())];
import usePlayerBars from './hooks/usePlayerBars.js';
import useMonetization from './hooks/useMonetization.js';
import useGameRecording from './hooks/useGameRecording.js';
import useBotUnlockReward from './hooks/useBotUnlockReward.js';
import useEffectiveClock from './hooks/useEffectiveClock.js';
import useTimelineNav from './hooks/useTimelineNav.js';
import usePlayerSayings from './sayings/usePlayerSayings.js';
import usePuzzleDeepLinks from './puzzle/usePuzzleDeepLinks.js';
import { PRODUCT_EVENT, trackProductEvent } from './analytics/productEvents.js';
import { showRewardedAd } from './ads/adService.js';
import {
  botAccountAccess, isAdFree, isTipper, markReviewUsed, reviewCapFor, reviewsRemaining,
} from './account/billing.js';
import useDevAccountPreview from './dev/useDevAccountPreview.js';
import DevAccountSwitcher from './dev/DevAccountSwitcher.jsx';

const DEFAULT_SOUND_SETTINGS = Object.freeze({ moveSounds: true });

export default function App({ entryAction = null }) {
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
    positionSigCounts,
  } = useQuantumGameState(gameInstanceId);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesInitialPage, setRulesInitialPage] = useState(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialLessonId, setTutorialLessonId] = useState(null);
  // Narrow layout: the New Game setup panel lives in a bottom sheet.
  const [mobileNewGameOpen, setMobileNewGameOpen] = useState(false);
  const closeMobileNewGame = useCallback(() => setMobileNewGameOpen(false), []);

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

  const [showCoordinates, setShowCoordinates] = useState(false);
  const [showCheckOverlay, setShowCheckOverlay] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [showWinPopup, setShowWinPopup] = useState(false);

  // Tracks whether a game is considered "started". Initially false until a New Game starts or White makes the first move.
  const [gameStarted, setGameStarted] = useState(false);
  // Allows ending the game by actions outside the core engine (resign/draw), disabling further interaction and showing a result.
  const [externalGameOver, setExternalGameOver] = useState({ over: false, text: '' });

  const { whiteColors, blackColors, setWhiteColors, setBlackColors, svgStyles } = usePieceColors();
  const { boardColors, setBoardColors } = useBoardColors();
  const { playerBarColors, setPlayerBarColors } = usePlayerBarColors();
  const { indicators, setIndicators } = useIndicatorSettings();
  const [soundSettings, setSoundSettings] = usePersistentSetting(
    'qcSoundSettings', DEFAULT_SOUND_SETTINGS,
  );

  // Unlock Web Audio during the first genuine interaction so delayed bot,
  // tutorial, and online replies can still make sound under autoplay rules.
  useEffect(() => {
    if (!soundSettings.moveSounds) return undefined;
    const prime = () => primeMoveAudio();
    window.addEventListener('pointerdown', prime, { once: true, capture: true });
    window.addEventListener('keydown', prime, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', prime, { capture: true });
      window.removeEventListener('keydown', prime, { capture: true });
    };
  }, [soundSettings.moveSounds]);
  const realAuth = useAuth();
  const devAccountPreview = useDevAccountPreview(realAuth);
  const auth = devAccountPreview.auth;

  const dispatch = useDispatch();
  const userTeam = useSelector((state) => state.game.userTeam || 'white');
  const gameSettings = useSelector((state) => state.settings);
  const timeControl = gameSettings.timeControl || '5+5';
  const moves = useSelector((state) => state.game.moves || []);

  const aiEnabledRef = useRef(false);
  const aiDifficultyRef = useRef('medium');
  // The selected AI opponent (null when not playing vs AI). State so the
  // player bars re-render with the bot's name, rating, and avatar.
  const [aiBot, setAiBot] = useState(null);

  // The single "a move landed" commit: dispatch the lossless records, set the
  // info line, and mark the game started. Every apply path — clicks, drops,
  // AI, scripted intro replies, and relayed opponent moves — funnels here.
  const commitEngineResult = useCallback((result, { message = '', quietFailure = false } = {}) => {
    if (!result || !result.success) {
      if (!quietFailure && result && Object.prototype.hasOwnProperty.call(result, 'reason')) {
        setInfoMessage(result.reason || 'Illegal move.');
      }
      return false;
    }
    for (const r of result.records) dispatch(addMove(r));
    playCommittedMoveSound(result, soundSettings.moveSounds);
    setInfoMessage(message);
    setGameStarted(true);
    return true;
  }, [dispatch, soundSettings.moveSounds]);

  const bumpGameInstance = useCallback(() => setGameInstanceId((n) => n + 1), []);

  const online = useOnlineGame({
    auth,
    dispatch,
    moves,
    replayMoves,
    getPieceAtSquare,
    movePiece,
    canCastleBetween,
    castlePieces,
    commitEngineResult,
    gameOver,
    winner,
    gameOverReason,
    setGameStarted,
    setInfoMessage,
    setExternalGameOver,
    bumpGameInstance,
  });
  const isOnlineGameRef = online.isOnlineGameRef;

  const intro = useIntroSequence({
    introRequested: entryAction === 'intro',
    auth,
    dispatch,
    gameStarted,
    gameOver,
    sideToMove,
    getPieceAtSquare,
    getLegalMoves,
    getEnPassantMoves,
    movePiece,
    canCastleBetween,
    castlePieces,
    dismissOnboarding,
    aiEnabledRef,
    aiDifficultyRef,
    setAiBot,
  });
  const { introGuide } = intro;

  const handleRestartIntro = useCallback(() => {
    dispatch(resetGame());
    setGameInstanceId((n) => n + 1);
    aiEnabledRef.current = false;
    aiDifficultyRef.current = 'easy';
    setAiBot(null);
    dispatch(setUserTeam('white'));
    setGameStarted(false);
    setExternalGameOver({ over: false, text: '' });
    setInfoMessage('');
    intro.restartIntro();
  }, [dispatch, intro]);

  const {
    accountOpen, setAccountOpen, accountUpsellSource, pricingOpen, setPricingOpen,
    billingReturn, setBillingReturn, isPaidUser,
    handleRequirePremium, reviewGame, setReviewGame, handleReplayGame, handleReviewGame, handleShareGame,
  } = useMonetization({
    auth,
    showWinPopup,
    onRequirePremiumExtra: closeMobileNewGame,
    aiBot,
    winner,
    userTeam,
    moves,
    gameOverReason,
    externalGameOver,
    gameInstanceId,
    isOnlineGame: isOnlineGameRef.current,
  });

  const handleDevAccountLevelChange = useCallback((level) => {
    devAccountPreview.setLevel(level);
    setAccountOpen(true, 'account');
  }, [devAccountPreview.setLevel, setAccountOpen]);

  // Admin-only site stats dashboard, opened from the account panel.
  const [adminStatsOpen, setAdminStatsOpen] = useState(false);

  const puzzleLinks = usePuzzleDeepLinks({ dismissOnboarding, setReviewGame });

  // Welcome page's "Daily Puzzle" door: open today's daily once on mount
  // (same path as the tray/mobile buttons; the URL's ?puzzle deep link is
  // handled inside usePuzzleDeepLinks).
  const openPuzzleOnMount = useRef(entryAction === 'puzzle');
  useEffect(() => {
    if (!openPuzzleOnMount.current) return;
    openPuzzleOnMount.current = false;
    puzzleLinks.handleOpenPuzzle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layout = useBoardLayout({
    gameStarted,
    svgStyles,
    // Reserved for the intro's ENTIRE choreography, not per-card: budgeting
    // the rail per speech beat made the board resize on every narration
    // change (see the reserved speech lane below for the mobile analogue).
    desktopCoachOpen: Boolean(intro.introChoreo || (intro.introSpeech && intro.introSpeechOpen)),
  });
  const { isNarrow, isWide, boardSize, currentPieceSize } = layout;

  const isOnlineBars = isOnlineGameRef.current;
  const handleOpenAccountFromRating = useCallback(() => setAccountOpen(true), [setAccountOpen]);
  const bars = usePlayerBars({
    auth,
    aiBot,
    userTeam,
    isOnlineBars,
    onlineOpponent: online.onlineOpponent,
    pieces,
    onSignUpClick: handleOpenAccountFromRating,
  });

  const { speech, localSayings, handleSaveLocalSayings } = usePlayerSayings({
    pieces,
    gameOver,
    winner,
    gameInstanceId,
    botSide: bars.botSide,
    aiBot,
    isOnlineBars,
    userTeam,
    auth,
    capturedCounts: bars.capturedCounts,
  });

  const effectiveClock = useEffectiveClock({
    isOnlineGameRef,
    serverClock: online.serverClock,
    timeControl,
    sideToMove,
    moves,
    gameInstanceId,
    gameStarted,
    externalGameOver,
  });

  useGameRecording({
    auth,
    showWinPopup,
    gameOver,
    winner,
    externalGameOver,
    userTeam,
    aiBot,
    isOnlineGameRef,
    isRankedOnlineRef: online.isRankedOnlineRef,
    moves,
  });

  const didUserBeatBot = Boolean(
    showWinPopup
    && aiBot
    && !isOnlineGameRef.current
    && gameOver
    && winner === userTeam
  );
  const handleBotUnlocked = useCallback((bot) => {
    if (!bot) return;
    dispatch(setGameSettings({
      ...gameSettings,
      gameMode: 'ai',
      aiBotId: bot.id,
      aiDifficulty: bot.tier,
    }));
  }, [dispatch, gameSettings]);
  const botUnlock = useBotUnlockReward({
    active: didUserBeatBot,
    auth,
    gameKey: gameInstanceId,
    beatenBotId: aiBot && aiBot.id,
    onUnlocked: handleBotUnlocked,
  });

  useEffect(() => {
    if (gameOver) setShowWinPopup(true);
  }, [gameOver]);

  useEffect(() => {
    // silent: abandoning a game via "End & New Game" goes straight to the
    // setup panel with no winner popup.
    if (externalGameOver.over && !externalGameOver.silent) {
      setShowWinPopup(true);
    }
  }, [externalGameOver]);

  // Activation milestone: the first move made by the human side in each
  // game. This deliberately ignores an AI's opening move when the player
  // chose Black, and ignores scripted/opponent moves.
  const firstMoveTrackedGameRef = useRef(null);
  useEffect(() => {
    if (!Array.isArray(moves) || moves.length === 0) return;
    if (firstMoveTrackedGameRef.current === gameInstanceId) return;
    if (!moves.some((move) => move && move.side === userTeam)) return;
    const isIntro = Boolean(intro.introChoreo);
    const gameMode = isIntro
      ? 'intro'
      : isOnlineGameRef.current
        ? 'online'
        : aiBot
          ? 'bot'
          : 'local';
    trackProductEvent(PRODUCT_EVENT.FIRST_MOVE, {
      gameMode,
      playerSide: userTeam,
      botTier: aiBot ? aiBot.tier : undefined,
      intro: isIntro,
    });
    firstMoveTrackedGameRef.current = gameInstanceId;
  }, [moves, userTeam, gameInstanceId, aiBot, intro.introChoreo, isOnlineGameRef]);

  // Start the game implicitly if a first move has been recorded
  useEffect(() => {
    if (!gameStarted && Array.isArray(moves) && moves.length > 0) {
      setGameStarted(true);
    }
  }, [moves, gameStarted]);

  const styles = useMemo(() => appLayoutStyles(isNarrow), [isNarrow]);

  const guardExternalOver = useCallback(() => {
    if (externalGameOver.over) {
      setInfoMessage(externalGameOver.text || 'Game over.');
      return true;
    }
    return false;
  }, [externalGameOver]);

  // Pre-game the board is a preview, not a sandbox: interacting nudges the
  // player to game setup instead of silently starting a hotseat session.
  // Mobile opens the setup sheet; desktop pulses the on-board CTA (the
  // setup panel is already visible in the tray).
  const [startCtaPulse, setStartCtaPulse] = useState(0);
  const promptStartGame = useCallback(() => {
    if (isNarrow) setMobileNewGameOpen(true);
    else setStartCtaPulse((n) => n + 1);
    dismissOnboarding();
  }, [isNarrow, dismissOnboarding]);

  const input = useBoardInput({
    pieces,
    lastMove,
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
    // Contact games do get check — but only once a definite king exists
    // (the revealed-last-holder endgame), which is when the overlay matters.
    showCheckOverlay,
    commitEngineResult,
    online,
    intro,
    promptStartGame,
    guardExternalOver,
    setInfoMessage,
    isOnlineGameRef,
    aiEnabledRef,
  });
  const { selectedId, performMove } = input;

  const { currentMoveIndex, handleSeekToIndex } = useTimelineNav({
    moves,
    viewIndex,
    historyLength,
    setViewIndex,
    clearSelection: input.clearSelection,
  });

  // One-shot circles on the last move's contacts — red
  // spin-out on zapped enemies, green bloom on healed friendlies. Keyed by
  // the timeline length so back-to-back hits on the same square replay.
  const zapMarks = useMemo(
    () => (lastMove && Array.isArray(lastMove.zappedSquares) ? lastMove.zappedSquares : []),
    [lastMove]
  );
  const healMarks = useMemo(
    () => (lastMove && Array.isArray(lastMove.healedSquares) ? lastMove.healedSquares : []),
    [lastMove]
  );
  const failedHealMarks = useMemo(
    () => (lastMove && Array.isArray(lastMove.failedHealSquares) ? lastMove.failedHealSquares : []),
    [lastMove]
  );
  // Census-locked zap targets: contacted, but no possibility could shed
  // without collateral collapse elsewhere — shown as a shield, not silence.
  const fizzleMarks = useMemo(
    () => (lastMove && Array.isArray(lastMove.fizzledSquares) ? lastMove.fizzledSquares : []),
    [lastMove]
  );
  // Where the pulse came from: the moved piece's landing square, so the
  // board can fly particles from the mover to each contacted square.
  const pulseOrigin = useMemo(
    () => (lastMove && (zapMarks.length || healMarks.length || failedHealMarks.length || fizzleMarks.length) ? lastMove.to : null),
    [lastMove, zapMarks, healMarks, failedHealMarks, fizzleMarks]
  );

  // Engaging with a glowing onboarding button also retires the glow.
  const handleOpenSettings = useCallback(() => { setSettingsOpen(true); dismissOnboarding(); }, [dismissOnboarding]);
  const handleOpenRules = useCallback(() => { setRulesOpen(true); dismissOnboarding(); }, [dismissOnboarding]);
  const handleOpenAccount = useCallback(() => { setAccountOpen(true); dismissOnboarding(); }, [setAccountOpen, dismissOnboarding]);
  const handleOpenTutorial = useCallback(() => { setTutorialOpen(true); dismissOnboarding(); }, [dismissOnboarding]);

  const handleStartGame = useCallback((settings) => {
    const requestedBot = settings && settings.gameMode === 'ai'
      ? getActiveBotById(settings.aiBotId || DEFAULT_BOT_ID) || getActiveBotById(DEFAULT_BOT_ID)
      : null;
    if (requestedBot && !devUnlockAllBots() && !canAccessBot(requestedBot, botAccountAccess(auth.profile))) {
      setAccountOpen(true, 'bot_unlock');
      return;
    }

    online.teardownForNewGame();
    intro.retireIntro();

    dispatch(setGameSettings(settings));
    dispatch(resetGame());

    // Bump engine reset key to clear the internal timeline and view index
    setGameInstanceId((n) => n + 1);

    aiEnabledRef.current = false;
    aiDifficultyRef.current = settings && typeof settings.aiDifficulty === 'string' ? settings.aiDifficulty : 'medium';
    setAiBot(null);

    // Starting a new game via the tray explicitly marks the session as started
    setGameStarted(true);
    setExternalGameOver({ over: false, text: '' });

    if (online.startOnlineGame(settings)) return;

    if (settings && settings.gameMode === 'ai') {
      aiEnabledRef.current = true;
      const bot = requestedBot;
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
  }, [auth.profile, dispatch, online, intro, setAccountOpen]);

  function colorsEqual(a, b) {
    if (!a || !b) return false;
    return a.icon === b.icon
      && a.bandFill === b.bandFill
      && a.bandStroke === b.bandStroke
      && a.pieceOutline === b.pieceOutline
      && a.pieceOutlineEnabled === b.pieceOutlineEnabled;
  }

  const handleAcceptSettings = useCallback(async (settings) => {
    const whiteChanged = !colorsEqual(whiteColors, settings.white);
    const blackChanged = !colorsEqual(blackColors, settings.black);
    const anyPieceColorChanged = whiteChanged || blackChanged;

    if (whiteChanged) setWhiteColors(settings.white);
    if (blackChanged) setBlackColors(settings.black);

    setBoardColors(settings.board);
    setPlayerBarColors(settings.playerBar);
    if (settings.indicators) setIndicators(settings.indicators);
    setShowCoordinates(settings.coordinates);
    setShowCheckOverlay(settings.checkOverlay);
    setSoundSettings({ moveSounds: settings.moveSounds !== false });

    if (!anyPieceColorChanged) {
      return;
    }

    const effectiveWhite = whiteChanged ? settings.white : whiteColors;
    const effectiveBlack = blackChanged ? settings.black : blackColors;

    const newSvgStyles = {
      white: {
        ['--band-fill']: effectiveWhite.bandFill,
        ['--band-stroke']: effectiveWhite.bandStroke,
        ['--piece-outline']: effectiveWhite.pieceOutlineEnabled ? effectiveWhite.pieceOutline : 'transparent',
        ['--icon-color']: effectiveWhite.icon,
      },
      black: {
        ['--band-fill']: effectiveBlack.bandFill,
        ['--band-stroke']: effectiveBlack.bandStroke,
        ['--piece-outline']: effectiveBlack.pieceOutlineEnabled ? effectiveBlack.pieceOutline : 'transparent',
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
  }, [whiteColors, blackColors, setWhiteColors, setBlackColors, setBoardColors, setPlayerBarColors, setIndicators, setSoundSettings, currentPieceSize]);

  const winnerText = useMemo(() => {
    if (!gameOver) return '';
    if (!winner) return `Draw by ${gameOverReason || 'agreement'}.`;
    const w = winner[0].toUpperCase() + winner.slice(1);
    return `${w} wins by ${gameOverReason || 'checkmate'}!`;
  }, [gameOver, winner, gameOverReason]);

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
      commitEngineResult(res, { message: 'AI moved.', quietFailure: true });
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
      commitEngineResult(res, { message: 'AI castled.', quietFailure: true });
    }
  }, [sideToMove, getPieceAtSquare, movePiece, canCastleBetween, castlePieces, commitEngineResult, isOnlineGameRef]);

  const [confirmState, setConfirmState] = useState(null); // { variant, title, message, confirmLabel, danger, run }

  const aiThinking = useLocalAi({
    // The engine never moves during the intro choreography — Black belongs
    // to INTRO_SCRIPT until the whole act retires (or aborts), not merely
    // between scripted replies.
    enabled: !isOnlineGameRef.current
      && aiEnabledRef.current
      && !intro.introScriptOn
      && !intro.introChoreo
      && !confirmState
      && !externalGameOver.over,
    aiSide,
    difficulty: aiDifficultyRef.current,
    botId: aiBot ? aiBot.id : null,
    pieces,
    sideToMove,
    canMakeMove,
    gameOver,
    lastMove,
    repetitionSigs: positionSigCounts,
    onApplyMove: applyEngineMove,
  });

  const isPlaying = useMemo(() => gameStarted && !gameOver && !externalGameOver.over, [gameStarted, gameOver, externalGameOver]);

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
      variant: 'resign',
      danger: true,
      run: () => {
        online.reportManualGameOver({ winner: resigning === 'white' ? 'black' : 'white', reason: 'resignation' });
        setExternalGameOver({ over: true, text: `${side} resigns. ${opp} wins.` });
        setInfoMessage(`${side} resigned.`);
      },
    });
  }, [userTeam, sideToMove, online, isOnlineGameRef]);

  const handleOfferDraw = useCallback(() => {
    if (isOnlineGameRef.current) {
      online.offerDraw();
      return;
    }

    const versusBot = !isOnlineGameRef.current && aiEnabledRef.current && aiBot;
    if (versusBot) {
      setConfirmState({
        title: `Offer ${aiBot.name} a draw?`,
        message: 'Your opponent will judge the position before accepting or declining.',
        confirmLabel: 'Send Offer',
        variant: 'draw',
        danger: false,
        run: () => {
          const decision = decideBotDrawOffer({
            pieces,
            bot: aiBot,
            aiSide,
            sideToMove,
            moveCount: moves.length,
            repetitionSigs: positionSigCounts,
            lastMove,
          });
          if (decision.accept) {
            setExternalGameOver({ over: true, text: 'Draw by agreement.' });
            setInfoMessage(`${aiBot.name} accepted the draw.`);
            return;
          }
          setInfoMessage(`${aiBot.name} declined the draw.`);
          setConfirmState({
            title: 'Draw declined',
            message: decision.reason,
            confirmLabel: 'Keep Playing',
            cancelLabel: null,
            variant: 'draw-declined',
            danger: false,
            run: null,
          });
        },
      });
      return;
    }

    setConfirmState({
      title: 'Agree to a draw?',
      message: 'The game ends immediately as a draw by agreement.',
      confirmLabel: 'Draw',
      variant: 'draw',
      danger: false,
      run: () => {
        online.reportManualGameOver({ winner: null, reason: 'agreement' });
        setExternalGameOver({ over: true, text: 'Draw by agreement.' });
        setInfoMessage('Draw agreed.');
      },
    });
  }, [online, aiBot, pieces, aiSide, sideToMove, moves.length, positionSigCounts, lastMove, isOnlineGameRef]);

  const [newGameSignal, setNewGameSignal] = useState(0);
  const handleRequestNewGame = useCallback(() => {
    setConfirmState({
      title: 'End this game?',
      message: 'The current game will be abandoned and you can set up a new one.',
      confirmLabel: 'End & New Game',
      variant: 'end-game',
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

  // --- Game-over actions ---------------------------------------------------
  // Play Again re-enters the SAME queue: gameSettings still holds the mode
  // (same bot, same online matchmaking settings, same local setup) and
  // handleStartGame does the rest, including online re-queueing.
  const handlePlayAgain = useCallback(() => {
    setShowWinPopup(false);
    handleStartGame(gameSettings);
  }, [gameSettings, handleStartGame]);

  // Review ladder: Premium unlimited; tippers get five without ads; free
  // accounts get three, each granted only after a rewarded ad is viewed.
  const [, setPostGameReviewQuotaVersion] = useState(0);
  const [postGameReviewNotice, setPostGameReviewNotice] = useState('');
  const [postGameReviewBusy, setPostGameReviewBusy] = useState(false);
  const reviewUserId = auth.user && auth.user.id;
  const postGameReviewsRemaining = reviewsRemaining(auth.profile, reviewUserId);
  const postGameReviewAccess = isPaidUser ? 'premium'
    : postGameReviewsRemaining === 0 ? 'limit'
      : isTipper(auth.profile) ? 'tip' : 'ad';
  useEffect(() => {
    setPostGameReviewNotice('');
    setPostGameReviewBusy(false);
  }, [gameInstanceId]);

  const handlePostGameReview = useCallback(async () => {
    if (postGameReviewBusy) return;
    const cap = reviewCapFor(auth.profile);
    if (reviewsRemaining(auth.profile, reviewUserId) === 0) {
      setPostGameReviewNotice(`You've used today's ${cap} reviews — more tomorrow, or go Premium for unlimited.`);
      return;
    }
    setPostGameReviewBusy(true);
    try {
      if (!isPaidUser && !isTipper(auth.profile)) {
        const rewarded = await showRewardedAd();
        if (!rewarded) return;
      }
      if (!isPaidUser) {
        markReviewUsed(reviewUserId);
        setPostGameReviewQuotaVersion((version) => version + 1);
      }
      setShowWinPopup(false);
      setReviewGame({
        game: {
          user_side: userTeam,
          opponent: (aiBot && aiBot.name) || 'Opponent',
          headline: resolvedWinnerText || 'Game review',
        },
        moves,
      });
      trackProductEvent(PRODUCT_EVENT.REVIEW_OPENED, {
        accessType: isPaidUser ? 'premium' : isTipper(auth.profile) ? 'tip' : 'rewarded_ad',
        gameResult: resolvedWinnerText,
        moveCount: moves.length,
      });
    } finally {
      setPostGameReviewBusy(false);
    }
  }, [postGameReviewBusy, auth.profile, reviewUserId, userTeam, aiBot, resolvedWinnerText, moves, isPaidUser, setReviewGame]);

  const showClockUI = isOnlineGameRef.current; // only show timers for online games
  const onlineDrawOfferRole = isOnlineGameRef.current && online.drawOffer
    ? (online.drawOffer.offeredBy === userTeam ? 'offered' : 'received')
    : null;
  const barCtx = {
    speech,
    effectiveClock,
    botThinking: aiThinking,
    introSpeechCollapsed: Boolean(intro.introSpeech && !intro.introSpeechOpen),
    onIntroSpeechExpand: intro.expandIntroSpeech,
  };

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      {/* Phones skip the banner — every vertical pixel goes to the board. */}
      {!isNarrow ? (
        <AppHeader
          accountSignedIn={Boolean(auth.user)}
          accountName={(auth.profile && auth.profile.username) || ''}
          accountAvatarUrl={(auth.profile && auth.profile.avatar_url) || null}
          onOpenAccount={handleOpenAccount}
          onOpenSettings={handleOpenSettings}
        />
      ) : null}

      <div className="qc-board-area" style={styles.boardArea}>
        <div className="qc-board-stack" style={styles.boardStack}>
          <div className="qc-board-stage" style={styles.boardStage} ref={layout.boardStageRef}>
            <div className="qc-bar-wrap" style={layout.barWrapStyle}>
              <PlayerBar
                {...bars.barPropsFor(bars.topBarSide, barCtx)}
                playerBarColors={playerBarColors}
                svgStyles={svgStyles}
                barRef={layout.topBarRef}
                showClock={showClockUI}
                capturedPosition={isNarrow ? 'above' : 'inline'}
              />
            </div>

            {isNarrow ? (
              <div
                className={`qc-intro-speech-slot qc-intro-speech-slot--mobile${intro.introChoreo ? ' qc-intro-speech-slot--reserved' : ''}`}
                ref={layout.coachLaneRef}
              >
                {intro.introChoreo
                  ? INTRO_SPEECH_GHOST_PAGES.map((text) => (
                      <div key={text} className="qc-intro-speech-ghost" aria-hidden="true">
                        <IntroSpeechOverlay
                          speech={text}
                          open
                          placement="mobile"
                          needsContinue
                        />
                      </div>
                    ))
                  : null}
                <IntroSpeechOverlay
                  speech={intro.introSpeech}
                  open={intro.introSpeechOpen}
                  placement="mobile"
                  awaitingChoice={intro.introAwaitingChoice}
                  needsContinue={intro.introNeedsContinue}
                  onCollapse={intro.collapseIntroSpeech}
                  onInteract={intro.interactWithIntroSpeech}
                  onContinueExplanation={intro.continueIntroExplanation}
                  onContinue={intro.continueFromIntro}
                  onRestart={handleRestartIntro}
                />
              </div>
            ) : null}

            <div className="qc-board-row" style={styles.boardRow}>
              {isWide ? (
                <div className={`qc-intro-speech-slot qc-intro-speech-slot--desktop qc-intro-speech-slot--desktop-left${intro.introChoreo ? ' qc-intro-speech-slot--reserved' : ''}`}>
                  <IntroSpeechOverlay
                    speech={intro.introSpeech}
                    open={intro.introSpeechOpen}
                    placement="desktop"
                    awaitingChoice={intro.introAwaitingChoice}
                    needsContinue={intro.introNeedsContinue}
                    onCollapse={intro.collapseIntroSpeech}
                    onInteract={intro.interactWithIntroSpeech}
                    onContinueExplanation={intro.continueIntroExplanation}
                    onContinue={intro.continueFromIntro}
                    onRestart={handleRestartIntro}
                  />
                </div>
              ) : null}
              <div className="qc-board-holder" style={styles.boardHolder}>
                <Board
                  orientation={userTeam}
                  showCoordinates={showCoordinates}
                  highlights={input.combinedHighlights}
                  onSquareClick={input.handleSquareClick}
                  onSquareRightClick={input.handleSquareRightClick}
                  onPieceClick={input.handlePieceClick}
                  onPieceDragStart={input.handlePieceDragStart}
                  onPieceDrop={input.handlePieceDrop}
                  onDragHover={input.handleDragHover}
                  pieces={pieces}
                  selectedId={selectedId}
                  zapMarks={zapMarks}
                  healMarks={healMarks}
                  failedHealMarks={failedHealMarks}
                  fizzleMarks={fizzleMarks}
                  pulseOrigin={pulseOrigin}
                  effectKey={historyLength}
                  indicators={indicators}
                  legalMoves={input.selectedMoves}
                  maxVisualSize={boardSize > 0 ? `${boardSize}px` : 'min(85vmin, 720px)'}
                  borderColor="transparent"
                  shadow="rgba(0, 0, 0, 0.15)"
                  pieceSvgStyles={svgStyles}
                  onResize={layout.handleBoardResize}
                  squareColors={boardColors}
                  attractSquare={introGuide && !selectedId ? introGuide.from : null}
                  guideSquare={introGuide ? introGuide.to : null}
                />
                {!gameStarted && !intro.introFreePlay ? (
                  <StartGameCta pulse={startCtaPulse} onClick={promptStartGame} />
                ) : null}
                <IntroNudgeToast nudge={intro.introNudge} />
              </div>
              {!isNarrow ? (
                <SideTray
                  height={layout.trayHeight}
                  stacked={false}
                  infoMessage={infoMessage}
                  onOpenSettings={handleOpenSettings}
                  onOpenRules={handleOpenRules}
                  onStartGame={handleStartGame}
                  initialGameSettings={gameSettings}
                  onSetHighlights={input.handleSetHighlights}
                  onClearHighlights={input.handleClearHighlights}
                  onSeekToIndex={handleSeekToIndex}
                  externalIndex={currentMoveIndex}
                  isPlaying={isPlaying}
                  onResign={handleResign}
                  onOfferDraw={handleOfferDraw}
                  drawOfferRole={onlineDrawOfferRole}
                  onRetractDrawOffer={online.retractDrawOffer}
                  onAcceptDrawOffer={online.acceptDrawOffer}
                  onDeclineDrawOffer={online.declineDrawOffer}
                  onRequestNewGame={handleRequestNewGame}
                  isOnlineGame={isOnlineGameRef.current}
                  searching={online.mmActive}
                  onCancelSearch={online.handleCancelSearch}
                  newGameSignal={newGameSignal}
                  onOpenAccount={handleOpenAccount}
                  accountSignedIn={Boolean(auth.user)}
                  auth={auth}
                  onboarding={onboarding}
                  onDismissOnboarding={dismissOnboarding}
                  isPaid={isPaidUser}
                  onRequirePremium={handleRequirePremium}
                  attentionSignal={startCtaPulse}
                  onOpenPuzzle={puzzleLinks.handleOpenPuzzle}
                  puzzleUnsolved={puzzleLinks.puzzleUnsolved}
                  onOpenTutorial={handleOpenTutorial}
                />
              ) : null}
              {!isNarrow && !isWide ? (
                <div className="qc-intro-speech-slot qc-intro-speech-slot--desktop qc-intro-speech-slot--desktop-right">
                  <IntroSpeechOverlay
                    speech={intro.introSpeech}
                    open={intro.introSpeechOpen}
                    placement="desktop"
                    awaitingChoice={intro.introAwaitingChoice}
                    needsContinue={intro.introNeedsContinue}
                    onCollapse={intro.collapseIntroSpeech}
                    onInteract={intro.interactWithIntroSpeech}
                    onContinueExplanation={intro.continueIntroExplanation}
                    onContinue={intro.continueFromIntro}
                    onRestart={handleRestartIntro}
                  />
                </div>
              ) : null}
            </div>

            <div className="qc-bar-wrap" style={layout.barWrapStyle}>
              <PlayerBar
                {...bars.barPropsFor(bars.bottomBarSide, barCtx)}
                playerBarColors={playerBarColors}
                svgStyles={svgStyles}
                barRef={layout.bottomBarRef}
                showClock={showClockUI}
                capturedPosition={isNarrow ? 'below' : 'inline'}
              />
            </div>
          </div>
        </div>
      </div>

      <footer className="qc-site-footer" style={styles.footer}>
        <a href="/about.html" style={styles.footerLink}>About</a>
        <span style={{ opacity: 0.4 }}>·</span>
        <a href="/privacy.html" style={styles.footerLink}>Privacy</a>
        <span style={{ opacity: 0.4 }}>·</span>
        <a href="/terms.html" style={styles.footerLink}>Terms</a>
      </footer>

      {/* Restore a saved choice for Consent Mode, but never interrupt play.
          The actual Accept/Necessary prompt belongs to the welcome page. */}
      <ConsentBanner promptIfUnset={false} />
      <HoverTip />

      {isNarrow ? (
        <>
          <MobileBar
            isPlaying={isPlaying}
            hasGameHistory={gameStarted || moves.length > 0}
            searching={online.mmActive}
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
            drawOfferRole={onlineDrawOfferRole}
            onRetractDrawOffer={online.retractDrawOffer}
            onAcceptDrawOffer={online.acceptDrawOffer}
            onDeclineDrawOffer={online.declineDrawOffer}
            onCancelSearch={online.handleCancelSearch}
            onOpenPuzzle={puzzleLinks.handleOpenPuzzle}
            puzzleUnsolved={puzzleLinks.puzzleUnsolved}
          />
          <MobileNewGameSheet
            open={mobileNewGameOpen}
            onClose={closeMobileNewGame}
            onStartGame={(settings) => {
              setMobileNewGameOpen(false);
              handleStartGame(settings);
            }}
            initialGameSettings={gameSettings}
            isPaid={isPaidUser}
            onRequirePremium={handleRequirePremium}
            auth={auth}
            onOpenAccount={handleOpenAccount}
          />
        </>
      ) : null}

      {import.meta.env.DEV ? (
        <DevAccountSwitcher
          level={devAccountPreview.level}
          onChange={handleDevAccountLevelChange}
        />
      ) : null}

      <AppModals
        showWinPopup={showWinPopup}
        resolvedWinnerText={resolvedWinnerText}
        externalGameOver={externalGameOver}
        winner={winner}
        onCloseWinPopup={() => setShowWinPopup(false)}
        onPlayAgain={handlePlayAgain}
        playAgainLabel={botUnlock.reward && botUnlock.reward.selectedBot
          ? `Play ${botUnlock.reward.selectedBot.name}`
          : 'Play Again'}
        botUnlockReward={didUserBeatBot ? botUnlock.reward : null}
        onChooseBot={botUnlock.choose}
        onRequireBotAccess={() => setAccountOpen(true, 'bot_unlock')}
        onSignInForBots={() => setAccountOpen(true, 'bot_unlock')}
        onGameReview={handlePostGameReview}
        reviewAccess={postGameReviewAccess}
        reviewRemaining={postGameReviewsRemaining}
        reviewNotice={postGameReviewNotice}
        reviewDisabled={moves.length === 0 || postGameReviewBusy}
        showTipPromo={!isAdFree(auth.profile)}
        onTipPromo={() => { setShowWinPopup(false); setAccountOpen(true, 'game_end_promo'); }}
        pendingEpChoice={input.pendingEpChoice}
        performMove={performMove}
        onCancelEpChoice={() => {
          input.setPendingEpChoice(null);
          input.clearSelection();
        }}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        colors={{ whiteColors, blackColors, boardColors, playerBarColors }}
        indicators={indicators}
        showCoordinates={showCoordinates}
        showCheckOverlay={showCheckOverlay}
        moveSoundsEnabled={soundSettings.moveSounds}
        onAcceptSettings={handleAcceptSettings}
        rulesOpen={rulesOpen}
        rulesInitialPage={rulesInitialPage}
        onCloseRules={() => { setRulesOpen(false); setRulesInitialPage(null); }}
        onPlayLesson={(lessonId) => {
          setRulesOpen(false);
          setRulesInitialPage(null);
          setTutorialLessonId(lessonId);
          setTutorialOpen(true);
        }}
        tutorialOpen={tutorialOpen}
        closeTutorial={closeTutorial}
        tutorialLessonId={tutorialLessonId}
        onOpenRulesPage={(pageTitle) => {
          closeTutorial();
          setRulesInitialPage(pageTitle);
          setRulesOpen(true);
        }}
        online={online}
        auth={auth}
        accountOpen={accountOpen}
        accountUpsellSource={accountUpsellSource}
        onCloseAccount={() => { setAccountOpen(false); setBillingReturn(null); }}
        billingReturn={billingReturn}
        handleReplayGame={handleReplayGame}
        handleReviewGame={handleReviewGame}
        handleShareGame={handleShareGame}
        onAccountCreated={(needsConfirmation) => {
          // No pricing pitch at signup (it was burying the check-your-email
          // page). Premium stays desire-timed: locked bots, review-after-loss,
          // save cap, and the signed-in account panel.
          if (!needsConfirmation) setAccountOpen(false);
        }}
        pricingOpen={pricingOpen}
        onClosePricing={() => setPricingOpen(false)}
        reviewGame={reviewGame}
        onCloseReview={() => setReviewGame(null)}
        adminStatsOpen={adminStatsOpen}
        onOpenAdminStats={() => setAdminStatsOpen(true)}
        onCloseAdminStats={() => setAdminStatsOpen(false)}
        minedPreview={puzzleLinks.activePuzzle}
        onCloseMinedPreview={puzzleLinks.handleClosePuzzle}
        onCompleteMinedPreview={puzzleLinks.handlePuzzleComplete}
        confirmState={confirmState}
        setConfirmState={setConfirmState}
        svgStyles={svgStyles}
        localSayings={localSayings}
        onSaveLocalSayings={handleSaveLocalSayings}
        bars={bars}
      />
    </div>
  );
}
