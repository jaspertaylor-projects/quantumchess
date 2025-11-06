// frontend/src/ai/aiWorker.js
// Purpose: Web Worker that performs AI computations off the main thread. Quickly emits a baseline legal move, then computes the alpha-beta best move and returns it. Adds slight randomness to baseline to avoid deterministic play.
// Imports From: ./alphaBetaEngine.js, ../chessboard/quantumEngine.js
// Exported To: ./useLocalAi.js

import pickBestMove from './alphaBetaEngine.js';
import { clonePieces, generateLegalReplies } from '../chessboard/quantumEngine.js';

function minifyMove(mv) {
  if (!mv || typeof mv !== 'object') return null;
  if (mv.type === 'move') return { type: 'move', from: mv.from, to: mv.to };
  if (mv.type === 'castle') return { type: 'castle', plan: mv.plan };
  return null;
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

    // Emit a quick baseline move to guarantee we always have something within the max think time.
    try {
      const legal = generateLegalReplies(root, sideToMove, 0);
      if (Array.isArray(legal) && legal.length > 0) {
        let idx = 0;
        if (difficulty === 'easy') {
          idx = Math.floor(Math.random() * legal.length);
        } else {
          const topK = Math.min(3, legal.length);
          idx = Math.floor(Math.random() * topK);
        }
        const baseline = minifyMove(legal[idx]);
        self.postMessage({ type: 'baseline', id, move: baseline });
      } else {
        self.postMessage({ type: 'baseline', id, move: null });
      }
    } catch (baselineErr) {
      self.postMessage({ type: 'baseline', id, move: null });
    }

    // Compute the alpha-beta best move.
    const best = pickBestMove({ pieces: root, sideToMove, difficulty });
    const bestMin = minifyMove(best);
    self.postMessage({ type: 'best', id, move: bestMin });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: (err && err.message) || 'Worker error' });
  }
});
