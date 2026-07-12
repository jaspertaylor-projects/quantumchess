// frontend/src/chessboard/engineGeometry.js
// Purpose: Movement geometry — per-type "moves" walks (blockers stop rays,
// own pieces excluded) and "attacks" walks (blocker squares included; threat
// maps care about reach, not landability), plus the occupancy map and the
// merged-destination helpers built on them. Split out of quantumEngine.js
// (which re-exports the public API).
// Imports From: ./boardUtils.js
// Exported To: ./quantumEngine.js

import { fromAlgebraic, toAlgebraic } from './boardUtils.js';

function inBounds(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function keySquare(file, rank) {
  return toAlgebraic(file, rank);
}

export function buildOccupancy(pieces) {
  const map = new Map();
  for (const p of pieces) {
    if (p.captured) continue;
    if (!p.square) continue;
    map.set(p.square, p);
  }
  return map;
}

const ORTHO_DELTAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG_DELTAS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const QUEEN_DELTAS = [...ORTHO_DELTAS, ...DIAG_DELTAS];
const KING_STEPS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], /*self*/ [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
const KNIGHT_STEPS = [
  [-1, -2], [1, -2], [-2, -1], [2, -1],
  [-2, 1], [2, 1], [-1, 2], [1, 2],
];

function rayMoves(file, rank, deltas, occ, side) {
  const results = [];
  for (const [df, dr] of deltas) {
    let f = file + df;
    let r = rank + dr;
    while (inBounds(f, r)) {
      const sq = keySquare(f, r);
      const blocker = occ.get(sq);
      if (blocker) {
        if (blocker.side !== side) results.push(sq);
        break;
      }
      results.push(sq);
      f += df;
      r += dr;
    }
  }
  return results;
}

function rayAttacks(file, rank, deltas, occ) {
  const results = [];
  for (const [df, dr] of deltas) {
    let f = file + df;
    let r = rank + dr;
    while (inBounds(f, r)) {
      const sq = keySquare(f, r);
      const blocker = occ.get(sq);
      results.push(sq);
      if (blocker) break;
      f += df;
      r += dr;
    }
  }
  return results;
}

function stepMoves(file, rank, steps, occ, side) {
  const out = [];
  for (const [df, dr] of steps) {
    const f = file + df;
    const r = rank + dr;
    if (!inBounds(f, r)) continue;
    const sq = keySquare(f, r);
    const blocker = occ.get(sq);
    if (!blocker || blocker.side !== side) out.push(sq);
  }
  return out;
}

function stepAttacks(file, rank, steps) {
  const out = [];
  for (const [df, dr] of steps) {
    const f = file + df;
    const r = rank + dr;
    if (!inBounds(f, r)) continue;
    out.push(keySquare(f, r));
  }
  return out;
}

function pawnMoves(file, rank, occ, side) {
  const dir = side === 'white' ? 1 : -1;
  const out = [];

  const one = [file, rank + dir];
  if (inBounds(one[0], one[1])) {
    const oneSq = keySquare(one[0], one[1]);
    if (!occ.get(oneSq)) out.push(oneSq);
  }

  // Double step: legal from anywhere in the side's own first two ranks —
  // the rule was never "on the pawn's first move". Classically identical
  // (pawns are born on rank two and can never move backward), but a quantum
  // maybe-pawn genuinely stands on the back rank, and it inherits the same
  // right. The old isFirstMove gate is retired.
  const onHomeRanks = side === 'white' ? rank <= 1 : rank >= 6;
  const two = [file, rank + 2 * dir];
  if (onHomeRanks && inBounds(two[0], two[1])) {
    const midSq = keySquare(file, rank + dir);
    const twoSq = keySquare(two[0], two[1]);
    if (!occ.get(midSq) && !occ.get(twoSq)) out.push(twoSq);
  }

  const captures = [
    [file - 1, rank + dir],
    [file + 1, rank + dir],
  ];
  for (const [f, r] of captures) {
    if (!inBounds(f, r)) continue;
    const sq = keySquare(f, r);
    const blk = occ.get(sq);
    if (blk && blk.side !== side) out.push(sq);
  }

  return out;
}

function pawnAttacks(file, rank, side) {
  const dir = side === 'white' ? 1 : -1;
  const out = [];
  const captures = [
    [file - 1, rank + dir],
    [file + 1, rank + dir],
  ];
  for (const [f, r] of captures) {
    if (!inBounds(f, r)) continue;
    out.push(keySquare(f, r));
  }
  return out;
}

// `options.isFirstMove` is still accepted from callers but no longer
// consulted — pawn double-step rights are positional now (see pawnMoves).
export function movesForType(t, file, rank, occ, side, options = {}) {
  switch (t) {
    case 'p':
      return pawnMoves(file, rank, occ, side);
    case 'n':
      return stepMoves(file, rank, KNIGHT_STEPS, occ, side);
    case 'b':
      return rayMoves(file, rank, DIAG_DELTAS, occ, side);
    case 'r':
      return rayMoves(file, rank, ORTHO_DELTAS, occ, side);
    case 'q':
      return rayMoves(file, rank, QUEEN_DELTAS, occ, side);
    case 'k':
      return stepMoves(file, rank, KING_STEPS, occ, side);
    default:
      return [];
  }
}

export function attacksForType(t, file, rank, occ, side) {
  switch (t) {
    case 'p':
      return pawnAttacks(file, rank, side);
    case 'n':
      return stepAttacks(file, rank, KNIGHT_STEPS);
    case 'b':
      return rayAttacks(file, rank, DIAG_DELTAS, occ);
    case 'r':
      return rayAttacks(file, rank, ORTHO_DELTAS, occ);
    case 'q':
      return rayAttacks(file, rank, QUEEN_DELTAS, occ);
    case 'k':
      return stepAttacks(file, rank, KING_STEPS);
    default:
      return [];
  }
}

export function subsetTypesThatCanMakeMove(types, fromFile, fromRank, toFile, toRank, occ, side, isFirstMove = false) {
  const toSq = keySquare(toFile, toRank);
  const subset = [];
  for (const t of types) {
    const candidateMoves = movesForType(t, fromFile, fromRank, occ, side, { isFirstMove });
    if (candidateMoves.includes(toSq)) subset.push(t);
  }
  return subset;
}

// Union of destination squares across a piece's remaining possible types —
// the move set the UI, reply generator, and measurement pulse all share.
export function mergedDestinations(piece, occ, options = {}) {
  const merged = new Set();
  const pos = fromAlgebraic(piece.square);
  if (!pos) return merged;
  for (const t of piece.possibleTypes) {
    const list = movesForType(t, pos.fileIndex, pos.rankIndex, occ, piece.side, options);
    for (const sq of list) merged.add(sq);
  }
  return merged;
}
