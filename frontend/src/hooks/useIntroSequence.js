// frontend/src/hooks/useIntroSequence.js
// Purpose: The first-visit intro — a live board with a glowing first move,
// a quietly-seated easy bot whose opening is scripted (INTRO_SCRIPT) and
// narrated (INTRO_DIALOGUE), plus choreographed White moves (INTRO_GUIDE)
// with off-script nudges. Extracted from App.jsx.
// Imports From: ../ai/bots.js, ../store/gameSlice.js
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBotById, DEFAULT_BOT_ID } from '../ai/bots.js';
import { addMove, setUserTeam } from '../store/gameSlice.js';

// Opponent quietly seated when a first-time visitor moves a piece on the
// intro board (see introFreePlay). Easiest bot: the first minute should feel
// magical, not punishing.
const INTRO_BOT_ID = 'isaac-steinitz';

// Black's scripted opening for the intro game: two knight leaps that vacate
// the back rank, then a quantum castle through the empty square — a first
// minute that shows off the game's strangest rule. Each step tries its
// candidates in order against the live position (the visitor's play can block
// them); if none is legal the script yields to the real engine. `delay` gives
// the visitor time to read the payoff card their own move just earned.
const INTRO_SCRIPT = [
  { moves: [['g8', 'f6'], ['g8', 'h6']], stage: 'reply1', delay: 1100 },
  { moves: [['b8', 'c6'], ['b8', 'a6']], stage: 'reply2', delay: 4500 },
  { castles: [['f8', 'h8'], ['a8', 'c8']], stage: 'castle', delay: 4500 },
  { moves: [['d7', 'd5']], stage: 'reply3', delay: 4500 },
  { moves: [['e7', 'e5']], stage: 'reply4', delay: 4500 },
  { moves: [['e5', 'e4']], stage: 'reply5', delay: 4500 },
];

// White's choreographed moves: entry i is offered once Black has made i
// scripted replies — the piece glows, the destination lights up, and other
// moves are gently refused. The line is picked so the pips tell their story
// on cue: e4 stays a watched 3-type piece whose coherence pips drain (Nf6
// observes it), and b1-c3 collapses to a knight whose recoherence clock
// then fills move by move.
const INTRO_GUIDE = [
  { candidates: [['e2', 'e4']], stage: null },
  { candidates: [['d2', 'd4']], stage: 'guide1' },
  { candidates: [['b1', 'c3']], stage: 'guide2' },
  { candidates: [['a2', 'a3']], stage: 'guide3' },
  { candidates: [['g2', 'g3']], stage: 'guide4' },
  { candidates: [['a3', 'a4']], stage: 'guide5' },
  { candidates: [['d4', 'e4']], stage: 'guide6' },
];

// Spoken in the top player bar's speech bubble (welcome by the Stranger,
// the rest by the intro bot), so keep each line bubble-sized.
const INTRO_DIALOGUE = {
  welcome: 'Every piece is every piece — until it’s observed. Move the glowing pawn to the lit square.',
  reply1: 'A leap only a knight could make… so a knight it becomes.',
  guide1: 'The pips on your e4 pawn are coherence. My knight is watching it — one pip just went dark.',
  reply2: 'Both my knights are out — no other piece of mine can be one now.',
  guide2: 'Your leap fully collapsed that piece — a knight, nothing else. The dots beneath it are a recoherence clock.',
  castle: 'A quantum castle: two pieces, each maybe king, maybe rook — and free to blur again.',
  guide3: 'The clock fills as you move — full, a piece regains a possibility. Keep an eye on your knight.',
  reply3: 'My pawn steps out — and takes another look at your e4. Watched pieces wear down.',
  guide4: 'A second look landed — your e4 is down to its last pip. One more and it breaks.',
  reply4: 'A third look, straight down the file. Your e4 cannot absorb another.',
  guide5: 'Three measurements — e4 broke. It was never a pawn: rook or queen now. And your knight’s clock just filled.',
  reply5: 'Captured — a taken piece resolves as the least it could be. A rook. And my rings now claim your maybe-kings.',
  guide6: 'Answered — take the checker and the claim dies. A maybe-king left under a ring stops being one. The board is yours.',
};

export default function useIntroSequence({
  auth,
  dispatch,
  gameStarted,
  gameOver,
  sideToMove,
  getPieceAtSquare,
  getLegalMoves,
  movePiece,
  canCastleBetween,
  castlePieces,
  dismissOnboarding,
  aiEnabledRef,
  aiDifficultyRef,
  setAiBot,
}) {
  // Never-visited first minute: the board is live immediately — no Start Game
  // wall. A white pawn glows until it is picked up, and the first interaction
  // quietly seats an easy bot as Black whose opening is scripted and
  // narrated. Anonymous visitors only — a restored sign-in switches back to
  // the normal home. Consumed once any game starts.
  // Storage-blocked browsers (private windows with cookies/site-data blocked —
  // localStorage ACCESS throws there) can never remember a visit, so every
  // session is a first visit: show the intro rather than silently skipping it.
  const [introFreePlay, setIntroFreePlay] = useState(() => {
    try { return !localStorage.getItem('qcOnboardSeen'); } catch (_) { return true; }
  });
  // Which intro dialogue card is showing (null = none).
  const [introStage, setIntroStage] = useState(() => (introFreePlay ? 'welcome' : null));
  // While true, Black's replies come from INTRO_SCRIPT and useLocalAi stays
  // quiet; flips false after the castle (or if the script is invalidated).
  const [introScriptOn, setIntroScriptOn] = useState(false);
  const [introScriptStep, setIntroScriptStep] = useState(0);
  // Guards the reply timer against stale duplicate firings: records the last
  // script step that actually executed.
  const introScriptDoneRef = useRef(-1);
  // The whole choreography (guided White moves included) lives under this
  // flag; unlike introFreePlay it survives the game starting, and dies on an
  // explicit new game, a restored sign-in, or a derailed script.
  const [introChoreo, setIntroChoreo] = useState(() => {
    try { return !localStorage.getItem('qcOnboardSeen'); } catch (_) { return true; }
  });
  // Guided White moves already played (INTRO_GUIDE index).
  const [introGuideStep, setIntroGuideStep] = useState(0);
  // Off-script attempt during a guided turn: a shaking toast over the board.
  // The counter keys the element so repeat offenses replay the animation.
  const [introNudge, setIntroNudge] = useState(null); // { text, n }
  useEffect(() => {
    if (!introNudge) return;
    const timer = setTimeout(() => setIntroNudge(null), 2600);
    return () => clearTimeout(timer);
  }, [introNudge]);
  const introSpeech = introStage ? INTRO_DIALOGUE[introStage] || null : null;

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
    setIntroScriptOn(false);
    setIntroStage(null);
    setIntroChoreo(false);
  }, []);

  useEffect(() => {
    if (introFreePlay && gameStarted) {
      setIntroFreePlay(false);
      dismissOnboarding();
      // The invitation did its job; the next card arrives with Black's reply.
      setIntroStage((s) => (s === 'welcome' ? null : s));
    }
  }, [introFreePlay, gameStarted, dismissOnboarding]);

  // The intro is for anonymous first-timers only: a signed-in session that
  // restores before any game starts gets the normal home instead.
  useEffect(() => {
    if (auth.user && !gameStarted) {
      setIntroFreePlay(false);
      retireIntro();
    }
  }, [auth.user, gameStarted, retireIntro]);

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
    for (const [from, to] of g.candidates) {
      const piece = getPieceAtSquare(from);
      if (piece && piece.side === 'white' && getLegalMoves(piece.id).includes(to)) {
        return { from, to, stage: g.stage };
      }
    }
    return null;
  }, [introChoreo, gameOver, sideToMove, introGuideStep, getPieceAtSquare, getLegalMoves]);

  // The choreography is all-or-nothing: it retires explicitly — last guided
  // move played, game somehow over, or no candidate playable on a guided
  // turn — and only then do the engine and free movement take over. No
  // silent drift between scripted and unscripted play.
  useEffect(() => {
    if (!introChoreo) return;
    if (introGuideStep >= INTRO_GUIDE.length || gameOver) {
      setIntroChoreo(false);
      return;
    }
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
    if (introGuide && introGuide.stage) setIntroStage(introGuide.stage);
  }, [introGuide]);

  // Plays Black's scripted intro opening, one reply per Black turn, a beat
  // after the visitor's move so it reads as a decision rather than a reflex.
  useEffect(() => {
    if (!introScriptOn || !gameStarted || gameOver) return;
    if (sideToMove !== 'black') return;
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
  }, [introScriptOn, introScriptStep, gameStarted, gameOver, sideToMove, getPieceAtSquare, getLegalMoves, movePiece, canCastleBetween, castlePieces, dispatch]);

  // The closing card lingers, then bows out on its own.
  useEffect(() => {
    if (introStage !== 'guide6') return;
    const timer = setTimeout(() => setIntroStage(null), 12000);
    return () => clearTimeout(timer);
  }, [introStage]);

  return {
    introFreePlay,
    introSpeech,
    introGuide,
    introNudge,
    introScriptOn,
    introChoreo,
    ensureIntroGame,
    retireIntro,
    nudgeOffScript,
    onGuidedMovePlayed,
  };
}
