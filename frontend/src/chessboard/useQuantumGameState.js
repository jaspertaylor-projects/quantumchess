// frontend/src/chessboard/useQuantumGameState.js
// Purpose: Manage Quantum Chess game state, including pieces, movement generation, captures, collapse-on-move subset logic, turn order, and global type-capacity collapse.
// Imports From: ./boardUtils.js, ./gameConstants.js
// Exported To: ../App.jsx

import { useCallback, useMemo, useState } from 'react';
import { fromAlgebraic, toAlgebraic } from './boardUtils.js';
import {
  createStartingPieces,
  CAPTURE_COLLAPSE_ORDER,
  PIECE_TYPES,
  PIECE_LIMITS,
} from './gameConstants.js';

function keySquare(file, rank) {
  return toAlgebraic(file, rank);
}

function addVec([f, r], [df, dr]) {
  return [f + df, r + dr];
}

function inBounds(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function buildOccupancy(pieces) {
  const map = new Map();
  for (const p of pieces) {
    if (p.captured) continue;
    map.set(p.square, p);
  }
  return map;
}

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

function kingMoves(file, rank, occ, side) {
  const steps = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], /*self*/ [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
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

function knightMoves(file, rank, occ, side) {
  const deltas = [
    [-1, -2], [1, -2], [-2, -1], [2, -1],
    [-2, 1], [2, 1], [-1, 2], [1, 2],
  ];
  const out = [];
  for (const [df, dr] of deltas) {
    const f = file + df;
    const r = rank + dr;
    if (!inBounds(f, r)) continue;
    const sq = keySquare(f, r);
    const blocker = occ.get(sq);
    if (!blocker || blocker.side !== side) out.push(sq);
  }
  return out;
}

function pawnMoves(file, rank, occ, side) {
  const dir = side === 'white' ? 1 : -1;
  const startRank = side === 'white' ? 1 : 6;
  const out = [];

  const one = [file, rank + dir];
  if (inBounds(one[0], one[1])) {
    const oneSq = keySquare(one[0], one[1]);
    if (!occ.get(oneSq)) out.push(oneSq);
  }

  const two = [file, rank + 2 * dir];
  if (rank === startRank && inBounds(two[0], two[1])) {
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

function rookMoves(file, rank, occ, side) {
  const deltas = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return rayMoves(file, rank, deltas, occ, side);
}

function bishopMoves(file, rank, occ, side) {
  const deltas = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  return rayMoves(file, rank, deltas, occ, side);
}

function queenMoves(file, rank, occ, side) {
  return [
    ...rookMoves(file, rank, occ, side),
    ...bishopMoves(file, rank, occ, side),
  ];
}

function movesForType(t, file, rank, occ, side) {
  switch (t) {
    case 'p':
      return pawnMoves(file, rank, occ, side);
    case 'n':
      return knightMoves(file, rank, occ, side);
    case 'b':
      return bishopMoves(file, rank, occ, side);
    case 'r':
      return rookMoves(file, rank, occ, side);
    case 'q':
      return queenMoves(file, rank, occ, side);
    case 'k':
      return kingMoves(file, rank, occ, side);
    default:
      return [];
  }
}

function subsetTypesThatCanMakeMove(types, fromFile, fromRank, toFile, toRank, occ, side) {
  const toSq = keySquare(toFile, toRank);
  const subset = [];
  for (const t of types) {
    const candidateMoves = movesForType(t, fromFile, fromRank, occ, side);
    if (candidateMoves.includes(toSq)) subset.push(t);
  }
  return subset;
}

function clonePieces(pieces) {
  return pieces.map((p) => ({ ...p, possibleTypes: [...p.possibleTypes] }));
}

function computeConfirmedCountsForSide(pieces, side) {
  const counts = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const p of pieces) {
    if (p.side !== side) continue;
    if (p.possibleTypes.length === 1) {
      const t = p.possibleTypes[0];
      if (counts[t] !== undefined) counts[t] += 1;
    }
  }
  return counts;
}

function computeRemainingCapacityForSide(pieces, side) {
  const confirmed = computeConfirmedCountsForSide(pieces, side);
  const remaining = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const t of PIECE_TYPES) {
    const cap = PIECE_LIMITS[t] - (confirmed[t] || 0);
    remaining[t] = Math.max(0, cap);
  }
  return remaining;
}

function sumCapacity(remaining, typeSet) {
  let s = 0;
  for (const t of typeSet) s += remaining[t] || 0;
  return s;
}

function powersetTypes(allTypes) {
  const sets = [];
  const n = allTypes.length;
  const total = 1 << n;
  for (let mask = 1; mask < total; mask++) {
    const subset = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(allTypes[i]);
    sets.push(subset);
  }
  return sets;
}

function enforceGlobalTypeConstraintsOnce(pieces) {
  // Process each side independently to avoid cross-pollination.
  const updated = clonePieces(pieces);
  const sides = ['white', 'black'];

  for (const side of sides) {
    let changed = true;
    while (changed) {
      changed = false;

      const remaining = computeRemainingCapacityForSide(updated, side);

      // Step 1: Remove types with zero remaining capacity from non-confirmed pieces of this side.
      for (const p of updated) {
        if (p.side !== side) continue;
        if (p.possibleTypes.length <= 1) continue;
        const before = p.possibleTypes.length;
        const filtered = p.possibleTypes.filter((t) => (remaining[t] || 0) > 0);
        if (filtered.length > 0 && filtered.length !== before) {
          p.possibleTypes = filtered;
          changed = true;
        }
      }

      // Step 2: Subset saturation (Hall-like) pruning.
      // Consider all subsets S of piece-types; if exactly cap(S) pieces have domains within S,
      // then all other pieces cannot use any type in S.
      const candidatePieces = updated.filter(
        (p) => p.side === side && !p.captured && p.possibleTypes.length >= 1 && p.possibleTypes.length <= PIECE_TYPES.length
      );

      // Skip if no candidates or nothing left to allocate.
      const totalRemaining = sumCapacity(remaining, PIECE_TYPES);
      if (candidatePieces.length === 0 || totalRemaining === 0) continue;

      for (const S of powersetTypes(PIECE_TYPES)) {
        const capS = sumCapacity(remaining, S);
        if (capS === 0) continue;

        // Pieces whose entire domain is contained in S
        const group = [];
        for (const p of candidatePieces) {
          // Only consider non-confirmed pieces for the group evaluation
          if (p.possibleTypes.length === 1) continue;
          let subset = true;
          for (const t of p.possibleTypes) {
            if (!S.includes(t)) {
              subset = false;
              break;
            }
          }
          if (subset) group.push(p);
        }

        if (group.length === 0) continue;

        if (group.length === capS) {
          // The group will consume all capacity in S; prune S from all other pieces
          for (const p of candidatePieces) {
            if (group.includes(p)) continue;
            if (p.possibleTypes.length <= 1) continue;
            const before = p.possibleTypes.length;
            const reduced = p.possibleTypes.filter((t) => !S.includes(t));
            if (reduced.length > 0 && reduced.length !== before) {
              p.possibleTypes = reduced;
              changed = true;
            }
          }
        }
      }
    }
  }

  return updated;
}

function enforceGlobalTypeConstraintsToFixpoint(pieces) {
  let current = clonePieces(pieces);
  // Iterate to a global fixpoint across both sides.
  while (true) {
    const next = enforceGlobalTypeConstraintsOnce(current);
    let diff = false;
    for (let i = 0; i < current.length; i++) {
      const a = current[i].possibleTypes;
      const b = next[i].possibleTypes;
      if (a.length !== b.length) {
        diff = true;
        break;
      }
      for (let j = 0; j < a.length; j++) {
        if (a[j] !== b[j]) {
          diff = true;
          break;
        }
      }
      if (diff) break;
    }
    if (!diff) return next;
    current = next;
  }
}

export default function useQuantumGameState() {
  const [pieces, setPieces] = useState(() => createStartingPieces());
  const [sideToMove, setSideToMove] = useState('white');

  const occupancy = useMemo(() => buildOccupancy(pieces), [pieces]);

  const getPieceAtSquare = useCallback((square) => {
    return occupancy.get(square) || null;
  }, [occupancy]);

  const getLegalMoves = useCallback((pieceId) => {
    const piece = pieces.find((p) => p.id === pieceId && !p.captured);
    if (!piece) return [];
    if (piece.side !== sideToMove) return [];
    const pos = fromAlgebraic(piece.square);
    if (!pos) return [];
    const { fileIndex: f, rankIndex: r } = pos;

    const merged = new Set();
    for (const t of piece.possibleTypes) {
      const list = movesForType(t, f, r, occupancy, piece.side);
      for (const sq of list) merged.add(sq);
    }
    return Array.from(merged);
  }, [pieces, occupancy, sideToMove]);

  const movePiece = useCallback((pieceId, toSquare) => {
    const prevPieces = pieces;
    const next = prevPieces.map((p) => ({ ...p, possibleTypes: [...p.possibleTypes] }));
    const moving = next.find((p) => p.id === pieceId && !p.captured);
    if (!moving) return;
    if (moving.side !== sideToMove) return;

    const from = fromAlgebraic(moving.square);
    const to = fromAlgebraic(toSquare);
    if (!from || !to) return;

    const tempOcc = buildOccupancy(next);

    const subset = subsetTypesThatCanMakeMove(
      moving.possibleTypes,
      from.fileIndex,
      from.rankIndex,
      to.fileIndex,
      to.rankIndex,
      tempOcc,
      moving.side
    );

    if (subset.length === 0) return;

    const targetPiece = tempOcc.get(toSquare);
    if (targetPiece && targetPiece.side !== moving.side) {
      const highest = CAPTURE_COLLAPSE_ORDER.find((t) => targetPiece.possibleTypes.includes(t));
      targetPiece.captured = true;
      targetPiece.square = null;
      targetPiece.possibleTypes = highest ? [highest] : ['p'];
    }

    moving.square = toSquare;
    moving.possibleTypes = subset;

    const constrained = enforceGlobalTypeConstraintsToFixpoint(next);

    setPieces(constrained);
    setSideToMove((s) => (s === 'white' ? 'black' : 'white'));
  }, [pieces, sideToMove]);

  return {
    pieces,
    sideToMove,
    getPieceAtSquare,
    getLegalMoves,
    movePiece,
  };
}
