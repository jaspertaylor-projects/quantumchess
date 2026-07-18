// frontend/src/ai/useLocalAi.js
// Purpose: React hook that drives a local AI opponent using a Web Worker,
// ensuring the UI remains responsive while respecting profile-specific
// search budgets and retaining the deepest completed result on timeout.
// Imports From: ./aiWorker.js
// Exported To: ../App.jsx

import { useEffect, useRef, useState } from 'react';
import { getBotById } from './bots.js';
import { aiWorkerHardCapMs } from './aiTiming.js';

// Minimum wall-clock delay before a bot's move lands — never under 2 seconds
// at any difficulty, so instant replies (random openers, forced recaptures,
// simple endgames) don't overwhelm the player. Weaker bots pause a beat
// longer still.
const MIN_THINK_MS_BY_DIFFICULTY = { easy: 2600, medium: 2200, hard: 2000 };
const MIN_THINK_FLOOR_MS = 2000;
export default function useLocalAi({ enabled, aiSide, difficulty, botId = null, pieces, sideToMove, canMakeMove, gameOver, lastMove = null, repetitionSigs = null, onApplyMove }) {
  const [thinkingStatus, setThinkingStatus] = useState({ active: false, maxMs: 0 });
  const thinkingRef = useRef(false);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const maxTimerRef = useRef(null);
  const applyTimerRef = useRef(null);
  const startTimeRef = useRef(0);
  const baselineRef = useRef(null);
  const bestRef = useRef(null);
  const bestDepthRef = useRef(0);
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

    const bot = botId ? getBotById(botId) : null;
    const hardCapMs = aiWorkerHardCapMs(difficulty, bot);

    thinkingRef.current = true;
    setThinkingStatus({ active: true, maxMs: hardCapMs });
    appliedRef.current = false;
    baselineRef.current = null;
    bestRef.current = null;
    bestDepthRef.current = 0;

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
      setThinkingStatus((status) => ({ ...status, active: false }));
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
        bestDepthRef.current = Math.max(bestDepthRef.current, Number(msg.depth) || 1);
        return;
      }

      // Preserve every fully completed iteration. If the UI watchdog ever
      // has to terminate the worker, it now uses the deepest result received
      // instead of falling all the way back to the one-ply baseline.
      if (msg.type === 'progress') {
        const depth = Number(msg.depth) || 0;
        if (msg.move && depth >= bestDepthRef.current) {
          bestRef.current = msg.move;
          bestDepthRef.current = depth;
        }
        return;
      }

      if (msg.type === 'best') {
        bestRef.current = msg.move || null;
        bestDepthRef.current = Math.max(bestDepthRef.current, Number(msg.depth) || 0);
        if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }

        const elapsed = performance.now() - startTimeRef.current;
        const minThink = MIN_THINK_MS_BY_DIFFICULTY[difficulty] || MIN_THINK_FLOOR_MS;
        const wait = Math.max(0, minThink - elapsed);
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
      payload: { pieces, sideToMove: aiSide, difficulty, botId, lastMove, repetitionSigs },
    });

    // Bot profiles can exceed their tier's default budget (Ernest uses 15s).
    // Keep the outer watchdog beyond that engine deadline plus worker startup
    // and message-delivery grace; matching the two deadlines caused the
    // worker to be killed before its deep result arrived.
    maxTimerRef.current = setTimeout(() => {
      // Hard cap reached: prefer best; otherwise use baseline.
      try { if (workerRef.current) workerRef.current.terminate(); } catch (_) {}
      workerRef.current = null;
      const chosen = bestRef.current || baselineRef.current || null;
      safeApply(chosen);
    }, hardCapMs);

    return () => {
      try { if (workerRef.current) workerRef.current.terminate(); } catch (_) {}
      workerRef.current = null;
      if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
      if (applyTimerRef.current) { clearTimeout(applyTimerRef.current); applyTimerRef.current = null; }
      thinkingRef.current = false;
      setThinkingStatus((status) => ({ ...status, active: false }));
    };
  }, [enabled, aiSide, difficulty, botId, pieces, sideToMove, canMakeMove, gameOver, lastMove, onApplyMove]);

  return thinkingStatus;
}
