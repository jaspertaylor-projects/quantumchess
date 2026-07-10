// frontend/src/hooks/useEffectiveClock.js
// Purpose: The clock the player bars actually display — the server's
// authoritative clock for online games, the local useChessClock otherwise.
// Extracted from App.jsx.
// Imports From: ./useChessClock.js, ./clockUtils.js
// Exported To: ../App.jsx

import { useMemo } from 'react';
import useChessClock from './useChessClock.js';
import { formatClock, clampMs } from './clockUtils.js';

export default function useEffectiveClock({
  isOnlineGameRef,
  serverClock,
  timeControl,
  sideToMove,
  moves,
  gameInstanceId,
  gameStarted,
  externalGameOver,
}) {
  const localClock = useChessClock({
    timeControl,
    sideToMove,
    isLive: false, // offline games are untimed
    moves,
    gameInstanceId,
  });

  return useMemo(() => {
    if (isOnlineGameRef.current) {
      const w = clampMs(serverClock.whiteMs || 0);
      const b = clampMs(serverClock.blackMs || 0);
      const active = serverClock.active === 'white' || serverClock.active === 'black' ? serverClock.active : 'none';
      return {
        whiteMs: w,
        blackMs: b,
        whiteText: formatClock(w),
        blackText: formatClock(b),
        whiteActive: gameStarted && !externalGameOver.over && active === 'white' && w > 0 && b > 0,
        blackActive: gameStarted && !externalGameOver.over && active === 'black' && w > 0 && b > 0,
        whiteLow: w <= 10000,
        blackLow: b <= 10000,
      };
    }
    return localClock;
  }, [serverClock, localClock, gameStarted, externalGameOver]); // eslint-disable-line react-hooks/exhaustive-deps
}
