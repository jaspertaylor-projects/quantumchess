// frontend/src/ai/alphaBetaEngine.js
// Purpose: Alpha-beta search engine with a heuristic evaluator for Quantum Chess positions, producing a best move for a given side and difficulty.
// Imports From: ../chessboard/quantumEngine.js
// Exported To: ./useLocalAi.js

import { clonePieces, generateLegalReplies } from '../chessboard/quantumEngine.js';

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function sideOf(piece) {
  return piece.side === 'white' ? 1 : -1;
}

function materialScore(pieces) {
  let score = 0;
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    if (!Array.isArray(p.possibleTypes) || p.possibleTypes.length === 0) continue;
    const avg = p.possibleTypes.reduce((s, t) => s + (PIECE_VALUES[t] || 0), 0) / p.possibleTypes.length;
    score += (p.side === 'white' ? 1 : -1) * avg;
  }
  return score;
}

function kingPresenceBonus(pieces) {
  let whiteHolders = 0;
  let blackHolders = 0;
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    if (p.possibleTypes && p.possibleTypes.includes('k')) {
      if (p.side === 'white') whiteHolders += 1;
      else blackHolders += 1;
    }
  }
  const bonusPerMissing = 300;
  return (blackHolders === 0 ? bonusPerMissing : 0) - (whiteHolders === 0 ? bonusPerMissing : 0);
}

function evaluatePosition(pieces) {
  const mat = materialScore(pieces);
  const kingBon = kingPresenceBonus(pieces);
  return mat + kingBon;
}

function orderMoves(moves, currentEval, side) {
  const sign = side === 'white' ? 1 : -1;
  return moves
    .map((m) => {
      const nextEval = evaluatePosition(m.resultPieces);
      return { m, score: sign * (nextEval - currentEval) };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

function alphaBeta(pieces, side, depth, alpha, beta, rootSide) {
  if (depth === 0) {
    const val = evaluatePosition(pieces);
    const score = (rootSide === 'white' ? 1 : -1) * val;
    return { score, move: null };
  }

  const replies = generateLegalReplies(pieces, side, 0);
  if (replies.length === 0) {
    const val = evaluatePosition(pieces);
    const score = (rootSide === 'white' ? 1 : -1) * val;
    return { score, move: null };
  }

  const currentEval = evaluatePosition(pieces);
  const ordered = orderMoves(replies, currentEval, side);

  let bestMove = null;
  if (side === rootSide) {
    let best = -Infinity;
    for (const mv of ordered) {
      const nextSide = side === 'white' ? 'black' : 'white';
      const res = alphaBeta(mv.resultPieces, nextSide, depth - 1, alpha, beta, rootSide);
      if (res.score > best) { best = res.score; bestMove = mv; }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const mv of ordered) {
      const nextSide = side === 'white' ? 'black' : 'white';
      const res = alphaBeta(mv.resultPieces, nextSide, depth - 1, alpha, beta, rootSide);
      if (res.score < best) { best = res.score; bestMove = mv; }
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  }
}

export default function pickBestMove({ pieces, sideToMove, difficulty = 'medium' }) {
  const depth = difficulty === 'hard' ? 3 : difficulty === 'easy' ? 1 : 2;
  const rootPieces = clonePieces(pieces);
  const rootSide = sideToMove;
  const res = alphaBeta(rootPieces, rootSide, depth, -Infinity, Infinity, rootSide);

  // Easy mode occasional blunder/randomization
  if (difficulty === 'easy') {
    const moves = generateLegalReplies(rootPieces, rootSide, 0);
    if (moves.length > 0) {
      const idx = Math.random() < 0.25 ? Math.floor(Math.random() * moves.length) : -1;
      if (idx >= 0) return moves[idx];
    }
  }

  return res.move || null;
}
