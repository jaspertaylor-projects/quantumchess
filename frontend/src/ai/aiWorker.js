// frontend/src/ai/aiWorker.js
// Purpose: Web Worker that performs AI computations off the main thread. Quickly emits a smarter unbiased baseline (prefer captures if any), then computes the alpha-beta best move and returns it. Adds logging for debugging.
// Imports From: ./alphaBetaEngine.js, ../chessboard/quantumEngine.js
// Exported To: ./useLocalAi.js

import pickBestMove from './alphaBetaEngine.js';
import { clonePieces, generateLegalReplies } from '../chessboard/quantumEngine.js';

const DEBUG_WORKER = true;

function minifyMove(mv) {
  if (!mv || typeof mv !== 'object') return null;
  if (mv.type === 'move') return { type: 'move', from: mv.from, to: mv.to };
  if (mv.type === 'castle') return { type: 'castle', plan: mv.plan };
  return null;
}

function countCaptured(pieces) {
  let c = 0;
  for (const p of pieces) if (p.captured) c += 1;
  return c;
}

function isCapture(rootPieces, reply) {
  if (!reply || !reply.resultPieces) return false;
  return countCaptured(reply.resultPieces) > countCaptured(rootPieces);
}

function randomChoice(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

self.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.type !== 'think') return;

  const { id, payload } = data;
  if (!payload) {
    self.postMessage({ type: 'error', id, message: 'Missing payload' });
    return;
  }

  const { pieces, sideToMove, difficulty } = payload;

  try {
    const root = clonePieces(pieces || []);

    // Emit an unbiased baseline move quickly. Prefer any capture; else random among all legal.
    try {
      const legal = generateLegalReplies(root, sideToMove, 0);
      if (Array.isArray(legal) && legal.length > 0) {
        const captures = legal.filter((mv) => isCapture(root, mv));
        const pool = captures.length > 0 ? captures : legal;
        const baselineMove = randomChoice(pool);
        const baseline = minifyMove(baselineMove);
        if (DEBUG_WORKER) {
          try {
            // eslint-disable-next-line no-console
            console.debug('[AI-Worker][baseline]', {
              id,
              side: sideToMove,
              legalCount: legal.length,
              captures: captures.length,
              chosen: baseline,
            });
          } catch (_) {}
        }
        self.postMessage({ type: 'baseline', id, move: baseline });
      } else {
        self.postMessage({ type: 'baseline', id, move: null });
      }
    } catch (baselineErr) {
      if (DEBUG_WORKER) {
        try { console.error('[AI-Worker][baseline-error]', baselineErr); } catch (_) {}
      }
      self.postMessage({ type: 'baseline', id, move: null });
    }

    // Compute the alpha-beta best move.
    const best = pickBestMove({ pieces: root, sideToMove, difficulty });
    const bestMin = minifyMove(best);
    if (DEBUG_WORKER) {
      try {
        // eslint-disable-next-line no-console
        console.debug('[AI-Worker][best]', { id, side: sideToMove, best: bestMin });
      } catch (_) {}
    }
    self.postMessage({ type: 'best', id, move: bestMin });
  } catch (err) {
    if (DEBUG_WORKER) {
      try { console.error('[AI-Worker][error]', err); } catch (_) {}
    }
    self.postMessage({ type: 'error', id, message: (err && err.message) || 'Worker error' });
  }
});
