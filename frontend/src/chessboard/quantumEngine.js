// frontend/src/chessboard/quantumEngine.js
// Purpose: The Quantum Chess rules engine facade — move simulation
// (standard / en passant / castling), the contact zap/heal resolution,
// legal-reply generation, revealed-king checkmate/stalemate evaluation, and
// position signatures. The piece type-set
// shape, movement geometry, and the conservation solver live in
// ./engineTypes.js, ./engineGeometry.js and ./engineConservation.js; their
// public API is re-exported here so consumers import one module.
// Imports From: ./boardUtils.js, ./gameConstants.js, ./engineTypes.js, ./engineGeometry.js, ./engineConservation.js
// Exported To: ./useQuantumGameState.js, ./advanceCore.js, ../ai/alphaBetaEngine.js

import { fromAlgebraic, toAlgebraic } from './boardUtils.js';
import {
  CAPTURE_COLLAPSE_ORDER,
  CONTACT_ZAP_ORDER,
  HEAL_GAIN_ORDER,
  LEAST_VALUABLE_ORDER,
} from './gameConstants.js';
import {
  clonePieces,
  getBaseTypes,
  getPromoTypes,
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

// List active check threats for the board's check-ray overlay. Two kinds of
// target, matching the rules that consume them:
//  - superposed king-holders are threatened by nearly-defined (<= 2 type)
//    attackers — the same attackers classic end-of-turn king pruning
//    respects;
//  - a DEFINITE king (possibleTypes === ['k'], the revealed endgame king)
//    is in check from an attacker of ANY width, exactly like
//    canSideCaptureSquare scores it — otherwise the overlay under-reports
//    real mate threats.
// Returns [{ from, to, side }] where side is the ATTACKER's side.
export function listCheckThreats(pieces) {
  const occ = buildOccupancy(pieces);
  const holders = pieces.filter((p) => !p.captured && p.square && (p.possibleTypes || []).includes('k'));
  if (holders.length === 0) return [];
  const holderBySquare = new Map(holders.map((h) => [h.square, h]));
  const definiteKing = (h) => (h.possibleTypes || []).length === 1;

  const threats = [];
  const seen = new Set();
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    const types = p.possibleTypes || [];
    if (types.length === 0) continue;
    const narrowAttacker = types.length <= 2;
    if (!narrowAttacker && !holders.some((h) => definiteKing(h) && h.side !== p.side)) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    for (const t of types) {
      const atk = attacksForType(t, pos.fileIndex, pos.rankIndex, occ, p.side);
      for (const sq of atk) {
        const h = holderBySquare.get(sq);
        if (!h || h.side === p.side) continue;
        if (!narrowAttacker && !definiteKing(h)) continue;
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

// A side with NO legal replies is lost (checkmate) only when its unique
// king-holder stands in capture range; otherwise it is stalemated. A side can
// temporarily have no King possibility and heal one back later.
// Shared by terminal evaluation and the AI's leaf scoring.
export function isLostInCheck(pieces, side) {
  const holders = pieces.filter((p) => !p.captured && p.side === side && p.square && (p.possibleTypes || []).includes('k'));
  if (holders.length === 0) return false;
  return holders.length === 1 && canSideCaptureSquare(pieces, otherSide(side), holders[0].square);
}

// The resolution tail every move simulation shares once the mover has
// landed: run conservation, then the contact effects — zap every enemy in
// reach, heal every friendly.
function resolveMoveTail(next, moverSide, moverIds) {
  const constrained = applyQuantumConstraints(next);
  const contact = applyContactZapHeal(constrained, moverSide, moverIds);
  return {
    pieces: contact.pieces,
    zappedSquares: contact.zappedSquares,
    healedSquares: contact.healedSquares,
    fizzledSquares: contact.fizzledSquares,
  };
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
    // A piece with no non-king possibility IS the king — capturing it ends
    // the game.
    if (least) {
      restrictTypes(targetPiece, [least]);
    } else {
      withTypes(targetPiece, ['k'], []);
    }
    targetPiece.captureIndex = captureCounter;
    didCapture = true;
  }

  moving.square = toSquare;
  restrictTypes(moving, subset);
  moving.moveCount = (moving.moveCount || 0) + 1;

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

  const tail = resolveMoveTail(next, moving.side, [moving.id]);
  return {
    ok: true,
    pieces: tail.pieces,
    didCapture,
    zappedSquares: tail.zappedSquares,
    healedSquares: tail.healedSquares,
    fizzledSquares: tail.fizzledSquares,
  };
}

// A shed is LOCAL when the constrained board differs from the pre-shed board
// in exactly one way: the target lost the shed type and nothing else — no
// other piece's possibility set changed, and the target was not narrowed
// beyond the shed itself. This is the zap guard's cleanliness test.
function shedIsLocal(before, after, targetId, shedType) {
  const afterById = new Map(after.map((p) => [p.id, p]));
  for (const b of before) {
    const a = afterById.get(b.id);
    if (!a) return false;
    const bTypes = (b.possibleTypes || []).join('');
    const aTypes = (a.possibleTypes || []).join('');
    if (b.id === targetId) {
      const expected = (b.possibleTypes || []).filter((t) => t !== shedType).join('');
      if (aTypes !== expected) return false;
    } else if (aTypes !== bTypes) {
      return false;
    }
  }
  return true;
}

// --- Zap + heal on contact ---
//
// The moved piece(s) touch everything within capture reach of their LEAST
// valuable remaining possibility ONLY (p < n < b < r < q < k) — a fresh
// superposition pokes like a pawn, a confirmed queen sweeps like one, so
// collapsing a piece is what arms its contact. Attack squares, so
// friendly-occupied squares count — that is protection. Every enemy piece in
// contact is ZAPPED: it sheds the most valuable possibility it can lose
// CLEANLY, trying k -> q -> r -> b -> n -> p. A shed is clean
// when, after conservation settles, the board's only change is that single
// type leaving that single piece — a shed whose census cascade would strip
// possibilities from ANY other piece (or narrow the target further) is
// skipped and the zap walks down to the next type; if nothing sheds cleanly
// the zap dissipates (no mark). A volley may never erase a side's final King
// possibility: every King shed that would collectively do so falls through
// to Queen, then Rook, Bishop, Knight, and Pawn. A fully measured piece (one
// possibility) has nothing left to shed. Every friendly piece in contact is
// HEALED: it regains its least valuable feasible possibility, including King
// as the final option (Pawn never returns to promoted pieces or on the
// promotion rank; conservation must accept the regain).
// Deterministic: contacts resolve in algebraic square order, zaps before
// heals. Returns { pieces, zappedSquares, healedSquares }.
export function applyContactZapHeal(pieces, moverSide, moverIds) {
  let current = pieces;
  const moverSet = new Set(moverIds);
  const occ = buildOccupancy(current);

  const reach = new Set();
  for (const moverId of moverIds) {
    const mover = current.find((p) => p.id === moverId && !p.captured && p.square);
    if (!mover) continue;
    const pos = fromAlgebraic(mover.square);
    if (!pos) continue;
    // Least valuable possibility only (LEAST_VALUABLE_ORDER is p→k).
    const contactType = LEAST_VALUABLE_ORDER.find((t) => (mover.possibleTypes || []).includes(t));
    if (!contactType) continue;
    for (const sq of attacksForType(contactType, pos.fileIndex, pos.rankIndex, occ, mover.side)) reach.add(sq);
  }

  const contacts = Array.from(reach)
    .sort()
    .map((sq) => occ.get(sq))
    .filter((p) => p && !p.captured && !moverSet.has(p.id));

  // Zaps strike TOGETHER (rules change 2026-07-13, Jasper's ruling — "the
  // volley"). Sequential zaps chose between indistinguishable victims by
  // square order: with two identical {p,k} holders both in reach, the
  // alphabetically-first shed cleanly and its shed census-locked the twin
  // into a shield. No dice anywhere means no alphabet either. Now every
  // target's shed is judged against the board AS THE MOVER LANDED (no zap
  // sees another's result), and all sheds land as ONE volley: if the
  // combined cascade would ripple beyond the struck pieces, the whole
  // volley fizzles — they shed together or shield together. If all remaining
  // King holders would shed King in that volley, those targets instead retry
  // from Queen downward so Zap can never erase the final King possibility.
  const zappedSquares = [];
  const fizzledSquares = [];
  const preZap = current;
  const candidates = []; // { id, square, shed }
  for (const target of contacts) {
    if (target.side === moverSide) continue;
    const live = preZap.find((p) => p.id === target.id && !p.captured && p.square);
    if (!live) continue;
    const types = live.possibleTypes || [];
    if (types.length <= 1) continue;
    let found = null;
    for (const shed of CONTACT_ZAP_ORDER) {
      if (!types.includes(shed)) continue;
      const trial = clonePieces(preZap);
      const trialTarget = trial.find((x) => x.id === live.id);
      restrictTypes(trialTarget, types.filter((t) => t !== shed));
      const constrained = applyQuantumConstraints(trial);
      if (shedIsLocal(preZap, constrained, live.id, shed)) {
        found = { id: live.id, square: live.square, shed };
        break;
      }
    }
    if (found) candidates.push(found);
    else fizzledSquares.push(live.square);
  }

  const targetSide = otherSide(moverSide);
  const kingHolderIds = preZap
    .filter((p) => !p.captured && p.square && p.side === targetSide && (p.possibleTypes || []).includes('k'))
    .map((p) => p.id);
  const kingShedIds = new Set(candidates.filter((c) => c.shed === 'k').map((c) => c.id));
  const wouldEraseFinalKing =
    kingHolderIds.length > 0 && kingHolderIds.every((id) => kingShedIds.has(id));

  if (wouldEraseFinalKing) {
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const candidate = candidates[i];
      if (candidate.shed !== 'k') continue;
      const live = preZap.find((p) => p.id === candidate.id);
      const types = live?.possibleTypes || [];
      let fallback = null;
      for (const shed of CONTACT_ZAP_ORDER.slice(1)) {
        if (!types.includes(shed)) continue;
        const trial = clonePieces(preZap);
        const trialTarget = trial.find((x) => x.id === candidate.id);
        restrictTypes(trialTarget, types.filter((t) => t !== shed));
        const constrained = applyQuantumConstraints(trial);
        if (shedIsLocal(preZap, constrained, candidate.id, shed)) {
          fallback = { ...candidate, shed };
          break;
        }
      }
      if (fallback) candidates[i] = fallback;
      else {
        candidates.splice(i, 1);
        fizzledSquares.push(candidate.square);
      }
    }
  }

  if (candidates.length > 0) {
    const volley = clonePieces(preZap);
    for (const c of candidates) {
      const t = volley.find((x) => x.id === c.id);
      restrictTypes(t, (t.possibleTypes || []).filter((y) => y !== c.shed));
    }
    const constrained = applyQuantumConstraints(volley);
    const shedById = new Map(candidates.map((c) => [c.id, c.shed]));
    const afterById = new Map(constrained.map((p) => [p.id, p]));
    let jointClean = true;
    for (const b of preZap) {
      const a = afterById.get(b.id);
      if (!a) { jointClean = false; break; }
      const bTypes = (b.possibleTypes || []).join('');
      const aTypes = (a.possibleTypes || []).join('');
      const shed = shedById.get(b.id);
      if (shed) {
        const expected = (b.possibleTypes || []).filter((t) => t !== shed).join('');
        if (aTypes !== expected) { jointClean = false; break; }
      } else if (aTypes !== bTypes) {
        jointClean = false;
        break;
      }
    }
    if (jointClean) {
      current = constrained;
      for (const c of candidates) zappedSquares.push(c.square);
    } else {
      for (const c of candidates) fizzledSquares.push(c.square);
    }
  }

  // Heals bloom TOGETHER (same 2026-07-13 ruling as the zap volley — no
  // hidden square-order tie-breaks). Each friendly contact finds its
  // cheapest feasible regain against the POST-VOLLEY, PRE-HEAL state in
  // isolation; then all regains land at once. If the combined census lets
  // every regain take root (each healed piece still holds its regained
  // type and grew, or restored King), the volley commits — cascades to other pieces remain
  // allowed, as heals always did. If ANY regain fails to take root
  // jointly, the whole heal volley dissipates.
  const healedSquares = [];
  const preHeal = current;
  const moverHasKing = preHeal.some(
    (p) => !p.captured && p.square && p.side === moverSide && (p.possibleTypes || []).includes('k')
  );
  const healOrder = moverHasKing
    ? HEAL_GAIN_ORDER
    : ['k', ...HEAL_GAIN_ORDER.filter((t) => t !== 'k')];
  const healCandidates = []; // { id, square, gain, preLen }
  for (const c of contacts) {
    if (c.side !== moverSide) continue;
    const live = preHeal.find((p) => p.id === c.id && !p.captured && p.square);
    if (!live) continue;
    const promoted = getPromoTypes(live).length > 0;
    const pos = fromAlgebraic(live.square);
    const promotionRank = live.side === 'white' ? 7 : 0;
    const onPromotionRank = Boolean(pos && pos.rankIndex === promotionRank);
    for (const t of healOrder) {
      if (t === 'p' && (promoted || onPromotionRank)) continue;
      if (live.possibleTypes.includes(t)) continue;
      const trial = clonePieces(preHeal);
      const trialPiece = trial.find((x) => x.id === live.id);
      withTypes(trialPiece, [...getBaseTypes(trialPiece), t], getPromoTypes(trialPiece));
      const constrained = applyQuantumConstraints(trial);
      const after = constrained.find((x) => x.id === live.id);
      const tookRoot = after && after.possibleTypes.includes(t) &&
        (t === 'k' || after.possibleTypes.length > live.possibleTypes.length);
      if (tookRoot) {
        healCandidates.push({ id: live.id, square: live.square, gain: t, preLen: live.possibleTypes.length });
        break;
      }
    }
  }
  if (healCandidates.length > 0) {
    const volley = clonePieces(preHeal);
    for (const c of healCandidates) {
      const t = volley.find((x) => x.id === c.id);
      withTypes(t, [...getBaseTypes(t), c.gain], getPromoTypes(t));
    }
    const constrained = applyQuantumConstraints(volley);
    let allHold = true;
    for (const c of healCandidates) {
      const after = constrained.find((x) => x.id === c.id);
      const tookRoot = after && after.possibleTypes.includes(c.gain) &&
        (c.gain === 'k' || after.possibleTypes.length > c.preLen);
      if (!tookRoot) {
        allHold = false;
        break;
      }
    }
    if (allHold) {
      current = constrained;
      for (const c of healCandidates) healedSquares.push(c.square);
    }
  }

  return { pieces: current, zappedSquares, healedSquares, fizzledSquares };
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

  const tail = resolveMoveTail(next, moving.side, [moving.id]);
  return {
    ok: true,
    pieces: tail.pieces,
    didCapture: true,
    zappedSquares: tail.zappedSquares,
    healedSquares: tail.healedSquares,
    fizzledSquares: tail.fizzledSquares,
  };
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

  // Rules change 2026-07-14 (Jasper): no unmoved requirement — tracking
  // which pieces have moved is too hard for a human. Instead the pair must
  // stand on the mover's BACK RANK (where rook-and-king stories live).
  const posA = fromAlgebraic(a.square);
  const posB = fromAlgebraic(b.square);
  if (!posA || !posB) return { canCastle: false, reason: 'Invalid piece position.' };
  const backRank = sideToMove === 'white' ? 0 : 7;
  if (posA.rankIndex !== backRank || posB.rankIndex !== backRank) {
    return { canCastle: false, reason: 'Both pieces must be on your back rank to castle.' };
  }

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
  // The castle projects both pieces onto base-origin Rook/King (promotion
  // branches are cleared — mirrors fastRules.makeCastle exactly).
  withTypes(piece1, ['r', 'k'], []);
  withTypes(piece2, ['r', 'k'], []);
  piece1.moveCount = (piece1.moveCount || 0) + 1;
  piece2.moveCount = (piece2.moveCount || 0) + 1;

  // The pair leaves the castle as two ordinary rook-or-king superpositions —
  // no entanglement link (rules change 2026-07-08: single-history is gone,
  // and the global census already keeps the kings honest). Like any other
  // nearly-defined pieces they may recohere back toward superposition.
  piece1.castled = true;
  piece2.castled = true;

  const tail = resolveMoveTail(next, piece1.side, [piece1.id, piece2.id]);
  return {
    ok: true,
    pieces: tail.pieces,
    zappedSquares: tail.zappedSquares,
    healedSquares: tail.healedSquares,
    fizzledSquares: tail.fizzledSquares,
  };
}

export function generateLegalReplies(pieces, side, captureCounter, lastMove = null) {
  const occ = buildOccupancy(pieces);
  const legal = [];
  // Check exists only for a DEFINITE king (possibleTypes === ['k']), and the
  // census makes that exactly the last-holder endgame state: superposed
  // kings roam checkless through the quantum midgame, but once a side's king
  // stands revealed the classical rules return — it may not be left
  // capturable, and mate ends the game.
  const leavesKingCapturable = (ps) => hasCollapsedKingCapturable(ps, side);

  for (const ep of listEnPassantCaptures(pieces, side, lastMove)) {
    const sim = simulateEnPassant(pieces, ep.pieceId, ep.to, ep.victimId, captureCounter);
    if (!sim.ok) continue;
    if (leavesKingCapturable(sim.pieces)) continue;
    const mover = pieces.find((p) => p.id === ep.pieceId);
    legal.push({ type: 'enpassant', from: mover ? mover.square : null, to: ep.to, victimId: ep.victimId, resultPieces: sim.pieces });
  }

  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    const merged = mergedDestinations(p, occ, { isFirstMove: (p.moveCount || 0) === 0 });

    for (const toSq of merged) {
      const sim = simulateStandardMove(pieces, p.id, toSq, captureCounter);
      if (!sim.ok) continue;
      if (leavesKingCapturable(sim.pieces)) continue;
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
      if (leavesKingCapturable(sim.pieces)) continue;
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
// first-move rights, castling state, the side to move, and any
// live en passant window.
export function computePositionSignature(pieces, sideToMove, lastMove = null) {
  const parts = pieces
    .map((p) => [
      p.id,
      p.captured ? 'x' : (p.square || '-'),
      getBaseTypes(p).join(''),
      getPromoTypes(p).join(''),
      (p.moveCount || 0) === 0 ? 'f' : 'm',
      p.castled ? 'c' : '',
    ].join(':'))
    .sort()
    .join('|');
  const ep = lastMove && lastMove.isDoubleStep ? lastMove.crossedSquare : '-';
  return `${sideToMove}#${ep}#${parts}`;
}
