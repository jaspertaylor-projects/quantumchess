// frontend/src/ai/alphaBetaEngine.js
// Purpose: Stronger alpha-beta engine with quiescence, king/center/safety heuristics, and PST-driven evaluation tailored for Quantum Chess superpositions.
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
  computeThreatenedSquaresForSide,
} from '../chessboard/quantumEngine.js';
import { fromAlgebraic } from '../chessboard/boardUtils.js';
import { CAPTURE_COLLAPSE_ORDER } from '../chessboard/gameConstants.js';

// Standard chess piece values used for material evaluation.
const CAPTURE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Heuristic weights tuned to play safer, develop sensibly, and avoid hanging pushes.
const MOBILITY_WEIGHT = 0.02;
const SUPERPOSITION_UNIT_WEIGHT = 0.1;
const COLLAPSED_KING_PENALTY = -12; // per fully collapsed king on a side
const HANGING_WEIGHT = 3.2; // penalize undefended capturable pieces
const TRADE_RISK_WEIGHT = 1.2; // penalize defended but losing exchanges
const PST_WEIGHT = 0.18; // piece-square table contribution
const KING_THREAT_WEIGHT = 0.8; // king on threatened square penalty
const KING_SHELL_WEIGHT = 0.12; // penalty per adjacent king square under control by opponent
const CENTER_CONTROL_MAIN_WEIGHT = 0.06; // e4, d4, e5, d5
const CENTER_CONTROL_EXT_WEIGHT = 0.025; // extended 3x3 ring
const DEVELOPMENT_MINOR_WEIGHT = 0.06; // reward for minor piece activation
const DEVELOPMENT_ROOK_WEIGHT = 0.04; // rooks activation
const DEVELOPMENT_GENERIC_WEIGHT = 0.03; // any piece moved from starting state
const PAWN_ADVANCE_WEIGHT = 0.015; // encourage steady, not reckless pawn progress

// Quiescence search limits to resolve hanging/tactical capture sequences
const QUIESCENCE_MAX_PLIES = 5;

// Piece-square tables (white perspective), coarse but effective. Values are in pawn units; scaled with PST_WEIGHT.
// Source inspiration: common simplified PSTs; tuned for relative trends rather than exact play.
const PST = {
  p: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0.05, 0.1, 0.1, -0.12, -0.12, 0.1, 0.1, 0.05],
    [0.02, 0.04, 0.06, 0.08, 0.08, 0.06, 0.04, 0.02],
    [0.01, 0.03, 0.05, 0.07, 0.07, 0.05, 0.03, 0.01],
    [0.02, 0.04, 0.04, 0.06, 0.06, 0.04, 0.04, 0.02],
    [0.03, 0.05, 0.05, 0.06, 0.06, 0.05, 0.05, 0.03],
    [0.15, 0.18, 0.18, 0.22, 0.22, 0.18, 0.18, 0.15],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  n: [
    [-0.5, -0.3, -0.2, -0.2, -0.2, -0.2, -0.3, -0.5],
    [-0.3, -0.1, 0, 0.05, 0.05, 0, -0.1, -0.3],
    [-0.2, 0.05, 0.12, 0.15, 0.15, 0.12, 0.05, -0.2],
    [-0.2, 0, 0.15, 0.18, 0.18, 0.15, 0, -0.2],
    [-0.2, 0, 0.15, 0.18, 0.18, 0.15, 0, -0.2],
    [-0.2, 0.05, 0.12, 0.15, 0.15, 0.12, 0.05, -0.2],
    [-0.3, -0.1, 0, 0.05, 0.05, 0, -0.1, -0.3],
    [-0.5, -0.3, -0.2, -0.2, -0.2, -0.2, -0.3, -0.5],
  ],
  b: [
    [-0.2, -0.1, -0.1, -0.05, -0.05, -0.1, -0.1, -0.2],
    [-0.1, 0, 0.05, 0.08, 0.08, 0.05, 0, -0.1],
    [-0.1, 0.06, 0.08, 0.1, 0.1, 0.08, 0.06, -0.1],
    [-0.05, 0.08, 0.1, 0.12, 0.12, 0.1, 0.08, -0.05],
    [-0.05, 0.08, 0.1, 0.12, 0.12, 0.1, 0.08, -0.05],
    [-0.1, 0.06, 0.08, 0.1, 0.1, 0.08, 0.06, -0.1],
    [-0.1, 0, 0.05, 0.08, 0.08, 0.05, 0, -0.1],
    [-0.2, -0.1, -0.1, -0.05, -0.05, -0.1, -0.1, -0.2],
  ],
  r: [
    [0, 0, 0.02, 0.04, 0.04, 0.02, 0, 0],
    [0.02, 0.05, 0.06, 0.08, 0.08, 0.06, 0.05, 0.02],
    [-0.02, 0, 0.02, 0.04, 0.04, 0.02, 0, -0.02],
    [-0.03, -0.01, 0.01, 0.03, 0.03, 0.01, -0.01, -0.03],
    [-0.03, -0.01, 0.01, 0.03, 0.03, 0.01, -0.01, -0.03],
    [-0.02, 0, 0.02, 0.04, 0.04, 0.02, 0, -0.02],
    [0.02, 0.05, 0.06, 0.08, 0.08, 0.06, 0.05, 0.02],
    [0, 0, 0.02, 0.04, 0.04, 0.02, 0, 0],
  ],
  q: [
    [-0.2, -0.1, -0.1, -0.05, -0.05, -0.1, -0.1, -0.2],
    [-0.1, 0, 0.05, 0.05, 0.05, 0.05, 0, -0.1],
    [-0.1, 0.05, 0.06, 0.07, 0.07, 0.06, 0.05, -0.1],
    [-0.05, 0.06, 0.08, 0.1, 0.1, 0.08, 0.06, -0.05],
    [-0.05, 0.06, 0.08, 0.1, 0.1, 0.08, 0.06, -0.05],
    [-0.1, 0.05, 0.06, 0.07, 0.07, 0.06, 0.05, -0.1],
    [-0.1, 0, 0.05, 0.05, 0.05, 0.05, 0, -0.1],
    [-0.2, -0.1, -0.1, -0.05, -0.05, -0.1, -0.1, -0.2],
  ],
  k: [
    [0.2, 0.25, 0.1, 0, 0, 0.1, 0.25, 0.2],
    [0.15, 0.18, 0.08, -0.1, -0.1, 0.08, 0.18, 0.15],
    [0.1, 0.12, -0.05, -0.15, -0.15, -0.05, 0.12, 0.1],
    [0.05, 0.08, -0.12, -0.2, -0.2, -0.12, 0.08, 0.05],
    [0.05, 0.08, -0.12, -0.2, -0.2, -0.12, 0.08, 0.05],
    [0.1, 0.12, -0.05, -0.15, -0.15, -0.05, 0.12, 0.1],
    [0.15, 0.18, 0.08, -0.1, -0.1, 0.08, 0.18, 0.15],
    [0.2, 0.25, 0.1, 0, 0, 0.1, 0.25, 0.2],
  ],
};

function mirrorForBlack(rankIndex) {
  return 7 - rankIndex;
}

function pstValueForTypeAt(t, fileIndex, rankIndex, side) {
  const table = PST[t];
  if (!table) return 0;
  const r = side === 'white' ? rankIndex : mirrorForBlack(rankIndex);
  const f = fileIndex;
  const v = table[r][f] || 0;
  return v;
}

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
  const out = [];
  const toPos = fromAlgebraic(targetSq);
  if (!toPos) return out;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    const isFirstMove = (p.moveCount || 0) === 0;

    const subset = subsetTypesThatCanMakeMove(
      p.possibleTypes,
      f,
      r,
      toPos.fileIndex,
      toPos.rankIndex,
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
  const occ2 = new Map(occ);
  if (occ2.has(targetSq)) occ2.delete(targetSq);

  const out = [];
  const toPos = fromAlgebraic(targetSq);
  if (!toPos) return out;

  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (p.id === removedPieceId) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    const isFirstMove = (p.moveCount || 0) === 0;

    const candidateTypes = [];

    if (p.possibleTypes.includes('p')) {
      const atk = attacksForType('p', f, r, occ2, p.side) || [];
      if (atk.includes(targetSq)) candidateTypes.push('p');
    }

    for (const t of p.possibleTypes) {
      if (t === 'p') continue;
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
  const opponent = side === 'white' ? 'black' : 'white';
  let sum = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const pVal = captureCollapseValueForPiece(p);
    if (pVal <= 0) continue;

    const attackers = attackersToSquareWithValues(pieces, opponent, p.square, occ);
    if (attackers.length === 0) continue;

    const defenders = defendersAfterCaptureWithValues(pieces, side, p.square, occ, p.id);
    if (defenders.length === 0) continue; // counted as hanging elsewhere

    let minOpp = Infinity;
    for (const a of attackers) if (a.value < minOpp) minOpp = a.value;

    if (minOpp < pVal) {
      sum += (pVal - minOpp);
    }
  }
  return sum;
}

function approxThreatenedSquares(pieces, side) {
  const occ = buildOccupancy(pieces);
  const threatened = new Set();
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    for (const t of p.possibleTypes) {
      const atk = attacksForType(t, f, r, occ, p.side) || [];
      for (const sq of atk) threatened.add(sq);
    }
  }
  return threatened;
}

function kingSafetyPenaltyForSide(pieces, side) {
  const opp = side === 'white' ? 'black' : 'white';
  const oppThreats = approxThreatenedSquares(pieces, opp);
  let penalty = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (!p.possibleTypes || !p.possibleTypes.includes('k')) continue;
    if (oppThreats.has(p.square)) penalty += KING_THREAT_WEIGHT;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const kAdj = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], /*self*/ [1, 0],
      [-1, 1], [0, 1], [1, 1],
    ];
    for (const [df, dr] of kAdj) {
      const f = pos.fileIndex + df;
      const r = pos.rankIndex + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const sq = `${'abcdefgh'[f]}${'12345678'[r]}`;
      if (oppThreats.has(sq)) penalty += KING_SHELL_WEIGHT;
    }
  }
  return -penalty;
}

function pstScoreForSide(pieces, side) {
  let score = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    const types = Array.isArray(p.possibleTypes) ? p.possibleTypes : [];
    if (types.length === 0) continue;
    let sum = 0;
    for (const t of types) sum += pstValueForTypeAt(t, f, r, side);
    const avg = sum / types.length;
    score += avg * PST_WEIGHT;
  }
  return score;
}

function centerControlScoreForSide(pieces, side) {
  const threats = approxThreatenedSquares(pieces, side);
  const main = ['d4', 'e4', 'd5', 'e5'];
  const ext = ['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6'];
  let s = 0;
  for (const sq of main) if (threats.has(sq)) s += CENTER_CONTROL_MAIN_WEIGHT;
  for (const sq of ext) if (threats.has(sq)) s += CENTER_CONTROL_EXT_WEIGHT;
  return s;
}

function developmentScoreForSide(pieces, side) {
  let s = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const moved = (p.moveCount || 0) > 0;
    if (!moved) continue;
    s += DEVELOPMENT_GENERIC_WEIGHT;
    const tset = new Set(p.possibleTypes || []);
    if (tset.has('n') || tset.has('b')) s += DEVELOPMENT_MINOR_WEIGHT;
    if (tset.has('r')) s += DEVELOPMENT_ROOK_WEIGHT;
  }
  return s;
}

function pawnAdvanceScoreForSide(pieces, side) {
  let s = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (!p.possibleTypes || !p.possibleTypes.includes('p')) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const rank = pos.rankIndex;
    const progress = side === 'white' ? rank - 1 : 6 - rank; // relative to starting pawn rank (1 for white, 6 for black)
    s += Math.max(0, progress) * PAWN_ADVANCE_WEIGHT;
  }
  return s;
}

function pieceSafetySoftPenaltyForSide(pieces, side, occ) {
  // Soft penalty for being attacked even if defended, scaled by piece capture value.
  const opponent = side === 'white' ? 'black' : 'white';
  let sum = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const attackers = attackersToSquareWithValues(pieces, opponent, p.square, occ);
    if (attackers.length === 0) continue;
    const val = captureCollapseValueForPiece(p);
    sum += 0.06 * val; // gentle nudge to keep pieces safe
  }
  return -sum;
}

function isCheckOnSide(pieces, side) {
  const opp = side === 'white' ? 'black' : 'white';
  const oppThreats = computeThreatenedSquaresForSide(pieces, opp);
  for (const k of pieces) {
    if (k.captured || k.side !== side || !k.square) continue;
    if (!k.possibleTypes || !k.possibleTypes.includes('k')) continue;
    if (oppThreats.has(k.square)) return true;
  }
  return false;
}

function evaluatePosition(pieces) {
  // Material: sum of the pessimistic (lowest) value of all pieces remaining on board.
  const wMaterial = onBoardMaterialSumForSide(pieces, 'white');
  const bMaterial = onBoardMaterialSumForSide(pieces, 'black');
  const material = wMaterial - bMaterial;

  // Occupancy for downstream tactical approximations and mobility
  const occ = buildOccupancy(pieces);

  // Mobility
  const wMoves = pseudoLegalMoveCountForSide(pieces, 'white', occ);
  const bMoves = pseudoLegalMoveCountForSide(pieces, 'black', occ);
  const mobility = (wMoves - bMoves) * MOBILITY_WEIGHT;

  // Superposition breadth
  const wSup = superpositionScoreForSide(pieces, 'white');
  const bSup = superpositionScoreForSide(pieces, 'black');
  const superpos = wSup - bSup;

  // Collapsed king penalty
  const wKingPen = collapsedKingPenaltyForSide(pieces, 'white');
  const bKingPen = collapsedKingPenaltyForSide(pieces, 'black');
  const kingCollapse = wKingPen - bKingPen;

  // Undefended hanging exposure
  const wHang = undefendedHangingValueForSide(pieces, 'white', occ);
  const bHang = undefendedHangingValueForSide(pieces, 'black', occ);
  const exposure = -(wHang - bHang) * HANGING_WEIGHT;

  // Trade risk
  const wTrade = tradeRiskPenaltyForSide(pieces, 'white', occ);
  const bTrade = tradeRiskPenaltyForSide(pieces, 'black', occ);
  const trade = -(wTrade - bTrade) * TRADE_RISK_WEIGHT;

  // PST and king safety
  const pst = pstScoreForSide(pieces, 'white') - pstScoreForSide(pieces, 'black');
  const kingSafety = kingSafetyPenaltyForSide(pieces, 'white') - kingSafetyPenaltyForSide(pieces, 'black');

  // Center control and development
  const center = centerControlScoreForSide(pieces, 'white') - centerControlScoreForSide(pieces, 'black');
  const dev = developmentScoreForSide(pieces, 'white') - developmentScoreForSide(pieces, 'black');
  const pawnAdv = pawnAdvanceScoreForSide(pieces, 'white') - pawnAdvanceScoreForSide(pieces, 'black');

  // Soft safety penalty for attacked pieces even if defended
  const softSafety = pieceSafetySoftPenaltyForSide(pieces, 'white', occ) - pieceSafetySoftPenaltyForSide(pieces, 'black', occ);

  return material + mobility + superpos + kingCollapse + exposure + trade + pst + kingSafety + center + dev + pawnAdv + softSafety;
}

function orderMoves(moves, currentEval, side) {
  const sign = side === 'white' ? 1 : -1;
  return moves
    .map((m) => {
      const nextEval = evaluatePosition(m.resultPieces);
      // Bonus for captures and castling to improve move ordering
      const capBonus = isCaptureMoveEval(currentEval, nextEval, sign) ? 0.3 : 0;
      const castleBonus = m.type === 'castle' ? 0.25 : 0;
      return { m, score: sign * (nextEval - currentEval) + capBonus + castleBonus };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

function isCaptureMoveEval(prevEval, nextEval, sign) {
  // Heuristic: if evaluation jumps favorably after a move, likely tactical; weak signal but useful for ordering.
  return sign * (nextEval - prevEval) > 0.2;
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
      const ext = isCaptureMove(pieces, mv.resultPieces) || isCheckOnSide(mv.resultPieces, nextSide) ? 1 : 0; // check/capture extension
      const res = alphaBeta(mv.resultPieces, nextSide, Math.max(0, depth - 1 + ext), alpha, beta, rootSide);
      if (res.score > best) { best = res.score; bestMove = mv; }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const mv of ordered) {
      const nextSide = side === 'white' ? 'black' : 'white';
      const ext = isCaptureMove(pieces, mv.resultPieces) || isCheckOnSide(mv.resultPieces, nextSide) ? 1 : 0;
      const res = alphaBeta(mv.resultPieces, nextSide, Math.max(0, depth - 1 + ext), alpha, beta, rootSide);
      if (res.score < best) { best = res.score; bestMove = mv; }
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  }
}

export default function pickBestMove({ pieces, sideToMove, difficulty = 'medium' }) {
  // Depth selection tuned for stronger play with added heuristics
  const depth = difficulty === 'hard' ? 4 : difficulty === 'easy' ? 1 : 3;
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
