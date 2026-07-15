// frontend/src/ai/aiWorker.js
// Purpose: Web Worker shell around the quantum AI engine. Posts an instant
// depth-1 baseline, then runs iterative-deepening search within the
// difficulty's time budget and posts progressively better results.
// Imports From: ./alphaBetaEngine.js, ../devlog.js
// Exported To: ./useLocalAi.js

import { searchBestMove as refSearchBestMove, analyzeRootMoves as refAnalyzeRootMoves } from './alphaBetaEngine.js';
import { searchBestMoveFast, analyzeRootMovesFast } from './fast/fastSearch.js';
import { searchBestMoveV2 } from './fast/fastSearch2.js';
import { getBotById } from './bots.js';
import { devDebug } from '../devlog.js';

// The packed/journaled engine is a verified drop-in for the reference search
// (tests/fastEngineDiff.test.js pins move/score/node equality). Flip this off
// to fall back to the reference implementation.
const USE_FAST_ENGINE = true;
const searchBestMove = USE_FAST_ENGINE ? searchBestMoveFast : refSearchBestMove;
const analyzeRootMoves = USE_FAST_ENGINE ? analyzeRootMovesFast : refAnalyzeRootMoves;

// Bot play ('think') uses the V2 engine (TT + PVS + quiescence + adaptive
// beams) for medium/hard tiers: bot-vs-bot matches put V2 ahead from ~1s
// budgets upward (+89 Elo at 1s), which is where those tiers live. Easy
// stays on V1 — at sub-second budgets V1 is stronger AND easy must stay
// beatable. Analyze/bestMove/bestScore stay on V1: the miner certified its
// puzzles with that exact ruler.
const USE_V2_FOR_BOTS = true;
function thinkEngine(tier) {
  return USE_V2_FOR_BOTS && tier !== 'easy' ? searchBestMoveV2 : searchBestMove;
}

function minifyMove(mv) {
  if (!mv || typeof mv !== 'object') return null;
  if (mv.type === 'move') return { type: 'move', from: mv.from, to: mv.to };
  if (mv.type === 'enpassant') return { type: 'enpassant', from: mv.from, to: mv.to };
  if (mv.type === 'castle') return { type: 'castle', plan: mv.plan };
  return null;
}

self.addEventListener('message', (e) => {
  const data = e.data || {};

  // Score EVERY legal root move at fixed depth (mined-puzzle gauge: the
  // ticks/needle must measure with the same ruler the miner certified with,
  // not a shallow approximation). Returns moves normalized to
  // { from, to, enPassant, castle, score } — score from the mover's side.
  if (data.type === 'analyze') {
    const { id, payload } = data;
    try {
      const runAnalyze = payload && payload.engine === 'fast'
        ? analyzeRootMovesFast
        : analyzeRootMoves;
      const res = runAnalyze({
        pieces: (payload && payload.pieces) || [],
        sideToMove: (payload && payload.sideToMove) || 'white',
        lastMove: (payload && payload.lastMove) || null,
        depth: (payload && payload.depth) || 3,
        widths: (payload && payload.widths) || [64, 14, 10, 8],
        timeMs: (payload && payload.timeMs) || 20000,
      });
      self.postMessage({
        type: 'analysis',
        id,
        moves: res ? res.moves.map((s) => ({
          from: s.move.type === 'castle' ? s.move.plan.piece1_from : s.move.from,
          to: s.move.type === 'castle' ? s.move.plan.piece1_to : s.move.to,
          enPassant: Boolean(s.move.enPassant) || s.move.type === 'enpassant',
          castle: s.move.type === 'castle',
          score: s.score,
        })) : null,
      });
    } catch (err) {
      self.postMessage({ type: 'error', id, message: (err && err.message) || 'Worker error' });
    }
    return;
  }

  // Best-move score only (eval graphs, balance probes): searchBestMove's
  // root-wide alpha pruning makes this several times cheaper than analyze's
  // score-every-move at the same full root width. Returns the reached depth
  // so callers can treat an under-depth result as a timeout.
  if (data.type === 'bestScore') {
    const { id, payload } = data;
    try {
      const runSearch = payload && payload.engine === 'fast'
        ? searchBestMoveFast
        : searchBestMove;
      const res = runSearch({
        pieces: (payload && payload.pieces) || [],
        sideToMove: (payload && payload.sideToMove) || 'white',
        lastMove: (payload && payload.lastMove) || null,
        preferredMove: (payload && payload.preferredMove) || null,
        openingVariety: false,
        adaptiveDepth: false,
        bot: {
          search: {
            maxDepth: (payload && payload.depth) || 3,
            widths: (payload && payload.widths) || [176, 12, 8],
            timeMs: (payload && payload.timeMs) || 20000,
            noise: 0,
          },
        },
      });
      self.postMessage({ type: 'bestScore', id, score: res ? res.score : null, depth: res ? res.depth : 0 });
    } catch (err) {
      self.postMessage({ type: 'error', id, message: (err && err.message) || 'Worker error' });
    }
    return;
  }

  // Iterative-deepening best move with caller-provided search limits. The
  // mined puzzle uses this for its live reply: unlike analyzeRootMoves, a
  // timeout preserves the strongest fully completed depth instead of
  // discarding the whole search.
  if (data.type === 'bestMove') {
    const { id, payload } = data;
    try {
      const runSearch = payload && payload.engine === 'fast'
        ? searchBestMoveFast
        : searchBestMove;
      const res = runSearch({
        pieces: (payload && payload.pieces) || [],
        sideToMove: (payload && payload.sideToMove) || 'white',
        lastMove: (payload && payload.lastMove) || null,
        openingVariety: false,
        adaptiveDepth: false,
        preferredMove: (payload && payload.preferredMove) || null,
        onDepthComplete: (partial) => {
          self.postMessage({
            type: 'bestMoveProgress',
            id,
            move: minifyMove(partial.move),
            score: partial.score,
            depth: partial.depth,
          });
        },
        bot: {
          search: {
            maxDepth: (payload && payload.depth) || 3,
            widths: (payload && payload.widths) || [176, 12, 8],
            timeMs: (payload && payload.timeMs) || 20000,
            timeMode: (payload && payload.timeMode) || 'capped',
            noise: 0,
          },
        },
      });
      self.postMessage({
        type: 'bestMove',
        id,
        move: res ? minifyMove(res.move) : null,
        score: res ? res.score : null,
        depth: res ? res.depth : 0,
        nodes: res ? res.nodes : 0,
      });
    } catch (err) {
      self.postMessage({ type: 'error', id, message: (err && err.message) || 'Worker error' });
    }
    return;
  }

  if (data.type !== 'think') return;

  const { id, payload } = data;
  if (!payload) {
    self.postMessage({ type: 'error', id, message: 'Missing payload' });
    return;
  }

  const { pieces, sideToMove, difficulty, botId, lastMove } = payload;
  const bot = botId ? getBotById(botId) : null;
  const tier = (bot && bot.tier) || difficulty;
  const search = thinkEngine(tier);

  try {
    let baselineSent = false;
    const result = search({
    repetitionSigs: payload.repetitionSigs || null,
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
