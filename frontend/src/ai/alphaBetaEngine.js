// frontend/src/ai/alphaBetaEngine.js
// Purpose: Alpha-beta engine with quantum-aware heuristics. Safer capture logic using SEE with hard demotion of losing captures, promotion bonus, stronger pawn-advance incentives, early opening development preferences, and improved move ordering.
// Imports From: ../chessboard/quantumEngine.js, ../chessboard/boardUtils.js, ../chessboard/gameConstants.js
// Exported To: ./useLocalAi.js, ./aiWorker.js

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

// Debug toggle
const DEBUG_AI = true;

// Standard chess piece values used for material evaluation.
const CAPTURE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Heuristic weights tuned to play safer, develop more pieces, and avoid tunnel-vision on a single piece.
const MOBILITY_WEIGHT = 0.02;
const SUPERPOSITION_UNIT_WEIGHT = 0.1;
const COLLAPSED_KING_PENALTY = -12; // per fully collapsed king on a side
// Reduce fear, enable more captures and trades
const HANGING_WEIGHT = 1.2; // penalty for undefended, capturable pieces (softened)
const TRADE_RISK_WEIGHT = 0.9; // penalty for defended but losing exchanges (softened)
const PST_WEIGHT = 0.18; // piece-square table contribution
const KING_THREAT_WEIGHT = 0.8; // king on threatened square penalty
const KING_SHELL_WEIGHT = 0.12; // penalty per adjacent king square under control by opponent
const CENTER_CONTROL_MAIN_WEIGHT = 0.1; // e4, d4, e5, d5 (slightly increased)
const CENTER_CONTROL_EXT_WEIGHT = 0.05; // extended 3x3 ring (slightly increased)
const CENTER_OCCUPANCY_MAIN_WEIGHT = 0.05; // bonus for actually occupying e4, d4, e5, d5
const CENTER_OCCUPANCY_EXT_WEIGHT = 0.025; // bonus for occupying the extended ring
const DEVELOPMENT_MINOR_WEIGHT = 0.1; // reward for minor piece activation
const DEVELOPMENT_ROOK_WEIGHT = 0.06; // rooks activation
const DEVELOPMENT_GENERIC_WEIGHT = 0.06; // any piece moved from starting state
const PAWN_ADVANCE_WEIGHT = 0.06; // encourage steady pawn progress (increased)
const DEV_BREADTH_UNIT_WEIGHT = 0.08; // reward breadth: number of distinct movers (increased)

// Value retaining Pawn/King in superposition across your team
const PAWN_PRESENCE_WEIGHT = 0.09; // per friendly piece containing 'p' (increased to value pawn presence more)
const KING_PRESENCE_WEIGHT = 0.04; // per friendly piece containing 'k'

// Promotion value bonus
const PROMOTION_BONUS_WEIGHT = 3.5; // big bonus for having a promoted piece on board

// Quiescence search limits to resolve hanging/tactical capture sequences
const QUIESCENCE_MAX_PLIES = 5;

// SEE and move-ordering weights
const SEE_RISK_WEIGHT = 1.2; // strong down-weight for losing captures
const SEE_GOOD_WEIGHT = 0.9; // bonus if landing square yields favorable exchanges

// Collapse penalties: avoid over-narrowing too early or into single-type Knights
const COLLAPSE_OVER_NARROW_PENALTY = 0.25; // base penalty for narrowing superposition (slightly softer)
const SINGLE_TYPE_COLLAPSE_MULTIPLIER = 2.2; // stronger penalty for collapsing to a single type
const DOUBLE_TYPE_COLLAPSE_MULTIPLIER = 0.5; // milder penalty for collapsing to two types
const BQ_DOUBLE_TYPE_DISCOUNT = 0.7; // discount if the two types are exactly bishop-queen
const KNIGHT_SINGLE_COLLAPSE_EXTRA = 0.8; // extra penalty when collapsing to a pure knight in early game
const EARLY_GAME_PLY_THRESHOLD = 12; // until this ply, avoid narrow collapses

// Development diversity ordering weights
const FRESH_DEVELOPMENT_BONUS = 0.3; // prefer moving new pieces more strongly
const REPEAT_MOVER_PENALTY = 0.35; // discourage repeating the same mover when many are unmoved

// Randomization to avoid deterministic play
const RANDOM_MOVE_JITTER = 0.1; // smaller non-determinism in move ordering

// Move-ordering specific bonuses
const CAPTURE_ORDER_BONUS = 0.35; // softer capture preference
const CAPTURE_VALUE_ORDER_BONUS = 0.08; // scale with value of captured piece
const P_RETENTION_ORDER_BONUS = 0.08; // prefer moves that retain Pawn in mover's superposition
const CHECK_ORDER_BONUS = 0.12; // prefer moves that result in a check (per checking rules)

// Losing capture gating
const LOSING_CAPTURE_DROP_THRESHOLD = -0.75; // if SEE net below this, heavily demote in ordering
const LOSING_CAPTURE_HARD_PENALTY = 4.0; // large demotion so AI avoids reflexive losing captures
const EXTREME_GAIN_THRESHOLD = 2.0; // if eval jump exceeds this, allow even losing capture

// Piece-square tables (white perspective)
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
  // Align with checking rules: only pieces with <= 2 possibilities contribute to threat map
  const opp = side === 'white' ? 'black' : 'white';
  const oppThreats = computeThreatenedSquaresForSide(pieces, opp);
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

function centerOccupancyScoreForSide(pieces, side) {
  const main = new Set(['d4', 'e4', 'd5', 'e5']);
  const ext = new Set(['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6']);
  let s = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (main.has(p.square)) s += CENTER_OCCUPANCY_MAIN_WEIGHT;
    else if (ext.has(p.square)) s += CENTER_OCCUPANCY_EXT_WEIGHT;
  }
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

function movedBreadthForSide(pieces, side) {
  let count = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if ((p.moveCount || 0) > 0) count += 1;
  }
  return count * DEV_BREADTH_UNIT_WEIGHT;
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

function promotionScoreForSide(pieces, side) {
  let s = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (p.wasPromoted) s += PROMOTION_BONUS_WEIGHT;
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
    sum += 0.1 * val;
  }
  return -sum;
}

function presenceCountForSide(pieces, side, typeChar) {
  let c = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (Array.isArray(p.possibleTypes) && p.possibleTypes.includes(typeChar)) c += 1;
  }
  return c;
}

function presenceScoreForSide(pieces, side) {
  const pawnPresence = presenceCountForSide(pieces, side, 'p') * PAWN_PRESENCE_WEIGHT;
  const kingPresence = presenceCountForSide(pieces, side, 'k') * KING_PRESENCE_WEIGHT;
  return pawnPresence + kingPresence;
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

  // Presence of Pawn/King in superpositions across the team
  const wPresence = presenceScoreForSide(pieces, 'white');
  const bPresence = presenceScoreForSide(pieces, 'black');
  const presence = wPresence - bPresence;

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
  const centerOcc = centerOccupancyScoreForSide(pieces, 'white') - centerOccupancyScoreForSide(pieces, 'black');
  const dev = developmentScoreForSide(pieces, 'white') - developmentScoreForSide(pieces, 'black');
  const pawnAdv = pawnAdvanceScoreForSide(pieces, 'white') - pawnAdvanceScoreForSide(pieces, 'black');

  // Development breadth: number of distinct movers
  const breadth = movedBreadthForSide(pieces, 'white') - movedBreadthForSide(pieces, 'black');

  // Soft safety penalty for attacked pieces even if defended
  const softSafety = pieceSafetySoftPenaltyForSide(pieces, 'white', occ) - pieceSafetySoftPenaltyForSide(pieces, 'black', occ);

  // Promotion presence bonus
  const promo = promotionScoreForSide(pieces, 'white') - promotionScoreForSide(pieces, 'black');

  return material + mobility + superpos + presence + kingCollapse + exposure + trade + pst + kingSafety + center + centerOcc + dev + pawnAdv + breadth + softSafety + promo;
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

// --- Static Exchange Evaluation (approximate) for landing square risk ---
function getPieceAtSquare(pieces, sq) {
  for (const p of pieces) {
    if (!p.captured && p.square === sq) return p;
  }
  return null;
}

export function seeNetForLandingSquare(piecesAfterMove, movedSide, toSq) {
  const occ = buildOccupancy(piecesAfterMove);
  const occupant = occ.get(toSq);
  if (!occupant || occupant.side !== movedSide) return 0; // not a standard single move or castle

  const initialVal = captureCollapseValueForPiece(occupant);
  const opponent = movedSide === 'white' ? 'black' : 'white';

  const oppAttackers = attackersToSquareWithValues(piecesAfterMove, opponent, toSq, occ)
    .map((a) => a.value)
    .sort((a, b) => a - b);

  const myDefenders = defendersAfterCaptureWithValues(piecesAfterMove, movedSide, toSq, occ, occupant.id)
    .map((a) => a.value)
    .sort((a, b) => a - b);

  let net = 0;
  let targetVal = initialVal;
  let oi = 0;
  let mi = 0;
  let turn = 'opp';

  while (true) {
    if (turn === 'opp') {
      if (oi >= oppAttackers.length) break;
      net -= targetVal; // opponent captures our target piece of value targetVal
      targetVal = oppAttackers[oi++]; // the capturing piece becomes the new target
      turn = 'mine';
    } else {
      if (mi >= myDefenders.length) break;
      net += targetVal; // we recapture that capturing piece
      targetVal = myDefenders[mi++];
      turn = 'opp';
    }
  }
  return net; // positive is good for mover, negative bad
}

function approximateGamePly(pieces) {
  let total = 0;
  for (const p of pieces) total += (p.moveCount || 0);
  return Math.floor(total / 2);
}

function countUnmovedFriendly(pieces, side) {
  let count = 0;
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if ((p.moveCount || 0) === 0) count += 1;
  }
  return count;
}

function collapseNarrowingPenalty(prevPieces, mv, side) {
  if (mv.type !== 'move') return 0;
  const fromSq = mv.from;
  const toSq = mv.to;
  const before = getPieceAtSquare(prevPieces, fromSq);
  if (!before || before.side !== side) return 0;
  const after = getPieceAtSquare(mv.resultPieces, toSq);
  if (!after || after.side !== side) return 0;
  const beforeCount = (before.possibleTypes || []).length;
  const afterTypes = Array.isArray(after.possibleTypes) ? after.possibleTypes : [];
  const afterCount = afterTypes.length;
  if (afterCount >= beforeCount) return 0;

  const early = approximateGamePly(prevPieces) <= EARLY_GAME_PLY_THRESHOLD;
  const narrowed = Math.max(0, beforeCount - afterCount);
  const isCapture = isCaptureMove(prevPieces, mv.resultPieces);
  if (isCapture) return 0; // allow tactical narrowing

  let mult = 1;
  if (afterCount === 1) mult *= SINGLE_TYPE_COLLAPSE_MULTIPLIER;
  if (afterCount === 2) mult *= DOUBLE_TYPE_COLLAPSE_MULTIPLIER;

  const isBQ = afterCount === 2 && afterTypes.includes('b') && afterTypes.includes('q');
  if (isBQ) mult *= BQ_DOUBLE_TYPE_DISCOUNT;

  if (early && afterCount === 1 && afterTypes[0] === 'n') {
    mult += KNIGHT_SINGLE_COLLAPSE_EXTRA; // avoid early pure-knight collapses
  }

  return narrowed * COLLAPSE_OVER_NARROW_PENALTY * mult;
}

// --- Capture value helpers for ordering ---
function listNewCaptures(prevPieces, nextPieces) {
  const prevMap = new Map();
  for (const p of prevPieces) prevMap.set(p.id, p);
  const newly = [];
  for (const n of nextPieces) {
    const prev = prevMap.get(n.id);
    if (prev && !prev.captured && n.captured) newly.push(n);
  }
  return newly;
}

function capturedValueDelta(prevPieces, nextPieces, moverSide) {
  const newly = listNewCaptures(prevPieces, nextPieces);
  let gain = 0;
  for (const p of newly) {
    // If the newly captured piece belongs to the opponent, it's our gain.
    if (p.side !== moverSide) {
      const t = Array.isArray(p.possibleTypes) && p.possibleTypes.length > 0 ? p.possibleTypes[0] : 'p';
      gain += CAPTURE_VALUES[t] || 0;
    }
  }
  return gain;
}

function orderMoves(moves, currentEval, side, prevPieces) {
  const sign = side === 'white' ? 1 : -1;
  const early = approximateGamePly(prevPieces) <= EARLY_GAME_PLY_THRESHOLD;
  const unmovedFriends = countUnmovedFriendly(prevPieces, side);

  const ranked = moves
    .map((m) => {
      const nextEval = evaluatePosition(m.resultPieces);
      const isCap = isCaptureMove(prevPieces, m.resultPieces);
      const capBonus = isCap ? CAPTURE_ORDER_BONUS : 0;
      const capValueBonus = isCap ? CAPTURE_VALUE_ORDER_BONUS * capturedValueDelta(prevPieces, m.resultPieces, side) : 0;
      const castleBonus = m.type === 'castle' ? 0.25 : 0;

      // SEE-based landing risk assessment
      let seeScore = 0;
      let riskNet = 0;
      if (m.type === 'move') {
        riskNet = seeNetForLandingSquare(m.resultPieces, side, m.to);
        if (riskNet < 0) seeScore -= SEE_RISK_WEIGHT * (-riskNet);
        else if (riskNet > 0) seeScore += SEE_GOOD_WEIGHT * riskNet;
      }

      // Development diversity: prefer moving new pieces; avoid spamming the same piece
      let devScore = 0;
      if (m.type === 'move') {
        const moverBefore = getPieceAtSquare(prevPieces, m.from);
        if (moverBefore) {
          const movedCount = moverBefore.moveCount || 0;
          if (movedCount === 0) devScore += FRESH_DEVELOPMENT_BONUS;
          // Penalize repeated movers earlier and when there are many unmoved pieces
          if (movedCount > 0) {
            const baseRepeat = REPEAT_MOVER_PENALTY * Math.min(3, movedCount);
            const breadthFactor = early ? Math.max(0.75, unmovedFriends / 10) : Math.max(0.5, unmovedFriends / 12);
            devScore -= baseRepeat * breadthFactor;
          }
        }
      }

      // Encourage leaving Pawn in superposition after the move
      let pawnRetention = 0;
      if (m.type === 'move') {
        const afterMover = getPieceAtSquare(m.resultPieces, m.to);
        if (afterMover && afterMover.side === side && Array.isArray(afterMover.possibleTypes) && afterMover.possibleTypes.includes('p')) {
          pawnRetention += P_RETENTION_ORDER_BONUS;
        }
      }

      // Check bonus aligned with checking rules
      let checkBonus = 0;
      if (m.type === 'move' || m.type === 'castle') {
        const nextSide = side === 'white' ? 'black' : 'white';
        if (isCheckOnSide(m.resultPieces, nextSide)) checkBonus += CHECK_ORDER_BONUS;
      }

      // Penalty for collapsing a broad superposition into a narrow one without compensation
      const collapsePenalty = collapseNarrowingPenalty(prevPieces, m, side);

      // Demote clearly losing captures unless the move scores extremely well otherwise
      let losingCapturePenalty = 0;
      if (isCap && m.type === 'move' && riskNet < LOSING_CAPTURE_DROP_THRESHOLD) {
        const evalGain = sign * (nextEval - currentEval);
        const allowExtreme = checkBonus > 0 || evalGain >= EXTREME_GAIN_THRESHOLD;
        if (!allowExtreme) losingCapturePenalty = LOSING_CAPTURE_HARD_PENALTY;
      }

      // Small random jitter to avoid deterministic openings
      const jitter = (Math.random() - 0.5) * RANDOM_MOVE_JITTER;

      const score = sign * (nextEval - currentEval) + capBonus + capValueBonus + castleBonus + seeScore + devScore + pawnRetention + checkBonus - collapsePenalty - losingCapturePenalty + jitter;
      return { m, score, meta: { isCap, capValue: capValueBonus / (CAPTURE_VALUE_ORDER_BONUS || 1), seeScore, devScore, collapsePenalty, losingCapturePenalty } };
    })
    .sort((a, b) => b.score - a.score);

  if (DEBUG_AI) {
    try {
      const top = ranked.slice(0, Math.min(8, ranked.length));
      // eslint-disable-next-line no-console
      console.debug('[AI][orderMoves]', {
        side,
        early,
        unmovedFriends,
        top: top.map((x) => ({
          type: x.m.type,
          from: x.m.from || (x.m.plan ? `${x.m.plan.piece1_from},${x.m.plan.piece2_from}` : ''),
          to: x.m.to || (x.m.plan ? `${x.m.plan.piece1_to},${x.m.plan.piece2_to}` : ''),
          score: Number(x.score.toFixed(3)),
          isCap: x.meta.isCap,
          capValue: x.meta.capValue,
          see: Number(x.meta.seeScore.toFixed(3)),
          dev: Number(x.meta.devScore.toFixed(3)),
          collapse: Number(x.meta.collapsePenalty.toFixed(3)),
          loseCap: Number((x.meta.losingCapturePenalty || 0).toFixed(3)),
        }))
      });
    } catch (_) {}
  }

  return ranked.map((x) => x.m);
}

function quiescenceSearch(pieces, side, alpha, beta, rootSide, qPlies) {
  const standPatVal = evaluatePosition(pieces);
  const standPat = (rootSide === 'white' ? 1 : -1) * standPatVal;

  if (standPat >= beta) return { score: beta, move: null };
  if (alpha < standPat) alpha = standPat;
  if (qPlies <= 0) return { score: standPat, move: null };

  const caps = generateCapturingReplies(pieces, side);
  if (caps.length === 0) return { score: standPat, move: null };

  // Order capture moves greedily using evaluation delta and SEE
  const ordered = orderMoves(caps, standPatVal, side, pieces);

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
  const ordered = orderMoves(replies, currentEval, side, pieces);

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
  const depth = difficulty === 'hard' ? 4 : difficulty === 'easy' ? 1 : 3;
  const rootPieces = clonePieces(pieces);
  const rootSide = sideToMove;

  const res = alphaBeta(rootPieces, rootSide, depth, -Infinity, Infinity, rootSide);

  // Controlled randomness at root: occasionally select among the top few ordered moves
  try {
    const legal = generateLegalReplies(rootPieces, rootSide, 0);
    if (Array.isArray(legal) && legal.length > 0) {
      const currentEval = evaluatePosition(rootPieces);
      const ordered = orderMoves(legal, currentEval, rootSide, rootPieces);
      const top = ordered.slice(0, Math.min(3, ordered.length));
      const prob = difficulty === 'easy' ? 0.7 : difficulty === 'medium' ? 0.3 : 0.1;
      let chosen = res.move || null;
      if (top.length > 1 && Math.random() < prob) {
        chosen = top[Math.floor(Math.random() * top.length)] || res.move || null;
      }
      if (DEBUG_AI) {
        try {
          const pick = chosen || null;
          // eslint-disable-next-line no-console
          console.debug('[AI][rootPick]', {
            side: rootSide,
            depth,
            difficulty,
            chosen: pick ? { type: pick.type, from: pick.from || (pick.plan ? `${pick.plan.piece1_from},${pick.plan.piece2_from}` : ''), to: pick.to || (pick.plan ? `${pick.plan.piece1_to},${pick.plan.piece2_to}` : '') } : null,
          });
        } catch (_) {}
      }
      return chosen;
    }
  } catch (_) {
    // ignore randomness fallback errors
  }

  if (DEBUG_AI) {
    try {
      const mv = res.move || null;
      // eslint-disable-next-line no-console
      console.debug('[AI][rootPickFallback]', {
        side: rootSide,
        move: mv ? { type: mv.type, from: mv.from || (mv.plan ? `${mv.plan.piece1_from},${mv.plan.piece2_from}` : ''), to: mv.to || (mv.plan ? `${mv.plan.piece1_to},${mv.plan.piece2_to}` : '') } : null,
      });
    } catch (_) {}
  }

  return res.move || null;
}
