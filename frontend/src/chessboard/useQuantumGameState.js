// frontend/src/chessboard/useQuantumGameState.js
// Purpose: Manage Quantum Chess state: pieces, legal moves, captures (least-value collapse), move-driven collapse, turn order, global type-capacity collapse, and check threat logic with overlays and post-move king removal on threatened squares.
// Imports From: ./boardUtils.js, ./gameConstants.js
// Exported To: ../App.jsx

import { useCallback, useMemo, useRef, useState } from 'react';
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

// Attack-map version of ray traversal: includes the first blocker square regardless of side, and does not skip own-occupied squares.
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

function kingAttacks(file, rank) {
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
    out.push(keySquare(f, r));
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

function knightAttacks(file, rank) {
  const deltas = [
    [-1, -2], [1, -2], [-2, -1], [2, -1],
    [-2, 1], [2, 1], [-1, 2], [1, 2],
  ];
  const out = [];
  for (const [df, dr] of deltas) {
    const f = file + df;
    const r = rank + dr;
    if (!inBounds(f, r)) continue;
    out.push(keySquare(f, r));
  }
  return out;
}

function pawnMoves(file, rank, occ, side, isFirstMove = false) {
  const dir = side === 'white' ? 1 : -1;
  const out = [];

  const one = [file, rank + dir];
  if (inBounds(one[0], one[1])) {
    const oneSq = keySquare(one[0], one[1]);
    if (!occ.get(oneSq)) out.push(oneSq);
  }

  // Two-square advance is allowed on this piece's first move regardless of starting rank
  const two = [file, rank + 2 * dir];
  if (isFirstMove && inBounds(two[0], two[1])) {
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

function rookMoves(file, rank, occ, side) {
  const deltas = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return rayMoves(file, rank, deltas, occ, side);
}

function rookAttacks(file, rank, occ) {
  const deltas = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return rayAttacks(file, rank, deltas, occ);
}

function bishopMoves(file, rank, occ, side) {
  const deltas = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  return rayMoves(file, rank, deltas, occ, side);
}

function bishopAttacks(file, rank, occ) {
  const deltas = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  return rayAttacks(file, rank, deltas, occ);
}

function queenMoves(file, rank, occ, side) {
  return [
    ...rookMoves(file, rank, occ, side),
    ...bishopMoves(file, rank, occ, side),
  ];
}

function queenAttacks(file, rank, occ) {
  return [
    ...rookAttacks(file, rank, occ),
    ...bishopAttacks(file, rank, occ),
  ];
}

function movesForType(t, file, rank, occ, side, options = {}) {
  const { isFirstMove = false } = options;
  switch (t) {
    case 'p':
      return pawnMoves(file, rank, occ, side, isFirstMove);
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

function attacksForType(t, file, rank, occ, side) {
  switch (t) {
    case 'p':
      return pawnAttacks(file, rank, side);
    case 'n':
      return knightAttacks(file, rank);
    case 'b':
      return bishopAttacks(file, rank, occ);
    case 'r':
      return rookAttacks(file, rank, occ);
    case 'q':
      return queenAttacks(file, rank, occ);
    case 'k':
      return kingAttacks(file, rank);
    default:
      return [];
  }
}

function subsetTypesThatCanMakeMove(types, fromFile, fromRank, toFile, toRank, occ, side, isFirstMove = false) {
  const toSq = keySquare(toFile, toRank);
  const subset = [];
  for (const t of types) {
    const candidateMoves = movesForType(t, fromFile, fromRank, occ, side, { isFirstMove });
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
  for (const t of typeSet) s += (remaining[t] || 0);
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
  const updated = clonePieces(pieces);
  const sides = ['white', 'black'];

  for (const side of sides) {
    let changed = true;
    while (changed) {
      changed = false;

      const remaining = computeRemainingCapacityForSide(updated, side);

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

      const candidatePieces = updated.filter(
        (p) => p.side === side && !p.captured && p.possibleTypes.length >= 1 && p.possibleTypes.length <= PIECE_TYPES.length
      );

      const totalRemaining = sumCapacity(remaining, PIECE_TYPES);
      if (candidatePieces.length === 0 || totalRemaining === 0) continue;

      for (const S of powersetTypes(PIECE_TYPES)) {
        const capS = sumCapacity(remaining, S);
        if (capS === 0) continue;

        const group = [];
        for (const p of candidatePieces) {
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

function computeThreatenedSquaresForSide(pieces, side) {
  const occ = buildOccupancy(pieces);
  const threatened = new Set();
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const types = p.possibleTypes || [];
    if (types.length === 0) continue;
    // Only pieces with two or fewer possibilities exert check
    if (types.length > 2) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    for (const t of types) {
      const atk = attacksForType(t, f, r, occ, p.side);
      for (const sq of atk) threatened.add(sq);
    }
  }
  return threatened;
}

export default function useQuantumGameState() {
  const [pieces, setPieces] = useState(() => createStartingPieces());
  const [sideToMove, setSideToMove] = useState('white');
  const [captureCounter, setCaptureCounter] = useState(0);

  // Prevent duplicate application of the same move within a render/commit cycle
  const lastMoveSignatureRef = useRef(null);

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

    const isFirstMove = (piece.moveCount || 0) === 0;

    const merged = new Set();
    for (const t of piece.possibleTypes) {
      const list = movesForType(t, f, r, occupancy, piece.side, { isFirstMove });
      for (const sq of list) merged.add(sq);
    }
    return Array.from(merged);
  }, [pieces, occupancy, sideToMove]);

  const checkingSquaresBySide = useMemo(() => {
    const whiteThreats = computeThreatenedSquaresForSide(pieces, 'white');
    const blackThreats = computeThreatenedSquaresForSide(pieces, 'black');
    return {
      white: Array.from(whiteThreats),
      black: Array.from(blackThreats),
    };
  }, [pieces]);

  const movePiece = useCallback((pieceId, toSquare) => {
    const prevPieces = pieces;
    const next = prevPieces.map((p) => ({ ...p, possibleTypes: [...p.possibleTypes] }));
    const moving = next.find((p) => p.id === pieceId && !p.captured);
    if (!moving) return false;
    if (moving.side !== sideToMove) return false;

    const from = fromAlgebraic(moving.square);
    const to = fromAlgebraic(toSquare);
    if (!from || !to) return false;

    // Guard against duplicate invocation of the same move (e.g., Strict Mode/dev double effects)
    const fromSquareAlg = moving.square;
    const moveSignature = `${sideToMove}:${pieceId}:${fromSquareAlg}->${toSquare}`;
    if (lastMoveSignatureRef.current === moveSignature) return false;

    const tempOcc = buildOccupancy(next);

    const isFirstMove = (moving.moveCount || 0) === 0;

    const subset = subsetTypesThatCanMakeMove(
      moving.possibleTypes,
      from.fileIndex,
      from.rankIndex,
      to.fileIndex,
      to.rankIndex,
      tempOcc,
      moving.side,
      isFirstMove
    );

    if (subset.length === 0) return false;

    const targetPiece = tempOcc.get(toSquare);
    if (targetPiece && targetPiece.side !== moving.side) {
      const least = CAPTURE_COLLAPSE_ORDER.find((t) => targetPiece.possibleTypes.includes(t));
      targetPiece.captured = true;
      targetPiece.square = null;
      targetPiece.possibleTypes = least ? [least] : ['p'];
      targetPiece.captureIndex = captureCounter;
    }

    moving.square = toSquare;
    moving.possibleTypes = subset;
    moving.moveCount = (moving.moveCount || 0) + 1;

    // Enforce global type constraints to a fixpoint after the move and capture collapse
    const constrained = enforceGlobalTypeConstraintsToFixpoint(next);

    // After a move, you cannot leave your king in check.
    // Remove 'k' from mover-side pieces that sit on squares threatened by the opponent's checking pieces.
    const moverSide = moving.side;
    const opponentSide = moverSide === 'white' ? 'black' : 'white';
    const oppThreats = computeThreatenedSquaresForSide(constrained, opponentSide);

    const afterCheck = constrained.map((p) => {
      if (p.captured || p.side !== moverSide || !p.square) return p;
      if (p.possibleTypes.length <= 0) return p;
      if (!p.possibleTypes.includes('k')) return p;
      if (!oppThreats.has(p.square)) return p;
      // Avoid emptying the set; if 'k' is the only possibility, leave as-is to prevent invalid state.
      if (p.possibleTypes.length === 1) return p;
      const filtered = p.possibleTypes.filter((t) => t !== 'k');
      return { ...p, possibleTypes: filtered };
    });

    const finalPieces = enforceGlobalTypeConstraintsToFixpoint(afterCheck);

    // Commit state updates atomically
    setPieces(finalPieces);
    setSideToMove((s) => (s === 'white' ? 'black' : 'white'));
    if (targetPiece && targetPiece.captured) {
      setCaptureCounter((c) => c + 1);
    }

    // Mark this signature as applied to prevent duplicate applications in the same cycle
    lastMoveSignatureRef.current = moveSignature;

    return true;
  }, [pieces, sideToMove, captureCounter]);

  return {
    pieces,
    sideToMove,
    getPieceAtSquare,
    getLegalMoves,
    movePiece,
    checkingSquaresBySide,
  };
}
