// frontend/src/chessboard/quantumEngine.js
// Purpose: The Quantum Chess rules engine facade — move simulation
// (standard / en passant / castling), the measurement pulse and end-of-turn
// effects, threat maps, legal-reply generation, terminal evaluation, and
// position signatures. The piece type-set shape, movement geometry, and the
// conservation solver live in ./engineTypes.js, ./engineGeometry.js and
// ./engineConservation.js; their public API is re-exported here so consumers
// import one module.
// Imports From: ./boardUtils.js, ./gameConstants.js, ./engineTypes.js, ./engineGeometry.js, ./engineConservation.js
// Exported To: ./useQuantumGameState.js, ./advanceCore.js, ../ai/alphaBetaEngine.js, ../puzzle/puzzleGenerator.js

import { fromAlgebraic, toAlgebraic } from './boardUtils.js';
import {
  CAPTURE_COLLAPSE_ORDER,
  DECOHERENCE_SHED_ORDER,
  DEFAULT_COHERENCE,
  RECOHERE_GAIN_ORDER,
  RECOHERE_THRESHOLD,
} from './gameConstants.js';
import {
  cloneWithoutKing,
  clonePieces,
  getBaseTypes,
  getPromoTypes,
  resetCoherenceOnCollapse,
  restrictTypes,
  withTypes,
} from './engineTypes.js';
import {
  attacksForType,
  buildOccupancy,
  mergedDestinations,
  movesForType,
  subsetTypesThatCanMakeMove,
} from './engineGeometry.js';
import { applyQuantumConstraints } from './engineConservation.js';

// Re-export the split modules' public API so the engine stays one import.
export { clonePieces, getBaseTypes, getPromoTypes } from './engineTypes.js';
export {
  attacksForType,
  buildOccupancy,
  mergedDestinations,
  movesForType,
  subsetTypesThatCanMakeMove,
} from './engineGeometry.js';
export { applyQuantumConstraints } from './engineConservation.js';

export function otherSide(side) {
  return side === 'white' ? 'black' : 'white';
}

export function computeThreatenedSquaresForSide(pieces, side) {
  const occ = buildOccupancy(pieces);
  const threatened = new Set();
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const types = p.possibleTypes || [];
    if (types.length === 0) continue;
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

// List active check threats: every nearly-defined (<= 2 type) piece whose
// attacks reach an enemy king-holder's square — the same attackers the
// end-of-turn king pruning respects. Returns [{ from, to, side }] where
// side is the ATTACKER's side. Used by the board's check-ray overlay.
export function listCheckThreats(pieces) {
  const occ = buildOccupancy(pieces);
  const holders = pieces.filter((p) => !p.captured && p.square && (p.possibleTypes || []).includes('k'));
  if (holders.length === 0) return [];
  const holderBySquare = new Map(holders.map((h) => [h.square, h]));

  const threats = [];
  const seen = new Set();
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    const types = p.possibleTypes || [];
    if (types.length === 0 || types.length > 2) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    for (const t of types) {
      const atk = attacksForType(t, pos.fileIndex, pos.rankIndex, occ, p.side);
      for (const sq of atk) {
        const h = holderBySquare.get(sq);
        if (!h || h.side === p.side) continue;
        const key = `${p.square}>${sq}`;
        if (seen.has(key)) continue;
        seen.add(key);
        threats.push({ from: p.square, to: sq, side: p.side });
      }
    }
  }
  return threats;
}

export function canSideCaptureSquare(pieces, side, targetSq) {
  const occ = buildOccupancy(pieces);
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const { fileIndex: f, rankIndex: r } = pos;
    const isFirstMove = (p.moveCount || 0) === 0;
    for (const t of p.possibleTypes) {
      const moves = movesForType(t, f, r, occ, side, { isFirstMove });
      if (moves.includes(targetSq)) return true;
    }
  }
  return false;
}

// A collapsed (definitely-known) King standing in capture range loses on the
// spot, so every legality filter in the game rejects moves that produce one.
export function hasCollapsedKingCapturable(pieces, side) {
  const opponent = otherSide(side);
  const kings = pieces.filter((p) => !p.captured && p.side === side && p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k');
  if (kings.length === 0) return false;
  for (const k of kings) {
    if (!k.square) continue;
    if (canSideCaptureSquare(pieces, opponent, k.square)) return true;
  }
  return false;
}

// A side with NO legal replies is lost (checkmate) when it is kingless or its
// unique king-holder stands in capture range; otherwise it is stalemated.
// Shared by terminal evaluation and the AI's leaf scoring.
export function isLostInCheck(pieces, side) {
  const holders = pieces.filter((p) => !p.captured && p.side === side && p.square && (p.possibleTypes || []).includes('k'));
  if (holders.length === 0) return true;
  return holders.length === 1 && canSideCaptureSquare(pieces, otherSide(side), holders[0].square);
}

// The resolution tail every move simulation shares once the mover has landed:
// run conservation, prune mover-side King possibilities standing on threatened
// squares (never a piece already collapsed to the King), re-run conservation,
// fire the measurement pulse from the mover(s), apply the owner's end-of-turn
// effects, and reset coherence on anything that collapsed.
function resolveMoveTail(next, moverSide, moverIds, prevPieces) {
  const constrained = applyQuantumConstraints(next);
  const oppThreats = computeThreatenedSquaresForSide(constrained, otherSide(moverSide));

  const afterCheck = constrained.map((p) => {
    if (p.captured || p.side !== moverSide || !p.square) return p;
    if (!p.possibleTypes.includes('k')) return p;
    if (!oppThreats.has(p.square)) return p;
    if (p.possibleTypes.length === 1) return p;
    return cloneWithoutKing(p);
  });

  const prePulse = applyQuantumConstraints(afterCheck);
  const pulse = applyMeasurementPulse(prePulse, moverIds);
  const finalPieces = applyOwnerTurnEffects(pulse.pieces, moverSide, moverIds, prevPieces);
  resetCoherenceOnCollapse(prevPieces, finalPieces);
  return { pieces: finalPieces, measuredSquares: pulse.measuredSquares };
}

export function simulateStandardMove(prevPieces, pieceId, toSquare, captureCounter) {
  const next = prevPieces.map((p) => ({ ...p, possibleTypes: [...p.possibleTypes] }));
  const tempOcc = buildOccupancy(next);
  const moving = next.find((p) => p.id === pieceId && !p.captured);
  if (!moving) return { ok: false, reason: 'Piece not found.', pieces: prevPieces };

  const from = fromAlgebraic(moving.square);
  const to = fromAlgebraic(toSquare);
  if (!from || !to) return { ok: false, reason: 'Invalid square.', pieces: prevPieces };

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
  if (subset.length === 0) return { ok: false, reason: 'This piece cannot make that move.', pieces: prevPieces };

  let didCapture = false;
  const targetPiece = tempOcc.get(toSquare);
  if (targetPiece && targetPiece.side !== moving.side) {
    const least = CAPTURE_COLLAPSE_ORDER.find((t) => targetPiece.possibleTypes.includes(t));
    targetPiece.captured = true;
    targetPiece.square = null;
    // Collapse the captured piece's type; its origin stays as ambiguous as the
    // type allows (a captured promoted knight still consumes a pawn slot).
    if (least) {
      restrictTypes(targetPiece, [least]);
    } else {
      withTypes(targetPiece, ['p'], []);
    }
    targetPiece.captureIndex = captureCounter;
    didCapture = true;
  }

  moving.square = toSquare;
  restrictTypes(moving, subset);
  moving.moveCount = (moving.moveCount || 0) + 1;
  moving.coherence = DEFAULT_COHERENCE;
  moving.observed = false;

  const promotionRank = moving.side === 'white' ? 7 : 0;
  // Promotion fires at most once per piece: a piece that already carries
  // promotion branches must never re-promote (which would overwrite branches
  // that measurement or constraints have since narrowed).
  if (moving.possibleTypes.includes('p') && getPromoTypes(moving).length === 0) {
    const toPos = to;
    if (toPos && toPos.rankIndex === promotionRank) {
      // In the pawn-worlds the piece becomes any heavy, funded by a pawn slot;
      // in the others it keeps its non-pawn base identities. Both branches are
      // preserved via the origin tags.
      withTypes(
        moving,
        getBaseTypes(moving).filter((t) => t !== 'p'),
        ['n', 'b', 'r', 'q']
      );
      moving.wasPromoted = true;
    }
  }

  const tail = resolveMoveTail(next, moving.side, [moving.id], prevPieces);
  return { ok: true, pieces: tail.pieces, didCapture, measuredSquares: tail.measuredSquares };
}

// --- Measurement (targeted decoherence) ---

// Sheds the next type in DECOHERENCE_SHED_ORDER (least valuable first).
function shedNextType(piece) {
  if (!Array.isArray(piece.possibleTypes) || piece.possibleTypes.length <= 1) return false;
  const shed = DECOHERENCE_SHED_ORDER.find((t) => piece.possibleTypes.includes(t));
  if (!shed) return false;
  restrictTypes(piece, piece.possibleTypes.filter((t) => t !== shed));
  return true;
}

// Measurement pulse: when a piece completes a move, it soft-measures every
// enemy piece it could capture from its final square (using any of its
// remaining possible types). To observe something, you must be able to touch
// it — and the act of moving is the observation.
//
// Observation is a MARK, not instant damage: the marked piece loses a
// coherence point at ITS OWNER's next move — unless the owner moves that very
// piece, which dodges the hit and resets it entirely (self-measurement on
// your own terms). Returns { pieces, measuredSquares }.
export function applyMeasurementPulse(pieces, moverIds) {
  const occ = buildOccupancy(pieces);
  const measured = new Set();

  for (const moverId of moverIds) {
    const mover = pieces.find((p) => p.id === moverId && !p.captured && p.square);
    if (!mover) continue;
    const reach = mergedDestinations(mover, occ, { isFirstMove: false });
    for (const sq of reach) {
      const target = occ.get(sq);
      if (!target || target.side === mover.side || target.captured) continue;
      if (!Array.isArray(target.possibleTypes)) continue;
      if (target.possibleTypes.length <= 2) {
        // Quantum Zeno: observing a nearly-defined piece cannot narrow it
        // further, but it freezes any recoherence in progress — the clock
        // resets to empty, exactly like a fresh collapse, and restarts on
        // the owner's next move.
        if ((target.recohere || 0) > 0) {
          target.recohere = 0;
          measured.add(sq);
        }
        continue;
      }
      target.observed = true;
      measured.add(sq);
    }
  }

  return { pieces, measuredSquares: Array.from(measured) };
}

// Shed the target's least valuable possibility, guarded: soft measurement can
// never fully define a piece — not even indirectly. If, after the team
// constraints resolve, ANY piece would end up with a single definite identity
// it did not already have, the measurement dissipates instead (the target
// keeps its possibilities and its coherence simply resets).
function attemptGuardedShed(current, targetId) {
  const dissipate = () => {
    const cur = current.find((p) => p.id === targetId);
    if (cur) cur.coherence = DEFAULT_COHERENCE;
    return current;
  };

  const liveTarget = current.find((p) => p.id === targetId && !p.captured);
  if (!liveTarget || liveTarget.possibleTypes.length <= 2) return dissipate();

  const trial = clonePieces(current);
  const trialTarget = trial.find((p) => p.id === targetId);
  shedNextType(trialTarget);
  trialTarget.coherence = DEFAULT_COHERENCE;
  const constrained = applyQuantumConstraints(trial);

  const beforeCounts = new Map(current.map((p) => [p.id, (p.possibleTypes || []).length]));
  const overDefined = constrained.some(
    (p) => !p.captured && (p.possibleTypes || []).length === 1 && (beforeCounts.get(p.id) || 1) > 1
  );

  return overDefined ? dissipate() : constrained;
}

// End-of-turn effects for the side that just moved:
//
// 1. Deferred measurement damage: pieces the opponent marked (observed) lose
//    one coherence point now — unless the owner just moved that very piece,
//    which dodges the hit. At zero coherence the piece sheds its least
//    valuable possibility (guarded against over-defining the position).
//
// 2. Recoherence: pieces with two or fewer possibilities diffuse back toward
//    superposition. Each of the owner's moves advances every such piece by
//    one step; at RECOHERE_THRESHOLD the piece regains its least valuable
//    feasible possibility (never King, never Pawn on promoted pieces or the
//    promotion rank, never anything conservation rules out). Pulses reset
//    the progress (quantum Zeno).
export function applyOwnerTurnEffects(pieces, moverSide, movedIds = [], prevPieces = null) {
  let current = pieces;
  const movedSet = new Set(movedIds);
  // Pre-move possibility counts: a piece whose set shrank DURING this move's
  // resolution collapsed this turn, and a collapse is a fresh start — its
  // clock must not tick (let alone pay out a regained identity) in the same
  // breath. Without this, a piece one tick from recohering could collapse
  // via en passant and instantly regain the identity, erasing the collapse.
  const prevLens = prevPieces
    ? new Map(prevPieces.map((p) => [p.id, (p.possibleTypes || []).length]))
    : null;

  // --- Deferred measurement damage ---
  const shedDueIds = [];
  for (const p of current) {
    if (p.captured || !p.square || p.side !== moverSide) continue;
    if (!p.observed) continue;
    p.observed = false;
    if (movedSet.has(p.id)) continue; // dodged by moving the threatened piece
    if ((p.possibleTypes || []).length <= 2) continue;
    const remaining = (p.coherence ?? DEFAULT_COHERENCE) - 1;
    if (remaining <= 0) {
      shedDueIds.push(p.id);
    } else {
      p.coherence = remaining;
    }
  }
  for (const id of shedDueIds) {
    current = attemptGuardedShed(current, id);
  }

  // --- Recoherence ---
  const dueIds = [];

  for (const p of current) {
    if (p.captured || !p.square || p.side !== moverSide) continue;
    const len = (p.possibleTypes || []).length;
    if (len === 0 || len > 2) {
      if ((p.recohere || 0) !== 0) p.recohere = 0;
      continue;
    }
    if (prevLens) {
      const was = prevLens.get(p.id);
      if (was !== undefined && len < was) { p.recohere = 0; continue; } // collapsed this move
    }
    const next = (p.recohere || 0) + 1;
    if (next >= RECOHERE_THRESHOLD) {
      p.recohere = 0;
      dueIds.push(p.id);
    } else {
      p.recohere = next;
    }
  }

  for (const id of dueIds) {
    const live = current.find((x) => x.id === id && !x.captured);
    if (!live || live.possibleTypes.length > 2) continue;
    // Pawn never returns to a piece whose promotion was publicly observed,
    // nor to a piece standing on its own promotion rank (an unpromoted pawn
    // cannot exist there). The environment forgets quiet histories only.
    const promoted = getPromoTypes(live).length > 0;
    const pos = fromAlgebraic(live.square);
    const promotionRank = live.side === 'white' ? 7 : 0;
    const onPromotionRank = Boolean(pos && pos.rankIndex === promotionRank);
    for (const t of RECOHERE_GAIN_ORDER) {
      if (t === 'p' && (promoted || onPromotionRank)) continue;
      if (live.possibleTypes.includes(t)) continue;
      const trial = clonePieces(current);
      const trialPiece = trial.find((x) => x.id === id);
      withTypes(trialPiece, [...getBaseTypes(trialPiece), t], getPromoTypes(trialPiece));
      trialPiece.coherence = DEFAULT_COHERENCE;
      const constrained = applyQuantumConstraints(trial);
      const after = constrained.find((x) => x.id === id);
      if (after && after.possibleTypes.includes(t) && after.possibleTypes.length > live.possibleTypes.length) {
        current = constrained;
        break;
      }
    }
  }

  return current;
}

// A nearly-defined piece is SEALED when recoherence has nothing left to give
// it: every identity it could regain is ruled out by promotion history, its
// square, or global conservation. Its clock would cycle forever without
// effect, so the UI replaces the dots with a solid line. Mirrors the gain
// loop in applyOwnerTurnEffects exactly.
export function canPieceRecohere(pieces, pieceId) {
  const live = pieces.find((p) => p.id === pieceId && !p.captured && p.square);
  if (!live) return false;
  const len = (live.possibleTypes || []).length;
  if (len === 0 || len > 2) return false;

  const promoted = getPromoTypes(live).length > 0;
  const pos = fromAlgebraic(live.square);
  const promotionRank = live.side === 'white' ? 7 : 0;
  const onPromotionRank = Boolean(pos && pos.rankIndex === promotionRank);
  for (const t of RECOHERE_GAIN_ORDER) {
    if (t === 'p' && (promoted || onPromotionRank)) continue;
    if (live.possibleTypes.includes(t)) continue;
    const trial = clonePieces(pieces);
    const trialPiece = trial.find((x) => x.id === pieceId);
    withTypes(trialPiece, [...getBaseTypes(trialPiece), t], getPromoTypes(trialPiece));
    const constrained = applyQuantumConstraints(trial);
    const after = constrained.find((x) => x.id === pieceId);
    if (after && after.possibleTypes.includes(t) && after.possibleTypes.length > live.possibleTypes.length) {
      return true;
    }
  }
  return false;
}

// --- En passant (phantom capture) ---

// A double-step first move by a piece that could still be a Pawn can be
// captured en passant on the very next turn by any enemy piece that could
// still be a Pawn, standing beside the arrival square, moving diagonally
// forward into the crossed square.
export function listEnPassantCaptures(pieces, side, lastMove) {
  if (!lastMove || !lastMove.isDoubleStep) return [];
  if (lastMove.side === side) return [];

  const victim = pieces.find((p) => p.id === lastMove.pieceId && !p.captured);
  if (!victim || !victim.square || victim.square !== lastMove.to) return [];
  if (!victim.possibleTypes.includes('p')) return [];

  const to = fromAlgebraic(lastMove.to);
  const crossed = fromAlgebraic(lastMove.crossedSquare);
  if (!to || !crossed) return [];

  const occ = buildOccupancy(pieces);
  if (occ.get(lastMove.crossedSquare)) return [];

  const dir = side === 'white' ? 1 : -1;
  const out = [];
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (!p.possibleTypes.includes('p')) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    if (pos.rankIndex !== to.rankIndex) continue;
    if (Math.abs(pos.fileIndex - to.fileIndex) !== 1) continue;
    if (crossed.rankIndex !== pos.rankIndex + dir) continue;
    out.push({ pieceId: p.id, to: lastMove.crossedSquare, victimId: victim.id });
  }
  return out;
}

export function simulateEnPassant(prevPieces, pieceId, toSquare, victimId, captureCounter) {
  const next = prevPieces.map((p) => ({ ...p, possibleTypes: [...p.possibleTypes] }));
  const moving = next.find((p) => p.id === pieceId && !p.captured);
  const victim = next.find((p) => p.id === victimId && !p.captured);
  if (!moving || !victim) return { ok: false, reason: 'En passant pieces not found.', pieces: prevPieces };
  if (moving.side === victim.side) return { ok: false, reason: 'Cannot capture your own piece.', pieces: prevPieces };
  if (!moving.possibleTypes.includes('p') || !victim.possibleTypes.includes('p')) {
    return { ok: false, reason: 'En passant requires both pieces to still possibly be Pawns.', pieces: prevPieces };
  }

  // The capture asserts the pawn-world on both sides of the interaction.
  // Pawn is always a base-origin identity.
  victim.captured = true;
  victim.square = null;
  restrictTypes(victim, ['p']);
  victim.captureIndex = captureCounter;

  moving.square = toSquare;
  restrictTypes(moving, ['p']);
  moving.moveCount = (moving.moveCount || 0) + 1;
  moving.coherence = DEFAULT_COHERENCE;
  moving.observed = false;

  const tail = resolveMoveTail(next, moving.side, [moving.id], prevPieces);
  return { ok: true, pieces: tail.pieces, didCapture: true, measuredSquares: tail.measuredSquares };
}

export function computeCastlePlanInPosition(pieces, sideToMove, idA, idB) {
  if (!idA || !idB || idA === idB) return { canCastle: false, reason: 'Select two different pieces.' };
  const a = pieces.find((p) => p.id === idA && !p.captured);
  const b = pieces.find((p) => p.id === idB && !p.captured);
  if (!a || !b) return { canCastle: false, reason: 'One or both pieces not found.' };
  if (a.side !== b.side) return { canCastle: false, reason: 'Pieces must be on the same side.' };
  if (a.side !== sideToMove) return { canCastle: false, reason: 'It is not your turn to move.' };
  if (!a.square || !b.square) return { canCastle: false, reason: 'Pieces must be on the board.' };

  if (pieces.some((p) => p.side === sideToMove && p.castled)) {
    return { canCastle: false, reason: 'Your side has already castled this game.' };
  }

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

  const occupancy = buildOccupancy(pieces);

  const rank = posA.rankIndex;
  const f1 = Math.min(posA.fileIndex, posB.fileIndex);
  const f2 = Math.max(posA.fileIndex, posB.fileIndex);
  const gap = f2 - f1 - 1;

  if (gap < 1) {
    return { canCastle: false, reason: 'Pieces must have at least one empty square between them.' };
  }

  for (let f = f1 + 1; f < f2; f++) {
    const sq = toAlgebraic(f, rank);
    if (occupancy.get(sq)) return { canCastle: false, reason: 'The path between pieces must be clear.' };
  }

  const opponentSide = otherSide(a.side);
  const oppThreats = computeThreatenedSquaresForSide(pieces, opponentSide);
  for (let f = f1 + 1; f < f2; f++) {
    const sq = toAlgebraic(f, rank);
    if (oppThreats.has(sq)) return { canCastle: false, reason: 'Cannot castle through a threatened square.' };
  }

  let plan;
  const piece1 = (posA.fileIndex === f1) ? a : b;
  const piece2 = (posA.fileIndex === f2) ? a : b;
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

    if (final_f_pair[0] === f1) {
      piece1_to_sq = toAlgebraic(midFile, rank);
      piece2_to_sq = toAlgebraic(f1, rank);
    } else {
      piece1_to_sq = toAlgebraic(f2, rank);
      piece2_to_sq = toAlgebraic(midFile, rank);
    }
  } else {
    const emptyFiles = [];
    for (let f = f1 + 1; f < f2; f++) emptyFiles.push(f);
    let dest1_f, dest2_f;

    if (gap % 2 === 0) {
      dest1_f = emptyFiles[gap / 2 - 1];
      dest2_f = emptyFiles[gap / 2];
    } else {
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
}

export function simulateCastle(prevPieces, plan) {
  const next = prevPieces.map((p) => ({ ...p, possibleTypes: [...p.possibleTypes] }));
  const piece1 = next.find((p) => p.id === plan.piece1_id && !p.captured);
  const piece2 = next.find((p) => p.id === plan.piece2_id && !p.captured);
  if (!piece1 || !piece2) return { ok: false, reason: 'Castling pieces not found.', pieces: prevPieces };

  piece1.square = plan.piece1_to;
  piece2.square = plan.piece2_to;
  // Castling pieces are unmoved, so Rook and King are base-origin identities.
  withTypes(piece1, ['r', 'k'], []);
  withTypes(piece2, ['r', 'k'], []);
  piece1.moveCount = (piece1.moveCount || 0) + 1;
  piece2.moveCount = (piece2.moveCount || 0) + 1;
  piece1.coherence = DEFAULT_COHERENCE;
  piece2.coherence = DEFAULT_COHERENCE;
  piece1.observed = false;
  piece2.observed = false;

  // The pair leaves the castle as two ordinary rook-or-king superpositions —
  // no entanglement link (rules change 2026-07-08: single-history is gone,
  // and the global census already keeps the kings honest). Like any other
  // nearly-defined pieces they may recohere back toward superposition.
  piece1.castled = true;
  piece2.castled = true;

  const tail = resolveMoveTail(next, piece1.side, [piece1.id, piece2.id], prevPieces);
  return { ok: true, pieces: tail.pieces, measuredSquares: tail.measuredSquares };
}

export function generateLegalReplies(pieces, side, captureCounter, lastMove = null) {
  const occ = buildOccupancy(pieces);
  const legal = [];

  for (const ep of listEnPassantCaptures(pieces, side, lastMove)) {
    const sim = simulateEnPassant(pieces, ep.pieceId, ep.to, ep.victimId, captureCounter);
    if (!sim.ok) continue;
    if (hasCollapsedKingCapturable(sim.pieces, side)) continue;
    const mover = pieces.find((p) => p.id === ep.pieceId);
    legal.push({ type: 'enpassant', from: mover ? mover.square : null, to: ep.to, victimId: ep.victimId, resultPieces: sim.pieces });
  }

  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const merged = mergedDestinations(p, occ, { isFirstMove: (p.moveCount || 0) === 0 });

    for (const toSq of merged) {
      const sim = simulateStandardMove(pieces, p.id, toSq, captureCounter);
      if (!sim.ok) continue;
      if (hasCollapsedKingCapturable(sim.pieces, side)) continue;
      legal.push({ type: 'move', from: p.square, to: toSq, resultPieces: sim.pieces });
    }
  }

  const sidePieces = pieces.filter((x) => !x.captured && x.side === side);
  for (let i = 0; i < sidePieces.length; i++) {
    for (let j = i + 1; j < sidePieces.length; j++) {
      const { canCastle, plan } = computeCastlePlanInPosition(pieces, side, sidePieces[i].id, sidePieces[j].id);
      if (!canCastle || !plan) continue;
      const sim = simulateCastle(pieces, plan);
      if (!sim.ok) continue;
      if (hasCollapsedKingCapturable(sim.pieces, side)) continue;
      legal.push({ type: 'castle', plan, resultPieces: sim.pieces });
    }
  }

  return legal;
}

// Evaluate the opponent's situation after the mover's move fully resolves.
// Returns 'checkmate', 'stalemate', or null (game continues).
export function evaluateTerminalAfterMove(finalPieces, moverSide, captureCounter, lastMove = null) {
  const opponent = otherSide(moverSide);
  const replies = generateLegalReplies(finalPieces, opponent, captureCounter, lastMove);

  if (replies.length === 0) {
    // No legal replies at all: checkmate only if the opponent is already
    // lost-in-check; otherwise it is stalemate — a draw.
    return isLostInCheck(finalPieces, opponent) ? 'checkmate' : 'stalemate';
  }

  // With replies available it is mate only if EVERY reply still leaves the
  // opponent lost-in-check.
  for (const reply of replies) {
    if (!isLostInCheck(reply.resultPieces, opponent)) return null;
  }
  return 'checkmate';
}

// Canonical signature of a position for repetition detection. Includes
// everything the rules can depend on: occupancy, tagged possibility sets,
// first-move rights, coherence, castling state, the side to move, and any
// live en passant window.
export function computePositionSignature(pieces, sideToMove, lastMove = null) {
  const parts = pieces
    .map((p) => [
      p.id,
      p.captured ? 'x' : (p.square || '-'),
      getBaseTypes(p).join(''),
      getPromoTypes(p).join(''),
      (p.moveCount || 0) === 0 ? 'f' : 'm',
      (p.possibleTypes || []).length > 1 ? String(p.coherence ?? '') : '',
      String(p.recohere || 0),
      p.observed ? 'o' : '',
      p.castled ? 'c' : '',
    ].join(':'))
    .sort()
    .join('|');
  const ep = lastMove && lastMove.isDoubleStep ? lastMove.crossedSquare : '-';
  return `${sideToMove}#${ep}#${parts}`;
}
