// frontend/src/hooks/useChessClock.js
// Purpose: Provide a reusable offline chess clock hook that parses time control, tracks remaining time per side, applies increments after moves, and exposes formatted clock strings and active flags. Not used for online games.
// Imports From: ./clockUtils.js
// Exported To: ../App.jsx

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseTimeControlString, clampMs, formatClock } from './clockUtils.js';

export default function useChessClock({ timeControl = '5+5', sideToMove = 'white', isLive = true, moves = [], gameInstanceId = 0 }) {
  const { baseMinutes, incrementSeconds } = useMemo(() => parseTimeControlString(timeControl), [timeControl]);
  const startMs = useMemo(() => clampMs(baseMinutes * 60 * 1000), [baseMinutes]);
  const incMs = useMemo(() => clampMs(incrementSeconds * 1000), [incrementSeconds]);

  const [whiteMs, setWhiteMs] = useState(startMs);
  const [blackMs, setBlackMs] = useState(startMs);

  // Track which move increments have been applied
  const lastAppliedMoveCountRef = useRef(0);
  const lastTickTsRef = useRef(null);

  // Reset on game instance or time control changes
  useEffect(() => {
    setWhiteMs(startMs);
    setBlackMs(startMs);
    lastAppliedMoveCountRef.current = 0;
    lastTickTsRef.current = null;
  }, [startMs, gameInstanceId]);

  // Apply increment after each move to the side that moved
  useEffect(() => {
    const prevCount = lastAppliedMoveCountRef.current;
    const currCount = Array.isArray(moves) ? moves.length : 0;
    if (currCount > prevCount && currCount > 0) {
      const last = moves[currCount - 1];
      const mover = last && (last.side === 'white' || last.side === 'black') ? last.side : null;
      if (mover && incMs > 0) {
        if (mover === 'white') setWhiteMs((t) => clampMs(t + incMs));
        if (mover === 'black') setBlackMs((t) => clampMs(t + incMs));
      }
      lastAppliedMoveCountRef.current = currCount;
    } else if (currCount < prevCount) {
      // Moves cleared (new game or rewind), reset tracking
      lastAppliedMoveCountRef.current = currCount;
    }
  }, [moves, incMs]);

  const activeSide = sideToMove === 'white' || sideToMove === 'black' ? sideToMove : 'white';
  const activeIsWhite = activeSide === 'white';
  const whiteActive = isLive && activeIsWhite && whiteMs > 0 && blackMs > 0;
  const blackActive = isLive && !activeIsWhite && whiteMs > 0 && blackMs > 0;

  // Ticking interval
  useEffect(() => {
    if (!isLive) {
      lastTickTsRef.current = null;
      return undefined;
    }
    if ((activeIsWhite && whiteMs <= 0) || (!activeIsWhite && blackMs <= 0)) {
      return undefined;
    }

    lastTickTsRef.current = performance.now();

    const lowTime = (activeIsWhite ? whiteMs : blackMs) < 20000;
    const intervalMs = lowTime ? 100 : 250;

    const id = setInterval(() => {
      const now = performance.now();
      const last = lastTickTsRef.current || now;
      const delta = now - last;
      lastTickTsRef.current = now;

      if (activeIsWhite) {
        setWhiteMs((t) => clampMs(t - delta));
      } else {
        setBlackMs((t) => clampMs(t - delta));
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [isLive, activeIsWhite, whiteMs, blackMs]);

  const whiteText = useMemo(() => formatClock(whiteMs), [whiteMs]);
  const blackText = useMemo(() => formatClock(blackMs), [blackMs]);
  const whiteLow = whiteMs <= 10000;
  const blackLow = blackMs <= 10000;

  return {
    whiteMs,
    blackMs,
    whiteText,
    blackText,
    whiteActive,
    blackActive,
    whiteLow,
    blackLow,
  };
}
