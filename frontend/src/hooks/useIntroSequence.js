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

// Black's scripted opening for the intro game — every beat of the zap/heal
// rules on cue, verified move-by-move against the real engine:
//   B1 Nf6 zaps e4 (queen bleeds out) · B2 Nc6 claims both knights (census)
//   · B3 b5 zaps the c4 bishop-queen down to a bishop · B4 xc4 captures it
//   (least-valuable capture) · B5 d5 heals the capturer PAST the claimed
//   knights (pawn-bishop overflow) and zaps e4 to a bare pawn.
// Each step tries its candidates in order against the live position (the
// visitor's play can block them); if none is legal the script yields to the
// real engine. `delay` gives the visitor time to read the payoff card their
// own move just earned.
const INTRO_SCRIPT = [
  { moves: [['g8', 'f6'], ['g8', 'h6']], stage: 'reply1', delay: 1100 },
  { moves: [['b8', 'c6'], ['b8', 'a6']], stage: 'reply2', delay: 4500 },
  { moves: [['b7', 'b5']], stage: 'reply3', delay: 4500 },
  { moves: [['b5', 'c4']], stage: 'reply4', delay: 4500 },
  { moves: [['d7', 'd5']], stage: 'reply5', delay: 4500 },
];

// White's choreographed moves: entry i is offered once Black has made i
// scripted replies — the piece glows, the destination lights up, and other
// moves are gently refused. The line walks the visitor through their own
// side of the rules: heal by protecting (Nc3), zap with the cheapest self
// (Bc4), give a possibility back to the census (Nh3), quantum-castle, and
// finally recapture.
const INTRO_GUIDE = [
  { candidates: [['e2', 'e4']], stage: null },
  { candidates: [['b1', 'c3']], stage: 'guide1' },
  { candidates: [['f1', 'c4']], stage: 'guide2' },
  { candidates: [['g1', 'h3']], stage: 'guide3' },
  { castles: [['e1', 'h1']], stage: 'guide4' },
  { candidates: [['e4', 'd5']], stage: 'guide6' },
];

// Spoken in the top player bar's speech bubble (welcome by the Stranger,
// the rest by the intro bot), so keep each line bubble-sized.
const INTRO_DIALOGUE = {
  welcome: 'Every piece is every piece — until it moves. Slide the glowing pawn to the lit square.',
  reply1: 'A leap only a knight makes. Its touch ZAPS your pawn — the queen it might have been is gone.',
  guide1: 'Your knight lands touching e4 — friends you touch HEAL. It just grew knight back.',
  reply2: 'Both my knights are claimed now — no other piece of mine can be one. The census keeps count.',
  guide2: 'You touch as the cheapest thing you still might be — a bishop here. Its ray zapped f7: never their king now.',
  reply3: 'My pawn brushes your bishop-queen — and the queen bleeds out of it. Zaps take the best self first.',
  guide3: 'Your second knight is claimed, so e4 handed its knight back. The census runs both ways.',
  reply4: 'Captured — a taken piece resolves as the LEAST it could be. Strip a piece down before you take it.',
  guide4: 'A quantum castle: two pieces, each maybe king, maybe rook. Strip ALL my maybe-kings and I collapse.',
  reply5: 'My knights are spoken for — so my heal overflowed: that pawn is a pawn-BISHOP now. And your e4? Just a pawn.',
  guide6: 'Taken back. Zap every maybe-king to win by wave function collapse — or corner a revealed king the old way. The board is yours.',
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
    for (const [from, to] of g.candidates || []) {
      const piece = getPieceAtSquare(from);
      if (piece && piece.side === 'white' && getLegalMoves(piece.id).includes(to)) {
        return { from, to, stage: g.stage };
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
  }, [introChoreo, gameOver, sideToMove, introGuideStep, getPieceAtSquare, getLegalMoves, canCastleBetween]);

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
