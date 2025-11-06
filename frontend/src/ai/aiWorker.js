// frontend/src/ai/aiWorker.js
// Purpose: Web Worker that performs AI computations off the main thread. Emits a safer baseline that avoids losing captures via SEE, then computes the alpha-beta best move and returns it.
// Imports From: ./alphaBetaEngine.js, ../chessboard/quantumEngine.js
// Exported To: ./useLocalAi.js

import pickBestMove, { seeNetForLandingSquare } from './alphaBetaEngine.js';
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

function isSeeSafeCapture(rootPieces, sideToMove, mv) {
  if (!mv || mv.type !== 'move') return false;
  const net = seeNetForLandingSquare(mv.resultPieces, sideToMove, mv.to);
  return net >= 0; // safe if SEE net is non-negative
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

    // Emit a safer baseline move quickly. Prefer SEE-safe captures; else prefer non-captures; else fallback.
    try {
      const legal = generateLegalReplies(root, sideToMove, 0);
      if (Array.isArray(legal) && legal.length > 0) {
        const capturing = legal.filter((mv) => isCapture(root, mv));
        const nonCaptures = legal.filter((mv) => !isCapture(root, mv));

        const safeCaptures = capturing.filter((mv) => isSeeSafeCapture(root, sideToMove, mv));

        let baselineMove = null;
        if (safeCaptures.length > 0) {
          // Prefer among safe captures; small randomization
          baselineMove = randomChoice(safeCaptures);
        } else if (nonCaptures.length > 0) {
          // No safe capture: choose a quiet move baseline
          baselineMove = randomChoice(nonCaptures);
        } else {
          // Last resort: choose any capture (likely losing), but still randomize
          baselineMove = randomChoice(capturing);
        }

        const baseline = minifyMove(baselineMove);
        if (DEBUG_WORKER) {
          try {
            // eslint-disable-next-line no-console
            console.debug('[AI-Worker][baseline]', {
              id,
              side: sideToMove,
              legalCount: legal.length,
              captures: capturing.length,
              safeCaptures: safeCaptures.length,
              nonCaptures: nonCaptures.length,
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
