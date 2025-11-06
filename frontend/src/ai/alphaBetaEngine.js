// frontend/src/ai/alphaBetaEngine.js
// Purpose: Alpha-beta engine with quiescence and trade-aware evaluation to avoid bad exchanges and hanging pieces in Quantum Chess.
// Imports From: ../chessboard/quantumEngine.js, ../chessboard/boardUtils.js, ../chessboard/gameConstants.js
// Exported To: ./useLocalAi.js

import {
  clonePieces,
  generateLegalReplies,
  buildOccupancy,
  movesForType,
  canSideCaptureSquare,
  subsetTypesThatCanMakeMove,
  attacksForType,
} from '../chessboard/quantumEngine.js';
import { fromAlgebraic } from '../chessboard/boardUtils.js';
import { CAPTURE_COLLAPSE_ORDER } from '../chessboard/gameConstants.js';

// Standard chess piece values used for material evaluation.
const CAPTURE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Evaluation weights tuned to reduce reckless captures and value capture targets correctly.
const MOBILITY_WEIGHT = 0.04;
const SUPERPOSITION_UNIT_WEIGHT = 0.2;
const COLLAPSED_KING_PENALTY = -10; // per fully collapsed king on a side
const HANGING_WEIGHT = 1.8; // strong penalty for undefended capturable pieces
const TRADE_RISK_WEIGHT = 0.7; // penalty for defended but losing exchanges

// Quiescence search limits to resolve hanging/tactical capture sequences
const QUIESCENCE_MAX_PLIES = 4;

function leastNonKingType(types) {
  if (!Array.isArray(types) || types.length === 0) return null;
  return CAPTURE_COLLAPSE_ORDER.find((t) => types.includes(t)) || null;
}

function captureCollapseValueForTypes(types) {
  const least = leastNonKingType(types);
  const t = least || 'p';
  return CAPTURE_VALUES[t];
}

function captureCollapseValueForPiece(p) {
  if (!p || p.captured || !p.square) return 0;
  const types = Array.isArray(p.possibleTypes) ? p.possibleTypes : [];
  return captureCollapseValueForTypes(types);
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

function attackersToSquareWithValues(pieces, side, targetSq, occ) {
  // Computes all attackers for "side" that can capture on targetSq under current occupancy,
  // returning an array of { piece, value } where value is the collapse value the attacker risks when moving.
  const out = [];
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    const isFirstMove = (p.moveCount || 0) === 0;

    // For this target, compute the subset of types that can make that move.
    const subset = subsetTypesThatCanMakeMove(
      p.possibleTypes,
      f,
      r,
      fromAlgebraic(targetSq).fileIndex,
      fromAlgebraic(targetSq).rankIndex,
      occ,
      p.side,
      isFirstMove
    );
    if (!subset || subset.length === 0) continue;
    const val = captureCollapseValueForTypes(subset);
    out.push({ piece: p, value: val });
  }
  return out;
}

function defendersAfterCaptureWithValues(pieces, side, targetSq, occ, removedPieceId) {
  // Approximates defenders that could recapture on targetSq after the current occupant is captured.
  // We simulate by removing the current occupant from occupancy and computing attacks/moves.
  const occ2 = new Map(occ);
  if (occ2.has(targetSq)) occ2.delete(targetSq);

  const out = [];
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (p.id === removedPieceId) continue; // the captured piece won't defend
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    const isFirstMove = (p.moveCount || 0) === 0;

    // Collect candidate types able to reach targetSq after the square is vacated.
    const candidateTypes = [];

    // Pawns: use attacks to preserve diagonal-only capture capability semantics.
    if (p.possibleTypes.includes('p')) {
      const atk = attacksForType('p', f, r, occ2, p.side) || [];
      if (atk.includes(targetSq)) candidateTypes.push('p');
    }

    // Other types: use movesForType with occ2; reaching the square implies potential recapture next ply.
    for (const t of p.possibleTypes) {
      if (t === 'p') continue; // already handled
      const list = movesForType(t, f, r, occ2, p.side, { isFirstMove });
      if (list.includes(targetSq)) candidateTypes.push(t);
    }

    if (candidateTypes.length === 0) continue;
    const val = captureCollapseValueForTypes(candidateTypes);
    out.push({ piece: p, value: val });
  }
  return out;
}

function undefendedHangingValueForSide(pieces, side, occ) {
  // Sum of collapse values of this side's pieces that can be captured immediately and have zero defenders.
  const opponent = side === 'white' ? 'black' : 'white';
  let sum = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const attackers = attackersToSquareWithValues(pieces, opponent, p.square, occ);
    if (attackers.length === 0) continue;
    const defenders = defendersAfterCaptureWithValues(pieces, side, p.square, occ, p.id);
    if (defenders.length === 0) {
      sum += captureCollapseValueForPiece(p);
    }
  }
  return sum;
}

function tradeRiskPenaltyForSide(pieces, side, occ) {
  // For pieces that are attacked and defended, penalize if the cheapest opposing attacker is cheaper than our piece value.
  const opponent = side === 'white' ? 'black' : 'white';
  let sum = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const pVal = captureCollapseValueForPiece(p);
    if (pVal <= 0) continue;

    const attackers = attackersToSquareWithValues(pieces, opponent, p.square, occ);
    if (attackers.length === 0) continue;

    const defenders = defendersAfterCaptureWithValues(pieces, side, p.square, occ, p.id);
    if (defenders.length === 0) continue; // accounted as hanging elsewhere

    let minOpp = Infinity;
    for (const a of attackers) if (a.value < minOpp) minOpp = a.value;

    if (minOpp < pVal) {
      sum += (pVal - minOpp);
    }
  }
  return sum;
}

function evaluatePosition(pieces) {
  // Material: sum of the pessimistic (lowest) value of all pieces remaining on board.
  const wMaterial = onBoardMaterialSumForSide(pieces, 'white');
  const bMaterial = onBoardMaterialSumForSide(pieces, 'black');
  const material = wMaterial - bMaterial;

  // Occupancy for downstream tactical approximations and mobility
  const occ = buildOccupancy(pieces);

  // Mobility: number of pseudo-legal moves advantage (fast, no simulation)
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

  // Undefended hanging exposure: heavily penalize pieces that can be captured immediately with no recapture
  const wHang = undefendedHangingValueForSide(pieces, 'white', occ);
  const bHang = undefendedHangingValueForSide(pieces, 'black', occ);
  const exposure = -(wHang - bHang) * HANGING_WEIGHT;

  // Trade risk: if defended but losing the exchange on the first trade, apply penalty equal to loss margin
  const wTrade = tradeRiskPenaltyForSide(pieces, 'white', occ);
  const bTrade = tradeRiskPenaltyForSide(pieces, 'black', occ);
  const trade = -(wTrade - bTrade) * TRADE_RISK_WEIGHT;

  return material + mobility + superpos + kingCollapse + exposure + trade;
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

function countCapturedPieces(pieces) {
  let c = 0;
  for (const p of pieces) if (p.captured) c += 1;
  return c;
}

function isCaptureMove(prevPieces, nextPieces) {
  return countCapturedPieces(nextPieces) > countCapturedPieces(prevPieces);
}

function generateCapturingReplies(pieces, side) {
  const replies = generateLegalReplies(pieces, side, 0);
  const caps = [];
  for (const mv of replies) {
    if (isCaptureMove(pieces, mv.resultPieces)) caps.push(mv);
  }
  return caps;
}

function quiescenceSearch(pieces, side, alpha, beta, rootSide, qPlies) {
  const standPatVal = evaluatePosition(pieces);
  const standPat = (rootSide === 'white' ? 1 : -1) * standPatVal;

  if (standPat >= beta) return { score: beta, move: null };
  if (alpha < standPat) alpha = standPat;
  if (qPlies <= 0) return { score: standPat, move: null };

  const caps = generateCapturingReplies(pieces, side);
  if (caps.length === 0) return { score: standPat, move: null };

  // Order capture moves greedily using evaluation delta
  const ordered = orderMoves(caps, standPatVal, side);

  let bestMove = null;
  if (side === rootSide) {
    let best = -Infinity;
    for (const mv of ordered) {
      const nextSide = side === 'white' ? 'black' : 'white';
      const res = quiescenceSearch(mv.resultPieces, nextSide, alpha, beta, rootSide, qPlies - 1);
      if (res.score > best) { best = res.score; bestMove = mv; }
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const mv of ordered) {
      const nextSide = side === 'white' ? 'black' : 'white';
      const res = quiescenceSearch(mv.resultPieces, nextSide, alpha, beta, rootSide, qPlies - 1);
      if (res.score < best) { best = res.score; bestMove = mv; }
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  }
}

function alphaBeta(pieces, side, depth, alpha, beta, rootSide) {
  if (depth === 0) {
    return quiescenceSearch(pieces, side, alpha, beta, rootSide, QUIESCENCE_MAX_PLIES);
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
