// frontend/src/ai/alphaBetaEngine.js
// Purpose: Alpha-beta search engine with a heuristic evaluator for Quantum Chess positions, producing a best move for a given side and difficulty.
// Imports From: ../chessboard/quantumEngine.js, ../chessboard/boardUtils.js
// Exported To: ./useLocalAi.js

import { clonePieces, generateLegalReplies, buildOccupancy, movesForType } from '../chessboard/quantumEngine.js';
import { fromAlgebraic } from '../chessboard/boardUtils.js';

// Standard chess piece values on a small scale for capture accounting
// These are only used to value captured material relative to the 40-point baseline per side
const CAPTURE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const MOBILITY_WEIGHT = 0.1; // +0.1 per legal move advantage
const SUPERPOSITION_UNIT_WEIGHT = 1.0; // scaled so fully uncertain piece contributes 5 (types 6 -> 5 units)
const COLLAPSED_KING_PENALTY = -10; // per fully collapsed king on a side
const SIDE_BASELINE_TOTAL = 40; // starting material total per side

function capturedMaterialSumForSide(pieces, side) {
  let sum = 0;
  for (const p of pieces) {
    if (p.side !== side) continue;
    if (!p.captured) continue;
    const t = Array.isArray(p.possibleTypes) && p.possibleTypes.length > 0 ? p.possibleTypes[0] : null;
    if (!t) continue;
    sum += CAPTURE_VALUES[t] || 0;
  }
  return sum;
}

function pseudoLegalMoveCountForSide(pieces, side, occ) {
  let total = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    const isFirstMove = (p.moveCount || 0) === 0;

    const merged = new Set();
    const types = Array.isArray(p.possibleTypes) ? p.possibleTypes : [];
    for (const t of types) {
      const list = movesForType(t, f, r, occ, side, { isFirstMove });
      for (const sq of list) merged.add(sq);
    }
    total += merged.size;
  }
  return total;
}

function superpositionScoreForSide(pieces, side) {
  let total = 0;
  for (const p of pieces) {
    if (p.side !== side) continue;
    if (p.captured || !p.square) continue;
    const types = Array.isArray(p.possibleTypes) ? p.possibleTypes : [];
    if (types.length <= 1) continue;
    // Scale so: 1 type -> 0, 6 types -> 5
    total += (types.length - 1) * SUPERPOSITION_UNIT_WEIGHT;
  }
  return total;
}

function collapsedKingPenaltyForSide(pieces, side) {
  let count = 0;
  for (const p of pieces) {
    if (p.side !== side) continue;
    if (p.captured || !p.square) continue;
    const types = Array.isArray(p.possibleTypes) ? p.possibleTypes : [];
    if (types.length === 1 && types[0] === 'k') count += 1;
  }
  return count * COLLAPSED_KING_PENALTY;
}

function evaluatePosition(pieces) {
  // Material: Bcapt - Wcapt (equivalent to -(RemWhite - RemBlack) with baseline 40)
  const wCaptured = capturedMaterialSumForSide(pieces, 'white');
  const bCaptured = capturedMaterialSumForSide(pieces, 'black');
  const material = bCaptured - wCaptured;

  // Mobility: number of pseudo-legal moves advantage (fast, no simulation)
  const occ = buildOccupancy(pieces);
  const wMoves = pseudoLegalMoveCountForSide(pieces, 'white', occ);
  const bMoves = pseudoLegalMoveCountForSide(pieces, 'black', occ);
  const mobility = (wMoves - bMoves) * MOBILITY_WEIGHT;

  // Superposition breadth: scaled to 0..5 per piece
  const wSup = superpositionScoreForSide(pieces, 'white');
  const bSup = superpositionScoreForSide(pieces, 'black');
  const superpos = wSup - bSup;

  // Collapsed king penalty
  const wKingPen = collapsedKingPenaltyForSide(pieces, 'white');
  const bKingPen = collapsedKingPenaltyForSide(pieces, 'black');
  const kingCollapse = wKingPen - bKingPen;

  return material + mobility + superpos + kingCollapse;
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
