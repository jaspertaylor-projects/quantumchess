// frontend/src/ai/useLocalAi.js
// Purpose: React hook that drives a local AI opponent using a Web Worker, ensuring UI remains responsive. Enforces 1s minimum and 8s maximum think time.
// Imports From: ./aiWorker.js
// Exported To: ../App.jsx

import { useEffect, useRef } from 'react';

const MIN_THINK_MS = 1000;
const MAX_THINK_MS = 8000;

export default function useLocalAi({ enabled, aiSide, difficulty, pieces, sideToMove, canMakeMove, gameOver, onApplyMove }) {
  const thinkingRef = useRef(false);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const maxTimerRef = useRef(null);
  const applyTimerRef = useRef(null);
  const startTimeRef = useRef(0);
  const baselineRef = useRef(null);
  const bestRef = useRef(null);
  const appliedRef = useRef(false);

  // Live refs for guards at apply-time
  const enabledRef = useRef(enabled);
  const aiSideRef = useRef(aiSide);
  const sideToMoveRef = useRef(sideToMove);
  const canMakeMoveRef = useRef(canMakeMove);
  const gameOverRef = useRef(gameOver);
  const onApplyMoveRef = useRef(onApplyMove);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { aiSideRef.current = aiSide; }, [aiSide]);
  useEffect(() => { sideToMoveRef.current = sideToMove; }, [sideToMove]);
  useEffect(() => { canMakeMoveRef.current = canMakeMove; }, [canMakeMove]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);
  useEffect(() => { onApplyMoveRef.current = onApplyMove; }, [onApplyMove]);

  useEffect(() => {
    if (!enabled) return;
    if (gameOver) return;
    if (!canMakeMove) return;
    if (sideToMove !== aiSide) return;
    if (thinkingRef.current) return;

    thinkingRef.current = true;
    appliedRef.current = false;
    baselineRef.current = null;
    bestRef.current = null;

    const id = (requestIdRef.current = (requestIdRef.current || 0) + 1);
    startTimeRef.current = performance.now();

    const worker = new Worker(new URL('./aiWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    const cleanup = () => {
      try { if (workerRef.current) workerRef.current.terminate(); } catch (_) {}
      workerRef.current = null;
      if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
      if (applyTimerRef.current) { clearTimeout(applyTimerRef.current); applyTimerRef.current = null; }
      thinkingRef.current = false;
    };

    const safeApply = (mv) => {
      if (appliedRef.current) return;
      appliedRef.current = true;

      // Guard: ensure state still expects AI to move
      if (!enabledRef.current) { cleanup(); return; }
      if (gameOverRef.current) { cleanup(); return; }
      if (sideToMoveRef.current !== aiSideRef.current) { cleanup(); return; }
      if (!canMakeMoveRef.current) { cleanup(); return; }

      try {
        if (mv && typeof onApplyMoveRef.current === 'function') {
          onApplyMoveRef.current(mv, aiSideRef.current);
        }
      } catch (_) {
        // swallow
      } finally {
        cleanup();
      }
    };

    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.id !== id) return;

      if (msg.type === 'baseline') {
        baselineRef.current = msg.move || null;
        return;
      }

      if (msg.type === 'best') {
        bestRef.current = msg.move || null;
        if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }

        const elapsed = performance.now() - startTimeRef.current;
        const wait = Math.max(0, MIN_THINK_MS - elapsed);
        if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
        applyTimerRef.current = setTimeout(() => {
          const chosen = bestRef.current || baselineRef.current || null;
          safeApply(chosen);
        }, wait);
        return;
      }

      if (msg.type === 'error') {
        // On error, fall back to baseline at the max timeout.
        return;
      }
    };

    worker.postMessage({
      type: 'think',
      id,
      payload: { pieces, sideToMove: aiSide, difficulty },
    });

    maxTimerRef.current = setTimeout(() => {
      // Hard cap reached: prefer best; otherwise use baseline.
      try { if (workerRef.current) workerRef.current.terminate(); } catch (_) {}
      workerRef.current = null;
      const chosen = bestRef.current || baselineRef.current || null;
      safeApply(chosen);
    }, MAX_THINK_MS);

    return () => {
      try { if (workerRef.current) workerRef.current.terminate(); } catch (_) {}
      workerRef.current = null;
      if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
      if (applyTimerRef.current) { clearTimeout(applyTimerRef.current); applyTimerRef.current = null; }
      thinkingRef.current = false;
    };
  }, [enabled, aiSide, difficulty, pieces, sideToMove, canMakeMove, gameOver, onApplyMove]);
}
