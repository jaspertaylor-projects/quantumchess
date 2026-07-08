// frontend/src/ai/aiWorker.js
// Purpose: Web Worker shell around the quantum AI engine. Posts an instant
// depth-1 baseline, then runs iterative-deepening search within the
// difficulty's time budget and posts progressively better results.
// Imports From: ./alphaBetaEngine.js, ../devlog.js
// Exported To: ./useLocalAi.js

import { searchBestMove } from './alphaBetaEngine.js';
import { getBotById } from './bots.js';
import { devDebug } from '../devlog.js';

function minifyMove(mv) {
  if (!mv || typeof mv !== 'object') return null;
  if (mv.type === 'move') return { type: 'move', from: mv.from, to: mv.to };
  if (mv.type === 'enpassant') return { type: 'enpassant', from: mv.from, to: mv.to };
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

  const { pieces, sideToMove, difficulty, botId, lastMove } = payload;
  const bot = botId ? getBotById(botId) : null;

  try {
    let baselineSent = false;
    const result = searchBestMove({
      pieces: pieces || [],
      sideToMove,
      difficulty: (bot && bot.tier) || difficulty,
      bot,
      lastMove: lastMove || null,
      onDepthComplete: (partial) => {
        if (!baselineSent) {
          baselineSent = true;
          self.postMessage({ type: 'baseline', id, move: minifyMove(partial.move), score: partial.score, depth: partial.depth });
        }
      },
    });

    try {
      devDebug('[AI]', {
        side: sideToMove,
        bot: bot ? bot.name : null,
        difficulty: (bot && bot.tier) || difficulty,
        depth: result.depth,
        nodes: result.nodes,
        score: Number((result.score || 0).toFixed(2)),
        move: minifyMove(result.move),
      });
    } catch (_) {}

    self.postMessage({ type: 'best', id, move: minifyMove(result.move), score: result.score, depth: result.depth });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: (err && err.message) || 'Worker error' });
  }
});
