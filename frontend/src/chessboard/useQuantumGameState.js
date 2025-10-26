// frontend/src/chessboard/useQuantumGameState.js
// Purpose: Manage Quantum Chess game state, including pieces, movement generation, simple captures, and collapse-on-move subset logic.
// Imports From: ./boardUtils.js, ./gameConstants.js
// Exported To: ../App.jsx

import { useCallback, useMemo, useState } from 'react';
import { fromAlgebraic, toAlgebraic } from './boardUtils.js';
import {
  createStartingPieces,
  CAPTURE_COLLAPSE_ORDER,
  PIECE_TYPES,
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

export default function useQuantumGameState() {
  const [pieces, setPieces] = useState(() => createStartingPieces());

  const occupancy = useMemo(() => buildOccupancy(pieces), [pieces]);

  const getPieceAtSquare = useCallback((square) => {
    return occupancy.get(square) || null;
  }, [occupancy]);

  const getLegalMoves = useCallback((pieceId) => {
    const piece = pieces.find((p) => p.id === pieceId && !p.captured);
    if (!piece) return [];
    const pos = fromAlgebraic(piece.square);
    if (!pos) return [];
    const { fileIndex: f, rankIndex: r } = pos;

    const merged = new Set();
    for (const t of piece.possibleTypes) {
      const list = movesForType(t, f, r, occupancy, piece.side);
      for (const sq of list) merged.add(sq);
    }
    return Array.from(merged);
  }, [pieces, occupancy]);

  const movePiece = useCallback((pieceId, toSquare) => {
    setPieces((prev) => {
      const next = prev.map((p) => ({ ...p }));
      const moving = next.find((p) => p.id === pieceId && !p.captured);
      if (!moving) return prev;

      const from = fromAlgebraic(moving.square);
      const to = fromAlgebraic(toSquare);
      if (!from || !to) return prev;

      const tempOcc = buildOccupancy(next);

      // Determine subset of types that could legally make this move now
      const subset = subsetTypesThatCanMakeMove(
        moving.possibleTypes,
        from.fileIndex,
        from.rankIndex,
        to.fileIndex,
        to.rankIndex,
        tempOcc,
        moving.side
      );

      if (subset.length === 0) return prev;

      // Handle capture if an enemy occupies the target square
      const targetPiece = tempOcc.get(toSquare);
      if (targetPiece && targetPiece.side !== moving.side) {
        // Collapse capture target to its highest non-king value and mark captured
        const highest = CAPTURE_COLLAPSE_ORDER.find((t) => targetPiece.possibleTypes.includes(t));
        targetPiece.captured = true;
        targetPiece.square = null;
        targetPiece.possibleTypes = highest ? [highest] : ['p'];
      }

      // Update moving piece
      moving.square = toSquare;
      moving.possibleTypes = subset;

      return next;
    });
  }, []);

  return {
    pieces,
    getPieceAtSquare,
    getLegalMoves,
    movePiece,
  };
}
