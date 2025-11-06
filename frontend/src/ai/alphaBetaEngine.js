// frontend/src/ai/alphaBetaEngine.js
// Purpose: Alpha-beta search engine with a heuristic evaluator for Quantum Chess positions, producing a best move for a given side and difficulty.
// Imports From: ../chessboard/quantumEngine.js, ../chessboard/boardUtils.js, ../chessboard/gameConstants.js
// Exported To: ./useLocalAi.js

import { clonePieces, generateLegalReplies, buildOccupancy, movesForType, canSideCaptureSquare } from '../chessboard/quantumEngine.js';
import { fromAlgebraic } from '../chessboard/boardUtils.js';
import { CAPTURE_COLLAPSE_ORDER } from '../chessboard/gameConstants.js';

// Standard chess piece values used for material evaluation.
const CAPTURE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Evaluation weights tuned to reduce reckless captures and value capture targets correctly.
const MOBILITY_WEIGHT = 0.05; // small value to avoid dominating decisions
const SUPERPOSITION_UNIT_WEIGHT = 0.2; // uncertainty is mildly valuable, but not decisive
const COLLAPSED_KING_PENALTY = -10; // per fully collapsed king on a side
const HANGING_WEIGHT = 1.0; // strong penalty for pieces that can be captured immediately

function leastNonKingType(types) {
  if (!Array.isArray(types) || types.length === 0) return null;
  return CAPTURE_COLLAPSE_ORDER.find((t) => types.includes(t)) || null;
}

function captureCollapseValueForPiece(p) {
  if (!p || p.captured || !p.square) return 0;
  const types = Array.isArray(p.possibleTypes) ? p.possibleTypes : [];
  const least = leastNonKingType(types);
  const t = least || 'p'; // mirror simulation fallback for captures
  return CAPTURE_VALUES[t];
}

function onBoardMaterialSumForSide(pieces, side) {
  let sum = 0;
  for (const p of pieces) {
    if (p.side !== side) continue;
    if (p.captured || !p.square) continue;

    const types = p.possibleTypes || [];
    if (types.length === 0) continue;

    const leastValuableType = leastNonKingType(types);
    const typeToValue = leastValuableType || (types.includes('k') ? 'k' : null);

    if (typeToValue) {
      sum += CAPTURE_VALUES[typeToValue];
    }
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

function hangingExposureValueForSide(pieces, side) {
  // Sum the capture-collapse values of all of this side's pieces that can be captured immediately by the opponent.
  const opponent = side === 'white' ? 'black' : 'white';
  let sum = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (canSideCaptureSquare(pieces, opponent, p.square)) {
      sum += captureCollapseValueForPiece(p);
    }
  }
  return sum;
}

function evaluatePosition(pieces) {
  // Material: sum of the pessimistic (lowest) value of all pieces remaining on board.
  const wMaterial = onBoardMaterialSumForSide(pieces, 'white');
  const bMaterial = onBoardMaterialSumForSide(pieces, 'black');
  const material = wMaterial - bMaterial;

  // Mobility: number of pseudo-legal moves advantage (fast, no simulation)
  const occ = buildOccupancy(pieces);
  const wMoves = pseudoLegalMoveCountForSide(pieces, 'white', occ);
  const bMoves = pseudoLegalMoveCountForSide(pieces, 'black', occ);
  const mobility = (wMoves - bMoves) * MOBILITY_WEIGHT;

  // Superposition breadth: small incentive to retain options; scaled to 0..5 per piece before weighting
  const wSup = superpositionScoreForSide(pieces, 'white');
  const bSup = superpositionScoreForSide(pieces, 'black');
  const superpos = wSup - bSup;

  // Collapsed king penalty
  const wKingPen = collapsedKingPenaltyForSide(pieces, 'white');
  const bKingPen = collapsedKingPenaltyForSide(pieces, 'black');
  const kingCollapse = wKingPen - bKingPen;

  // Immediate capture exposure: strongly penalize having capturable pieces, using capture-collapse values
  const wHanging = hangingExposureValueForSide(pieces, 'white');
  const bHanging = hangingExposureValueForSide(pieces, 'black');
  const exposure = -(wHanging - bHanging) * HANGING_WEIGHT;

  return material + mobility + superpos + kingCollapse + exposure;
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
