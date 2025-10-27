// frontend/src/chessboard/useQuantumGameState.js
// Purpose: Manage Quantum Chess state with an immutable timeline. Enforces collapse, dynamic promotion-aware global capacities, check pruning, and flexible castling.
// Imports From: ./boardUtils.js, ./gameConstants.js
// Exported To: ../App.jsx

import { useCallback, useMemo, useRef, useState } from 'react';
import { fromAlgebraic, toAlgebraic } from './boardUtils.js';
import {
  createStartingPieces,
  CAPTURE_COLLAPSE_ORDER,
  PIECE_TYPES,
  PIECE_LIMITS,
  HEAVY_TYPES,
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
  return pieces.map((p) => ({ ...p, possibleTypes: Array.isArray(p.possibleTypes) ? [...p.possibleTypes] : [] }));
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

function computePromotionCreditsForSide(pieces, side) {
  let credits = 0;
  for (const p of pieces) {
    if (p.side !== side) continue;
    if (p.captured) continue;
    if (p.wasPromoted) credits += 1;
  }
  return credits;
}

function capacityInfoForSide(pieces, side) {
  const confirmed = computeConfirmedCountsForSide(pieces, side);
  const baseRemaining = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const t of PIECE_TYPES) {
    baseRemaining[t] = Math.max(0, (PIECE_LIMITS[t] || 0) - (confirmed[t] || 0));
  }
  const promoTotal = computePromotionCreditsForSide(pieces, side);
  let creditsUsed = 0;
  for (const t of HEAVY_TYPES) {
    const over = Math.max(0, (confirmed[t] || 0) - (PIECE_LIMITS[t] || 0));
    creditsUsed += over;
  }
  const promoCreditsAvailable = Math.max(0, promoTotal - creditsUsed);
  return { baseRemaining, promoCreditsAvailable };
}

function totalCapacityLeft(capInfo) {
  let sum = 0;
  for (const t of PIECE_TYPES) sum += capInfo.baseRemaining[t] || 0;
  sum += capInfo.promoCreditsAvailable;
  return sum;
}

function capacityForSubset(capInfo, subset) {
  let sum = 0;
  let heavy = false;
  for (const t of subset) {
    sum += capInfo.baseRemaining[t] || 0;
    if (HEAVY_TYPES.includes(t)) heavy = true;
  }
  if (heavy) sum += capInfo.promoCreditsAvailable;
  return sum;
}

function enforceGlobalTypeConstraintsOnce(pieces) {
  const updated = clonePieces(pieces);
  const sides = ['white', 'black'];

  for (const side of sides) {
    let changed = true;
    while (changed) {
      changed = false;

      const capInfo = capacityInfoForSide(updated, side);

      for (const p of updated) {
        if (p.side !== side) continue;
        if (p.possibleTypes.length <= 1) continue;
        const before = p.possibleTypes.length;
        const filtered = p.possibleTypes.filter((t) => {
          const base = capInfo.baseRemaining[t] || 0;
          if (HEAVY_TYPES.includes(t)) {
            return base > 0 || capInfo.promoCreditsAvailable > 0;
          }
          return base > 0;
        });
        if (filtered.length > 0 && filtered.length !== before) {
          p.possibleTypes = filtered;
          changed = true;
        }
      }

      const candidatePieces = updated.filter(
        (p) => p.side === side && !p.captured && p.possibleTypes.length >= 1 && p.possibleTypes.length <= PIECE_TYPES.length
      );

      const totalRem = totalCapacityLeft(capInfo);
      if (candidatePieces.length === 0 || totalRem === 0) continue;

      // Evaluate Hall-like constraints with promotion-aware capacities
      const allTypeSets = powersetTypes(PIECE_TYPES);
      for (const S of allTypeSets) {
        const capS = capacityForSubset(capInfo, S);
        if (capS === 0) continue;

        const group = [];
        for (const p of candidatePieces) {
          if (p.possibleTypes.length === 1) continue;
          let subset = true;
          for (const t of p.possibleTypes) {
            if (!S.includes(t)) { subset = false; break; }
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
      if (a.length !== b.length) { diff = true; break; }
      for (let j = 0; j < a.length; j++) { if (a[j] !== b[j]) { diff = true; break; } }
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

export default function useQuantumGameState() {
  // Immutable timeline of snapshots. Index 0 is the starting position (no moves made).
  const [history, setHistory] = useState(() => [{
    pieces: createStartingPieces(),
    sideToMove: 'white',
    captureCounter: 0,
  }]);
  const [viewIndex, setViewIndexState] = useState(0);

  // Prevent duplicate application of the same move within a render/commit cycle
  const lastMoveSignatureRef = useRef(null);

  // Derived state for the current view
  const current = history[Math.min(Math.max(0, viewIndex), history.length - 1)];
  const pieces = current.pieces;
  const sideToMove = current.sideToMove;
  const captureCounter = current.captureCounter;

  const canMakeMove = viewIndex === history.length - 1;

  const setViewIndex = useCallback((idx) => {
    setViewIndexState((prev) => {
      const bounded = Math.max(0, Math.min(idx, history.length - 1));
      if (bounded === prev) return prev;
      return bounded;
    });
  }, [history.length]);

  const pushSnapshot = useCallback((nextPieces, nextSideToMove, nextCaptureCounter) => {
    setHistory((prev) => {
      const snap = {
        pieces: clonePieces(nextPieces),
        sideToMove: nextSideToMove,
        captureCounter: nextCaptureCounter,
      };
      const nextHistory = [...prev, snap];
      setViewIndexState(nextHistory.length - 1);
      return nextHistory;
    });
  }, []);

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
    if (!canMakeMove) return { success: false, reason: 'Cannot make moves while viewing history.' };

    const prevPieces = pieces;
    const next = prevPieces.map((p) => ({ ...p, possibleTypes: [...p.possibleTypes] }));
    const moving = next.find((p) => p.id === pieceId && !p.captured);
    if (!moving) return { success: false, reason: 'Piece not found.' };
    if (moving.side !== sideToMove) return { success: false, reason: 'It is not your turn.' };

    const from = fromAlgebraic(moving.square);
    const to = fromAlgebraic(toSquare);
    if (!from || !to) return { success: false, reason: 'Invalid square.' };

    // Guard against duplicate invocation of the same move (e.g., Strict Mode/dev double effects)
    const fromSquareAlg = moving.square;
    const moveSignature = `${sideToMove}:${pieceId}:${fromSquareAlg}->${toSquare}`;
    if (lastMoveSignatureRef.current === moveSignature) return { success: false };

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

    if (subset.length === 0) return { success: false, reason: 'This piece cannot make that move.' };

    let didCapture = false;
    const targetPiece = tempOcc.get(toSquare);
    if (targetPiece && targetPiece.side !== moving.side) {
      const least = CAPTURE_COLLAPSE_ORDER.find((t) => targetPiece.possibleTypes.includes(t));
      targetPiece.captured = true;
      targetPiece.square = null;
      targetPiece.possibleTypes = least ? [least] : ['p'];
      targetPiece.captureIndex = captureCounter;
      didCapture = true;
    }

    // Apply the move and collapse mover to the subset that can make this move
    moving.square = toSquare;
    moving.possibleTypes = subset;
    moving.moveCount = (moving.moveCount || 0) + 1;

    // Quantum Promotion: if mover still includes Pawn and reached farthest rank, remove Pawn and add N/B/R/Q
    const promotionRank = moving.side === 'white' ? 7 : 0;
    if (moving.possibleTypes.includes('p')) {
      const toPos = to;
      if (toPos && toPos.rankIndex === promotionRank) {
        const merged = new Set(moving.possibleTypes.filter((t) => t !== 'p'));
        ['n', 'b', 'r', 'q'].forEach((t) => merged.add(t));
        moving.possibleTypes = Array.from(merged);
        moving.wasPromoted = true;
      }
    }

    // Enforce global type constraints to a fixpoint after move, capture-collapse, and promotion
    const constrained = enforceGlobalTypeConstraintsToFixpoint(next);

    // End-of-turn king pruning: remove 'k' from mover-side pieces on squares threatened by opposing checking pieces
    const moverSide = moving.side;
    const opponentSide = moverSide === 'white' ? 'black' : 'white';
    const oppThreats = computeThreatenedSquaresForSide(constrained, opponentSide);

    const afterCheck = constrained.map((p) => {
      if (p.captured || p.side !== moverSide || !p.square) return p;
      if (p.possibleTypes.length <= 0) return p;
      if (!p.possibleTypes.includes('k')) return p;
      if (!oppThreats.has(p.square)) return p;
      if (p.possibleTypes.length === 1) return p;
      const filtered = p.possibleTypes.filter((t) => t !== 'k');
      return { ...p, possibleTypes: filtered };
    });

    const finalPieces = enforceGlobalTypeConstraintsToFixpoint(afterCheck);

    const nextSide = sideToMove === 'white' ? 'black' : 'white';
    const nextCaptureCounter = didCapture ? captureCounter + 1 : captureCounter;

    // Commit as a new snapshot
    pushSnapshot(finalPieces, nextSide, nextCaptureCounter);

    // Mark this signature as applied to prevent duplicate applications in the same cycle
    lastMoveSignatureRef.current = moveSignature;

    return { success: true };
  }, [pieces, sideToMove, captureCounter, canMakeMove, pushSnapshot]);

  const canCastleBetween = useCallback((idA, idB) => {
    if (!idA || !idB || idA === idB) return { canCastle: false, reason: 'Select two different pieces.' };
    const a = pieces.find((p) => p.id === idA && !p.captured);
    const b = pieces.find((p) => p.id === idB && !p.captured);
    if (!a || !b) return { canCastle: false, reason: 'One or both pieces not found.' };
    if (a.side !== b.side) return { canCastle: false, reason: 'Pieces must be on the same side.' };
    if (a.side !== sideToMove) return { canCastle: false, reason: 'It is not your turn to move.' };
    if (!a.square || !b.square) return { canCastle: false, reason: 'Pieces must be on the board.' };

    const isEligible = (p) => {
      if (!p.possibleTypes) return false;
      return p.possibleTypes.includes('r') && p.possibleTypes.includes('k');
    };

    if (!isEligible(a) || !isEligible(b)) {
      return { canCastle: false, reason: 'Both pieces must be a superposition that includes Rook and King.' };
    }

    if ((a.moveCount || 0) > 0 || (b.moveCount || 0) > 0) {
      return { canCastle: false, reason: 'Both pieces must not have moved to castle.' };
    }

    const posA = fromAlgebraic(a.square);
    const posB = fromAlgebraic(b.square);
    if (!posA || !posB) return { canCastle: false, reason: 'Invalid piece position.' };
    if (posA.rankIndex !== posB.rankIndex) return { canCastle: false, reason: 'Pieces must be on the same rank to castle.' };

    const rank = posA.rankIndex;
    const f1 = Math.min(posA.fileIndex, posB.fileIndex);
    const f2 = Math.max(posA.fileIndex, posB.fileIndex);
    const gap = f2 - f1 - 1;

    if (gap < 1) {
      return { canCastle: false, reason: 'Pieces must have at least one empty square between them.' };
    }

    // Requirement 1 — Clear path
    for (let f = f1 + 1; f < f2; f++) {
      const sq = toAlgebraic(f, rank);
      if (occupancy.get(sq)) return { canCastle: false, reason: 'The path between pieces must be clear.' };
    }

    // Requirement 2 — No checks through
    const opponentSide = a.side === 'white' ? 'black' : 'white';
    const oppThreats = computeThreatenedSquaresForSide(pieces, opponentSide);
    for (let f = f1 + 1; f < f2; f++) {
      const sq = toAlgebraic(f, rank);
      if (oppThreats.has(sq)) return { canCastle: false, reason: 'Cannot castle through a threatened square.' };
    }

    // Requirement 3 — Meet in the middle
    let plan;
    const piece1 = (posA.fileIndex === f1) ? a : b; // piece on the left
    const piece2 = (posA.fileIndex === f2) ? a : b; // piece on the right
    const dist = (file) => 3 - Math.min(file, 7 - file);

    let piece1_to_sq, piece2_to_sq;

    if (gap === 1) {
      const midFile = f1 + 1;
      const totalDist1 = dist(f1) + dist(midFile);
      const totalDist2 = dist(midFile) + dist(f2);

      let final_f_pair;
      if (totalDist1 < totalDist2) {
        final_f_pair = [f1, midFile];
      } else if (totalDist2 < totalDist1) {
        final_f_pair = [midFile, f2];
      } else {
        const center_dist1 = Math.abs(f1 - 3.5) + Math.abs(midFile - 3.5);
        const center_dist2 = Math.abs(midFile - 3.5) + Math.abs(f2 - 3.5);
        final_f_pair = (center_dist1 <= center_dist2) ? [f1, midFile] : [midFile, f2];
      }

      if (final_f_pair[0] === f1) { // final state is (f1, midFile)
        piece1_to_sq = toAlgebraic(midFile, rank); // piece1 moves to middle
        piece2_to_sq = toAlgebraic(f1, rank);     // piece2 moves to piece1's old spot
      } else { // final state is (midFile, f2)
        piece1_to_sq = toAlgebraic(f2, rank);     // piece1 moves to piece2's old spot
        piece2_to_sq = toAlgebraic(midFile, rank); // piece2 moves to middle
      }
    } else { // gap >= 2
      const emptyFiles = [];
      for (let f = f1 + 1; f < f2; f++) emptyFiles.push(f);
      let dest1_f, dest2_f;

      if (gap % 2 === 0) { // Even gap
        dest1_f = emptyFiles[gap / 2 - 1];
        dest2_f = emptyFiles[gap / 2];
      } else { // Odd gap
        const mid = emptyFiles[(gap - 1) / 2];
        const pair1 = [emptyFiles[(gap - 1) / 2 - 1], mid];
        const pair2 = [mid, emptyFiles[(gap - 1) / 2 + 1]];
        const totalDist1 = dist(pair1[0]) + dist(pair1[1]);
        const totalDist2 = dist(pair2[0]) + dist(pair2[1]);
        if (totalDist1 <= totalDist2) {
          [dest1_f, dest2_f] = pair1;
        } else {
          [dest1_f, dest2_f] = pair2;
        }
      }
      piece1_to_sq = toAlgebraic(dest1_f, rank);
      piece2_to_sq = toAlgebraic(dest2_f, rank);
    }

    plan = {
      piece1_id: piece1.id,
      piece2_id: piece2.id,
      piece1_from: piece1.square,
      piece2_from: piece2.square,
      piece1_to: piece1_to_sq,
      piece2_to: piece2_to_sq,
    };

    return { canCastle: true, plan };
  }, [pieces, sideToMove, occupancy]);

  const castlePieces = useCallback((idA, idB) => {
    if (!canMakeMove) return { success: false, reason: 'Cannot make moves while viewing history.' };

    const { canCastle, reason, plan } = canCastleBetween(idA, idB);
    if (!canCastle) return { success: false, reason: reason || 'Castling is not possible.' };

    const prevPieces = pieces;
    const next = prevPieces.map((p) => ({ ...p, possibleTypes: [...p.possibleTypes] }));

    const piece1 = next.find((p) => p.id === plan.piece1_id && !p.captured);
    const piece2 = next.find((p) => p.id === plan.piece2_id && !p.captured);
    if (!piece1 || !piece2) return { success: false, reason: 'Internal error: castling pieces not found after planning.' };

    const signature = `${sideToMove}:castle:${plan.piece1_id},${plan.piece2_id}:${plan.piece1_from}->${plan.piece1_to}`;
    if (lastMoveSignatureRef.current === signature) return { success: false };

    // Apply movement and collapse both pieces to R-K combo post-castle
    piece1.square = plan.piece1_to;
    piece2.square = plan.piece2_to;
    piece1.possibleTypes = ['r', 'k'];
    piece2.possibleTypes = ['r', 'k'];
    piece1.moveCount = (piece1.moveCount || 0) + 1;
    piece2.moveCount = (piece2.moveCount || 0) + 1;

    // Enforce type constraints after the simultaneous move
    const constrained = enforceGlobalTypeConstraintsToFixpoint(next);

    // Post-move check pruning of 'k' from mover side threatened squares
    const moverSide = piece1.side; // both same side
    const opponentSide = moverSide === 'white' ? 'black' : 'white';
    const oppThreats = computeThreatenedSquaresForSide(constrained, opponentSide);

    const afterCheck = constrained.map((p) => {
      if (p.captured || p.side !== moverSide || !p.square) return p;
      if (!p.possibleTypes.includes('k')) return p;
      if (!oppThreats.has(p.square)) return p;
      if (p.possibleTypes.length === 1) return p;
      const filtered = p.possibleTypes.filter((t) => t !== 'k');
      return { ...p, possibleTypes: filtered };
    });

    const finalPieces = enforceGlobalTypeConstraintsToFixpoint(afterCheck);

    const nextSide = sideToMove === 'white' ? 'black' : 'white';

    pushSnapshot(finalPieces, nextSide, captureCounter);

    lastMoveSignatureRef.current = signature;

    return { success: true };
  }, [pieces, sideToMove, captureCounter, canMakeMove, canCastleBetween, pushSnapshot]);

  return {
    // view
    pieces,
    sideToMove,
    checkingSquaresBySide,

    // timeline
    viewIndex,
    historyLength: history.length,
    setViewIndex,
    canMakeMove,

    // queries and commands
    getPieceAtSquare,
    getLegalMoves,
    movePiece,
    canCastleBetween,
    castlePieces,
  };
}
