// frontend/src/sayings/usePlayerSayings.js
// Purpose: Transient speech bubbles on the player bars. Bots speak their
// authored lines; the signed-in player speaks their profile picks; the local
// Stranger and anonymous players use the defaults. Online opponents stay
// silent (the relay carries no profile data). Extracted from App.jsx.
// Imports From: ./sayingsCatalog.js
// Exported To: ../App.jsx

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveSaying, loadLocalSayings, saveLocalSayings } from './sayingsCatalog.js';

export default function usePlayerSayings({
  pieces,
  gameOver,
  winner,
  gameInstanceId,
  botSide,
  aiBot,
  isOnlineBars,
  userTeam,
  auth,
  capturedCounts, // { white, black } — captured-piece totals per victim side
}) {
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
    const counts = capturedCounts;
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
  }, [capturedCounts, gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [pieces, gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [gameOver, winner]); // eslint-disable-line react-hooks/exhaustive-deps

  return { speech, localSayings, handleSaveLocalSayings };
}
