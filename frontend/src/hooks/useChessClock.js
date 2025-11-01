// frontend/src/hooks/useChessClock.js
// Purpose: Provide a reusable chess clock hook that parses time control, tracks remaining time per side, applies increments after moves, and exposes formatted clock strings and active flags.
// Imports From: None
// Exported To: ../App.jsx

import { useEffect, useMemo, useRef, useState } from 'react';

function parseTimeControlString(tc) {
  if (typeof tc !== 'string') return { baseMinutes: 5, incrementSeconds: 0 };
  const cleaned = tc.replace(/\s+/g, '');
  const m = cleaned.match(/^(\d+)([+:|](\d+))?$/);
  if (!m) return { baseMinutes: 5, incrementSeconds: 0 };
  const base = parseInt(m[1], 10);
  const inc = m[3] ? parseInt(m[3], 10) : 0;
  const baseMinutes = Number.isFinite(base) ? Math.max(0, base) : 5;
  const incrementSeconds = Number.isFinite(inc) ? Math.max(0, inc) : 0;
  return { baseMinutes, incrementSeconds };
}

function clampMs(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.floor(x));
}

function formatClock(ms) {
  const clamped = clampMs(ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const under20s = clamped < 20000;
  if (under20s) {
    const tenths = Math.floor((clamped % 1000) / 100);
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
    const ss = String(seconds).padStart(2, '0');
    if (hours > 0) {
      return `${hours}:${mm}:${ss}.${tenths}`;
    }
    return `${mm}:${ss}.${tenths}`;
  }

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
    }
  return `${mm}:${ss}`;
}

export default function useChessClock({ timeControl = '5+0', sideToMove = 'white', isLive = true, moves = [], gameInstanceId = 0 }) {
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
