// frontend/src/hooks/useIntroSequence.js
// Purpose: The welcome-page intro — a live board with a glowing first move,
// a quietly-seated easy bot whose opening is scripted (INTRO_SCRIPT) and
// narrated (INTRO_DIALOGUE), plus choreographed White moves (INTRO_GUIDE)
// with off-script nudges. Extracted from App.jsx.
// Imports From: ../ai/bots.js, ../store/gameSlice.js
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBotById, DEFAULT_BOT_ID } from '../ai/bots.js';
import { addMove, setUserTeam } from '../store/gameSlice.js';
import { canRunIntroReply, INTRO_DIALOGUE, INTRO_GUIDE, INTRO_SCRIPT } from './introSequenceData.js';

export { INTRO_GUIDE, INTRO_SCRIPT } from './introSequenceData.js';

// Opponent quietly seated when a first-time visitor moves a piece on the
// intro board (see introFreePlay). Easiest bot: the first minute should feel
// magical, not punishing.
const INTRO_BOT_ID = 'isaac-steinitz';

export default function useIntroSequence({
  introRequested = false,
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
}) {
  // The welcome page explicitly selects this live lesson. The board is
  // immediately playable, a white move glows, and the quietly seated easy bot
  // follows the scripted Black replies. Normal /play visits no longer inherit
  // an automatic tutorial from storage state.
  const [introFreePlay, setIntroFreePlay] = useState(() => Boolean(introRequested));
  // Which intro dialogue card is showing (null = none).
  const [introStage, setIntroStage] = useState(() => (introFreePlay ? 'welcome' : null));
  // While true, Black's replies come from INTRO_SCRIPT and useLocalAi stays
  // quiet; flips false after the final scripted reply (or invalidation).
  const [introScriptOn, setIntroScriptOn] = useState(false);
  const [introScriptStep, setIntroScriptStep] = useState(0);
  // Guards the reply timer against stale duplicate firings: records the last
  // script step that actually executed.
  const introScriptDoneRef = useRef(-1);
  // The whole choreography (guided White moves included) lives under this
  // flag; unlike introFreePlay it survives the game starting, and dies on an
  // explicit new game, a restored sign-in, or a derailed script.
  const [introChoreo, setIntroChoreo] = useState(() => Boolean(introRequested));
  // Guided White moves already played (INTRO_GUIDE index).
  const [introGuideStep, setIntroGuideStep] = useState(0);
  // The final scripted Black move has landed. Keep both the real bot and the
  // board paused until the visitor chooses to continue from here or replay
  // the opening.
  const [introAwaitingChoice, setIntroAwaitingChoice] = useState(false);
  // Post-White-move explanation cards are explicit reading checkpoints.
  // Black does not make the next scripted reply until Continue is pressed.
  const [introNeedsContinue, setIntroNeedsContinue] = useState(false);
  // Off-script attempt during a guided turn: a shaking toast over the board.
  // The counter keys the element so repeat offenses replay the animation.
  const [introNudge, setIntroNudge] = useState(null); // { text, n }
  useEffect(() => {
    if (!introNudge) return;
    const timer = setTimeout(() => setIntroNudge(null), 2600);
    return () => clearTimeout(timer);
  }, [introNudge]);
  const introDialogue = introStage ? INTRO_DIALOGUE[introStage] || null : null;
  const introSpeechPages = useMemo(() => {
    if (!introDialogue) return [];
    return Array.isArray(introDialogue) ? introDialogue : [introDialogue];
  }, [introDialogue]);
  const [introSpeechPage, setIntroSpeechPage] = useState(0);
  const introSpeech = introSpeechPages[introSpeechPage] || introSpeechPages[0] || null;
  const introDialogueIsPaged = introSpeechPages.length > 1;
  const introHasMorePages = introSpeechPage + 1 < introSpeechPages.length;
  // Multi-page cards always require acknowledgement, including narration
  // after Black's move. The final Continue closes the last page.
  const introRequiresContinue = introNeedsContinue || introDialogueIsPaged;
  useEffect(() => {
    setIntroSpeechPage(0);
  }, [introStage]);

  // Each new narration beat opens over the board, then folds into a glowing
  // icon beside the opponent avatar after ten untouched seconds. Clicking
  // anywhere in the card pins it; the close button folds it immediately.
  const [introSpeechOpen, setIntroSpeechOpen] = useState(() => Boolean(introFreePlay));
  const introSpeechTimerRef = useRef(null);
  const clearIntroSpeechTimer = useCallback(() => {
    if (introSpeechTimerRef.current) clearTimeout(introSpeechTimerRef.current);
    introSpeechTimerRef.current = null;
  }, []);
  useEffect(() => {
    clearIntroSpeechTimer();
    if (!introSpeech) {
      setIntroSpeechOpen(false);
      return undefined;
    }
    setIntroSpeechOpen(true);
    // A required checkpoint must stay visible until Continue is pressed;
    // collapsing it would make Black appear unresponsive while waiting.
    if (introRequiresContinue) return clearIntroSpeechTimer;
    introSpeechTimerRef.current = setTimeout(() => {
      setIntroSpeechOpen(false);
      introSpeechTimerRef.current = null;
    }, 10000);
    return clearIntroSpeechTimer;
  }, [introStage, introSpeech, introRequiresContinue, clearIntroSpeechTimer]);
  const interactWithIntroSpeech = useCallback(() => {
    clearIntroSpeechTimer();
  }, [clearIntroSpeechTimer]);
  const collapseIntroSpeech = useCallback(() => {
    clearIntroSpeechTimer();
    setIntroSpeechOpen(false);
  }, [clearIntroSpeechTimer]);
  const expandIntroSpeech = useCallback(() => {
    clearIntroSpeechTimer();
    setIntroSpeechOpen(true);
  }, [clearIntroSpeechTimer]);

  // First touch of the intro board seats the opponent. The move itself flips
  // gameStarted via the normal move path; Black's replies then come from
  // INTRO_SCRIPT, and useLocalAi takes over after it.
  const ensureIntroGame = useCallback(() => {
    if (aiEnabledRef.current) return;
    const bot = getBotById(INTRO_BOT_ID) || getBotById(DEFAULT_BOT_ID);
    aiEnabledRef.current = true;
    aiDifficultyRef.current = bot ? bot.tier : 'easy';
    setAiBot(bot);
    setIntroScriptOn(true);
    dispatch(setUserTeam('white'));
  }, [dispatch, aiEnabledRef, aiDifficultyRef, setAiBot]);

  // An explicit new game retires the intro script and its narration.
  const retireIntro = useCallback(() => {
    clearIntroSpeechTimer();
    setIntroScriptOn(false);
    setIntroStage(null);
    setIntroChoreo(false);
    setIntroAwaitingChoice(false);
    setIntroNeedsContinue(false);
  }, [clearIntroSpeechTimer]);

  const continueFromIntro = useCallback(() => {
    clearIntroSpeechTimer();
    setIntroAwaitingChoice(false);
    setIntroStage(null);
    setIntroScriptOn(false);
    setIntroChoreo(false);
    setIntroNeedsContinue(false);
  }, [clearIntroSpeechTimer]);

  const continueIntroExplanation = useCallback(() => {
    clearIntroSpeechTimer();
    if (introHasMorePages) {
      setIntroSpeechPage((page) => page + 1);
      return;
    }
    setIntroNeedsContinue(false);
    setIntroStage(null);
  }, [clearIntroSpeechTimer, introHasMorePages]);

  // The App resets the engine/Redux timeline; this resets the choreography
  // itself so the exact same opening can begin again without a page reload.
  const restartIntro = useCallback(() => {
    clearIntroSpeechTimer();
    introScriptDoneRef.current = -1;
    setIntroFreePlay(true);
    setIntroStage('welcome');
    setIntroSpeechOpen(true);
    setIntroScriptOn(false);
    setIntroScriptStep(0);
    setIntroChoreo(true);
    setIntroGuideStep(0);
    setIntroAwaitingChoice(false);
    setIntroNeedsContinue(false);
    setIntroNudge(null);
  }, [clearIntroSpeechTimer]);

  useEffect(() => {
    if (introFreePlay && gameStarted) {
      setIntroFreePlay(false);
      dismissOnboarding();
      // The invitation did its job; the next card arrives with Black's reply.
      setIntroStage((s) => (s === 'welcome' ? null : s));
    }
  }, [introFreePlay, gameStarted, dismissOnboarding]);

  // Legacy automatic intros were for anonymous first-timers. An explicit
  // welcome-page request should still be honored if auth restores mid-load.
  useEffect(() => {
    if (auth.user && !gameStarted && !introRequested) {
      setIntroFreePlay(false);
      retireIntro();
    }
  }, [auth.user, gameStarted, introRequested, retireIntro]);

  // The choreographed White move currently on offer, or null. Turn order is
  // the lockstep: Black's scripted replies hold sideToMove until they land,
  // so on White's turn the next unplayed guide entry is always the right one
  // (counter equality with the script proved brittle — one double-stepped
  // reply desynced it for good). If the position invalidates every candidate,
  // the guidance retires and the game is theirs.
  const introGuide = useMemo(() => {
    if (!introChoreo || gameOver || sideToMove !== 'white') return null;
    const g = INTRO_GUIDE[introGuideStep];
    if (!g) return null;
    for (const candidate of g.candidates || []) {
      const { from, to, enPassant = false } = candidate;
      const piece = getPieceAtSquare(from);
      const standardLegal = piece && getLegalMoves(piece.id).includes(to);
      const enPassantLegal = piece && enPassant
        && getEnPassantMoves(piece.id).some((move) => move.to === to);
      if (piece && piece.side === 'white' && (standardLegal || enPassantLegal)) {
        return {
          from,
          to,
          enPassant,
          stage: g.stage,
          completeAfterWhite: g.completeAfterWhite,
        };
      }
    }
    // A guided quantum castle: glow one partner, light the other; the input
    // layer accepts exactly this pair while the guide is up.
    for (const [sqA, sqB] of g.castles || []) {
      const a = getPieceAtSquare(sqA);
      const b = getPieceAtSquare(sqB);
      if (!a || !b || a.side !== 'white' || b.side !== 'white') continue;
      if (canCastleBetween(a.id, b.id).canCastle) {
        return { from: sqA, to: sqB, castle: true, stage: g.stage };
      }
    }
    return null;
  }, [introChoreo, gameOver, sideToMove, introGuideStep, getPieceAtSquare, getLegalMoves, getEnPassantMoves, canCastleBetween]);

  // The choreography is all-or-nothing: it retires explicitly — last guided
  // move played, game somehow over, or no candidate playable on a guided
  // turn — and only then do the engine and free movement take over. No
  // silent drift between scripted and unscripted play.
  useEffect(() => {
    if (!introChoreo) return;
    if (gameOver) {
      setIntroChoreo(false);
      return;
    }
    // Once White has played the last guided move, keep the choreography lock
    // alive while Black delivers the final scripted reply and CTA.
    if (introGuideStep >= INTRO_GUIDE.length) return;
    if (!gameStarted || sideToMove !== 'white') return;
    if (!introGuide) setIntroChoreo(false);
  }, [introChoreo, introGuide, introGuideStep, gameStarted, gameOver, sideToMove]);

  // Off-script attempt during a guided turn: shake the toast.
  const nudgeOffScript = useCallback(() => {
    setIntroNudge((prev) => ({
      text: introGuide ? `Follow the glow: ${introGuide.from} → ${introGuide.to}` : '',
      n: (prev?.n || 0) + 1,
    }));
  }, [introGuide]);

  // The guided move was just played: advance the choreography and show its
  // payoff card.
  const onGuidedMovePlayed = useCallback(() => {
    setIntroGuideStep((n) => n + 1);
    if (introGuide && introGuide.stage) {
      setIntroStage(introGuide.stage);
      if (introGuide.completeAfterWhite) {
        setIntroNeedsContinue(false);
        setIntroAwaitingChoice(true);
        setIntroScriptOn(false);
      } else {
        setIntroNeedsContinue(true);
      }
    }
  }, [introGuide]);

  // Plays Black's scripted intro opening, one reply per Black turn, a beat
  // after the visitor's move so it reads as a decision rather than a reflex.
  useEffect(() => {
    if (!canRunIntroReply({
      scriptOn: introScriptOn,
      needsContinue: introNeedsContinue,
      gameStarted,
      gameOver,
      sideToMove,
    })) return;
    const step = INTRO_SCRIPT[introScriptStep];
    if (!step) { setIntroScriptOn(false); return; }
    const timer = setTimeout(() => {
      if (introScriptDoneRef.current >= introScriptStep) return;
      let played = false;
      for (const [fromSq, toSq] of step.moves || []) {
        const piece = getPieceAtSquare(fromSq);
        if (!piece || piece.side !== 'black') continue;
        if (!getLegalMoves(piece.id).includes(toSq)) continue;
        const res = movePiece(piece.id, toSq);
        if (res && res.success) {
          for (const r of res.records) dispatch(addMove(r));
          played = true;
          break;
        }
      }
      if (!played) {
        for (const [sqA, sqB] of step.castles || []) {
          const a = getPieceAtSquare(sqA);
          const b = getPieceAtSquare(sqB);
          if (!a || !b) continue;
          const { canCastle } = canCastleBetween(a.id, b.id);
          if (!canCastle) continue;
          const res = castlePieces(a.id, b.id);
          if (res && res.success) {
            for (const r of res.records) dispatch(addMove(r));
            played = true;
            break;
          }
        }
      }
      if (played) {
        introScriptDoneRef.current = introScriptStep;
        setIntroStage(step.stage);
        setIntroScriptStep((n) => n + 1);
        if (introScriptStep + 1 >= INTRO_SCRIPT.length) setIntroScriptOn(false);
      } else {
        // The visitor's play blocked the script — hand Black to the engine,
        // stop choreographing White, and leave whatever card is up alone.
        setIntroScriptOn(false);
        setIntroChoreo(false);
      }
    }, step.delay || 1100);
    return () => clearTimeout(timer);
  }, [introScriptOn, introNeedsContinue, introScriptStep, gameStarted, gameOver, sideToMove, getPieceAtSquare, getLegalMoves, movePiece, canCastleBetween, castlePieces, dispatch]);

  return {
    introFreePlay,
    introSpeech,
    introSpeechOpen,
    introAwaitingChoice,
    introNeedsContinue: introRequiresContinue,
    introGuide,
    introNudge,
    introScriptOn,
    introChoreo,
    ensureIntroGame,
    retireIntro,
    continueFromIntro,
    continueIntroExplanation,
    restartIntro,
    interactWithIntroSpeech,
    collapseIntroSpeech,
    expandIntroSpeech,
    nudgeOffScript,
    onGuidedMovePlayed,
  };
}
