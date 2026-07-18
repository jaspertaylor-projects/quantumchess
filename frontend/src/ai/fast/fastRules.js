// frontend/src/ai/fast/fastRules.js
// Purpose: Rules on the packed board — make (standard / en passant / castle)
// with the shared conservation + contact zap/heal tail, legality, terminal
// tests, and legal-reply generation as a make → visit → rollback walk. The
// zap clean-shed guard reads the JOURNAL instead of diffing boards: a shed is
// clean iff every word the trial's conservation cascade touched belongs to
// the target and the target lost exactly the shed type (possible-mask
// comparison, matching reference shedIsLocal which ignores base/promo
// redistribution). Mirror points marked "REF:" against quantumEngine.js.
// Imports From: ./fastBoard.js, ./fastGeometry.js, ./fastConservation.js
// Exported To: ./fastSearch.js, ../../../tests/fastEngineDiff.test.js

import {
  BLACK, CAPTURED, HAS_MOVED, WAS_PROMOTED, CASTLED,
  TP, TN, TB, TR, TQ, TK, ALL_TYPES,
  sqOf, isCaptured, sideBit, baseOf, promoOf, possibleOf, withMasks,
  popcount6, setWord, watermark, rollback,
} from './fastBoard.js';
import {
  emitMovesForType, emitAttacksForType, typeCanMove, isSquareCapturableBy,
} from './fastGeometry.js';
import { applyConstraintsFast } from './fastConservation.js';

const otherSideBit = (s) => s ^ BLACK;

// REF: CONTACT_ZAP_ORDER k,q,r,b,n,p / HEAL_GAIN_ORDER p,n,b,r,q,k.
const ZAP_ORDER = [TK, TQ, TR, TB, TN, TP];
const HEAL_ORDER = [TP, TN, TB, TR, TQ, TK];

// --- Terminal / legality tests ---

// REF: hasCollapsedKingCapturable — a DEFINITE king in capture range.
export function collapsedKingCapturable(bd, side) {
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if ((w & CAPTURED) || sideBit(w) !== side) continue;
    if (possibleOf(w) !== TK) continue;
    if (isSquareCapturableBy(bd, sqOf(w), otherSideBit(side))) return true;
  }
  return false;
}

// REF: isLostInCheck.
export function lostInCheck(bd, side) {
  let holders = 0;
  let holderSq = -1;
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if ((w & CAPTURED) || sideBit(w) !== side) continue;
    if (possibleOf(w) & TK) {
      holders += 1;
      holderSq = sqOf(w);
    }
  }
  if (holders === 0) return false;
  return holders === 1 && isSquareCapturableBy(bd, holderSq, otherSideBit(side));
}

// --- Contact zap/heal (REF: applyContactZapHeal), journaled ---
const reachFlags = new Uint8Array(64);

export function contactZapHeal(bd, moverSide, moverIdxA, moverIdxB) {
  reachFlags.fill(0);
  const scratch = [];
  for (let m = 0; m < 2; m++) {
    const idx = m === 0 ? moverIdxA : moverIdxB;
    if (idx < 0) continue;
    const w = bd.words[idx];
    if ((w & CAPTURED)) continue;
    const poss = possibleOf(w);
    if (poss === 0) continue;
    // REF: reach projects from the LEAST valuable possibility = lowest bit.
    const contactType = poss & -poss;
    scratch.length = 0;
    emitAttacksForType(bd, contactType, sqOf(w), sideBit(w), scratch);
    for (let k = 0; k < scratch.length; k++) reachFlags[scratch[k]] = 1;
  }

  // REF: contacts in algebraic-string sort order = file-major, rank ascending.
  const contacts = [];
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const sq = r * 8 + f;
      if (!reachFlags[sq]) continue;
      const i = bd.occ[sq];
      if (i < 0 || i === moverIdxA || i === moverIdxB) continue;
      contacts.push(i);
    }
  }

  // Zaps strike TOGETHER (REF: the volley, rules change 2026-07-13). Every
  // target's candidate shed is judged in ISOLATION against the pre-zap
  // state (trial then rollback), then all candidates land as one volley:
  // joint-clean commits, anything else fizzles the whole volley. If the
  // candidates would collectively shed every last King, each King target
  // retries from Queen downward. Order-independent by construction.
  const volleyCandidates = []; // [pieceIdx, shedBit, preTypes] triplets, flat
  for (let c = 0; c < contacts.length; c++) {
    const i = contacts[c];
    const w = bd.words[i];
    if (sideBit(w) === moverSide) continue;
    if (w & CAPTURED) continue;
    const types = possibleOf(w);
    if (popcount6(types) <= 1) continue;
    let found = false;
    for (let z = 0; z < 6 && !found; z++) {
      const shed = ZAP_ORDER[z];
      if (!(types & shed)) continue;
      const mark = watermark(bd);
      setWord(bd, i, withMasks(w, baseOf(w) & ~shed, promoOf(w) & ~shed));
      applyConstraintsFast(bd, sideBit(w) === 0 ? 1 : 2);

      // Isolated cleanliness via the journal (possible-mask comparison, as
      // the reference's shedIsLocal).
      let clean = true;
      const j = bd.journal;
      for (let k = mark; k < j.length; k += 2) {
        if (j[k] !== i) { clean = false; break; }
      }
      if (clean && possibleOf(bd.words[i]) !== (types & ~shed)) clean = false;

      rollback(bd, mark); // isolation: the trial never persists
      if (clean) {
        volleyCandidates.push(i, shed, types);
        found = true;
      }
    }
  }

  let targetSide = -1;
  for (let k = 0; k < volleyCandidates.length; k += 3) {
    targetSide = sideBit(bd.words[volleyCandidates[k]]);
    break;
  }
  const kingHolderIdxs = [];
  if (targetSide >= 0) {
    for (let i = 0; i < bd.n; i++) {
      const w = bd.words[i];
      if (!(w & CAPTURED) && sideBit(w) === targetSide && (possibleOf(w) & TK)) kingHolderIdxs.push(i);
    }
  }
  const hasKingShed = (idx) => {
    for (let q = 0; q < volleyCandidates.length; q += 3) {
      if (volleyCandidates[q] === idx && volleyCandidates[q + 1] === TK) return true;
    }
    return false;
  };
  const wouldEraseFinalKing = kingHolderIdxs.length > 0 && kingHolderIdxs.every(hasKingShed);
  if (wouldEraseFinalKing) {
    for (let q = volleyCandidates.length - 3; q >= 0; q -= 3) {
      if (volleyCandidates[q + 1] !== TK) continue;
      const i = volleyCandidates[q];
      const w = bd.words[i];
      const types = volleyCandidates[q + 2];
      let fallback = 0;
      for (let z = 1; z < ZAP_ORDER.length; z++) {
        const shed = ZAP_ORDER[z];
        if (!(types & shed)) continue;
        const mark = watermark(bd);
        setWord(bd, i, withMasks(w, baseOf(w) & ~shed, promoOf(w) & ~shed));
        applyConstraintsFast(bd, targetSide === 0 ? 1 : 2);
        let clean = true;
        const j = bd.journal;
        for (let k = mark; k < j.length; k += 2) {
          if (j[k] !== i) { clean = false; break; }
        }
        if (clean && possibleOf(bd.words[i]) !== (types & ~shed)) clean = false;
        rollback(bd, mark);
        if (clean) { fallback = shed; break; }
      }
      if (fallback) volleyCandidates[q + 1] = fallback;
      else volleyCandidates.splice(q, 3);
    }
  }

  if (volleyCandidates.length > 0) {
    const mark = watermark(bd);
    for (let k = 0; k < volleyCandidates.length; k += 3) {
      const i = volleyCandidates[k];
      const shed = volleyCandidates[k + 1];
      const w = bd.words[i];
      targetSide = sideBit(w);
      setWord(bd, i, withMasks(w, baseOf(w) & ~shed, promoOf(w) & ~shed));
    }
    applyConstraintsFast(bd, targetSide === 0 ? 1 : 2);

    let jointClean = true;
    const j = bd.journal;
    for (let k = mark; k < j.length && jointClean; k += 2) {
      const idx = j[k];
      let isCandidate = false;
      for (let q = 0; q < volleyCandidates.length; q += 3) {
        if (volleyCandidates[q] === idx) { isCandidate = true; break; }
      }
      if (!isCandidate) jointClean = false;
    }
    for (let q = 0; q < volleyCandidates.length && jointClean; q += 3) {
      const i = volleyCandidates[q];
      const shed = volleyCandidates[q + 1];
      const pre = volleyCandidates[q + 2];
      if (possibleOf(bd.words[i]) !== (pre & ~shed)) jointClean = false;
    }

    if (!jointClean) rollback(bd, mark); // whole volley fizzles
  }

  // Heals bloom TOGETHER (REF: the joint heal search). A regain that fails
  // alone may be supported by a simultaneous regain on another contact, so
  // search combinations against one shared census. Maximize the number of
  // healed contacts, then retain contact order + HEAL_ORDER as the stable
  // least-value tie-break.
  let moverHasKing = false;
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if (!(w & CAPTURED) && sideBit(w) === moverSide && (possibleOf(w) & TK)) {
      moverHasKing = true;
      break;
    }
  }
  const healOrder = moverHasKing ? HEAL_ORDER : [TK, TP, TN, TB, TR, TQ];
  const healTargets = []; // { i, preCount, options }
  for (let c = 0; c < contacts.length; c++) {
    const i = contacts[c];
    const w = bd.words[i];
    if (sideBit(w) !== moverSide) continue;
    if (w & CAPTURED) continue;
    const promoted = promoOf(w) !== 0;
    const rank = sqOf(w) >> 3;
    const onPromoRank = sideBit(w) === BLACK ? rank === 0 : rank === 7;
    const pre = possibleOf(w);
    const preCount = popcount6(pre);
    const options = [];
    for (let h = 0; h < healOrder.length; h++) {
      const t = healOrder[h];
      if (t === TP && (promoted || onPromoRank)) continue;
      if (pre & t) continue;
      options.push(t);
    }
    healTargets.push({ i, preCount, options });
  }

  const selection = new Int32Array(healTargets.length);
  const bestSelection = new Int32Array(healTargets.length);
  let bestCount = -1;

  const selectionTakesRoot = (includeAllFrom = -1) => {
    const mark = watermark(bd);
    for (let k = 0; k < healTargets.length; k++) {
      const target = healTargets[k];
      let gains = selection[k];
      if (includeAllFrom >= 0 && k >= includeAllFrom) {
        gains = 0;
        for (let h = 0; h < target.options.length; h++) gains |= target.options[h];
      }
      if (!gains) continue;
      const w = bd.words[target.i];
      setWord(bd, target.i, withMasks(w, baseOf(w) | gains, promoOf(w)));
    }
    applyConstraintsFast(bd, moverSide === 0 ? 1 : 2);
    let allHold = true;
    for (let k = 0; k < healTargets.length && allHold; k++) {
      const gain = selection[k];
      if (!gain) continue;
      const target = healTargets[k];
      const after = possibleOf(bd.words[target.i]);
      if (!(after & gain) || (gain !== TK && popcount6(after) <= target.preCount)) allHold = false;
    }
    rollback(bd, mark);
    return allHold;
  };

  // REF optimistic prune: an option stripped even when every joint option
  // is present can never participate in a narrower valid selection.
  if (healTargets.length > 1) {
    const mark = watermark(bd);
    for (let k = 0; k < healTargets.length; k++) {
      const target = healTargets[k];
      let gains = 0;
      for (let h = 0; h < target.options.length; h++) gains |= target.options[h];
      if (!gains) continue;
      const w = bd.words[target.i];
      setWord(bd, target.i, withMasks(w, baseOf(w) | gains, promoOf(w)));
    }
    applyConstraintsFast(bd, moverSide === 0 ? 1 : 2);
    for (let k = 0; k < healTargets.length; k++) {
      const target = healTargets[k];
      const possible = possibleOf(bd.words[target.i]);
      target.options = target.options.filter((gain) => possible & gain);
    }
    rollback(bd, mark);
  }

  const searchJointHeals = (index, count) => {
    if (bestCount === healTargets.length) return;
    if (count + (healTargets.length - index) < bestCount) return;
    if (index === healTargets.length) {
      if (selectionTakesRoot() && count > bestCount) {
        bestCount = count;
        bestSelection.set(selection);
      }
      return;
    }

    const target = healTargets[index];
    for (let h = 0; h < target.options.length; h++) {
      selection[index] = target.options[h];
      searchJointHeals(index + 1, count + 1);
      if (bestCount === healTargets.length) return;
    }

    selection[index] = 0;
    searchJointHeals(index + 1, count);
  };

  searchJointHeals(0, 0);
  if (bestCount > 0) {
    for (let k = 0; k < healTargets.length; k++) {
      const gain = bestSelection[k];
      if (!gain) continue;
      const target = healTargets[k];
      const w = bd.words[target.i];
      setWord(bd, target.i, withMasks(w, baseOf(w) | gain, promoOf(w)));
    }
    applyConstraintsFast(bd, moverSide === 0 ? 1 : 2);
  }
}

// --- Make: standard move (REF: simulateStandardMove + resolveMoveTail) ---
// Returns true when the RESULT is legal (own collapsed king not capturable);
// the caller owns rollback either way via its own watermark.
export function makeStandardMove(bd, i, to) {
  const w = bd.words[i];
  const side = sideBit(w);
  const from = sqOf(w);
  const poss = possibleOf(w);

  // REF: subsetTypesThatCanMakeMove over the possible types in order.
  let subset = 0;
  for (let b = 1; b <= TK; b <<= 1) {
    if ((poss & b) && typeCanMove(bd, b, from, to, side)) subset |= b;
  }
  if (subset === 0) return false; // cannot happen from merged destinations

  const target = bd.occ[to];
  let didCapture = false;
  if (target >= 0 && sideBit(bd.words[target]) !== side) {
    didCapture = true;
    const tw = bd.words[target];
    // REF: capture collapses to least valuable possibility (never king via
    // CAPTURE_COLLAPSE_ORDER); a piece with no non-king possibility IS the
    // king.
    const nonKing = possibleOf(tw) & ~TK;
    const least = nonKing & -nonKing;
    let nw = tw | CAPTURED;
    nw = least ? withMasks(nw, baseOf(tw) & least, promoOf(tw) & least) : withMasks(nw, TK, 0);
    setWord(bd, target, nw);
  }

  // Mover: land, restrict to the subset, mark moved.
  let mw = (w & ~63) | to | HAS_MOVED;
  let base = baseOf(w) & subset;
  let promo = promoOf(w) & subset;
  mw = withMasks(mw, base, promo);

  // REF: promotion fires once, only for promo-free pieces that could be a
  // pawn, on the promotion rank: pawn-worlds fund any heavy, other base
  // identities carry over.
  const toRank = to >> 3;
  const promoRank = side === BLACK ? 0 : 7;
  if (((base | promo) & TP) && promo === 0 && toRank === promoRank) {
    mw = withMasks(mw, base & ~TP, TN | TB | TR | TQ) | WAS_PROMOTED;
  }
  setWord(bd, i, mw);

  // REF: resolveMoveTail — conservation, then contact. Captures dirty the
  // victim's side too; quiet moves only the mover's.
  applyConstraintsFast(bd, didCapture ? 3 : side === 0 ? 1 : 2);
  contactZapHeal(bd, side, i, -1);

  return !collapsedKingCapturable(bd, side);
}

// --- Make: en passant (REF: simulateEnPassant) ---
export function makeEnPassant(bd, i, to, victimIdx) {
  const w = bd.words[i];
  const side = sideBit(w);
  const vw = bd.words[victimIdx];

  // REF: the capture asserts the pawn-world on both sides.
  setWord(bd, victimIdx, withMasks(vw | CAPTURED, baseOf(vw) & TP, 0));
  setWord(bd, i, withMasks((w & ~63) | to | HAS_MOVED, baseOf(w) & TP, 0));

  applyConstraintsFast(bd, 3);
  contactZapHeal(bd, side, i, -1);

  return !collapsedKingCapturable(bd, side);
}

// --- Castle plan (REF: computeCastlePlanInPosition, geometry only) ---
// Returns { i1, i2, from1, from2, to1, to2 } or null. `side` is a side bit.
export function computeCastlePlan(bd, side, ia, ib) {
  if (ia === ib) return null;
  const wa = bd.words[ia];
  const wb = bd.words[ib];
  if ((wa & CAPTURED) || (wb & CAPTURED)) return null;
  if (sideBit(wa) !== sideBit(wb) || sideBit(wa) !== side) return null;

  // REF: side has already castled this game.
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if (sideBit(w) === side && (w & CASTLED)) return null;
  }

  // REF: both must be superpositions including Rook and King, standing on
  // the mover's back rank (2026-07-14: the unmoved requirement is gone —
  // tracking moved pieces is too hard for a human).
  const need = TR | TK;
  if ((possibleOf(wa) & need) !== need || (possibleOf(wb) & need) !== need) return null;

  const fa = sqOf(wa) & 7;
  const ra = sqOf(wa) >> 3;
  const fb = sqOf(wb) & 7;
  const rb = sqOf(wb) >> 3;
  const backRank = side === BLACK ? 7 : 0;
  if (ra !== backRank || rb !== backRank) return null;

  const rank = ra;
  const f1 = Math.min(fa, fb);
  const f2 = Math.max(fa, fb);
  const gap = f2 - f1 - 1;
  if (gap < 1) return null;
  for (let f = f1 + 1; f < f2; f++) {
    if (bd.occ[rank * 8 + f] >= 0) return null;
  }

  const p1 = fa === f1 ? ia : ib; // leftmost piece
  const p2 = fa === f2 ? ia : ib;
  const dist = (file) => 3 - Math.min(file, 7 - file);

  let to1f;
  let to2f;
  if (gap === 1) {
    const mid = f1 + 1;
    const d1 = dist(f1) + dist(mid);
    const d2 = dist(mid) + dist(f2);
    let pairLeft;
    if (d1 < d2) pairLeft = true;
    else if (d2 < d1) pairLeft = false;
    else {
      const c1 = Math.abs(f1 - 3.5) + Math.abs(mid - 3.5);
      const c2 = Math.abs(mid - 3.5) + Math.abs(f2 - 3.5);
      pairLeft = c1 <= c2;
    }
    if (pairLeft) {
      to1f = mid; // REF: piece1 -> midFile, piece2 -> f1
      to2f = f1;
    } else {
      to1f = f2;
      to2f = mid;
    }
  } else {
    const empties = [];
    for (let f = f1 + 1; f < f2; f++) empties.push(f);
    if (gap % 2 === 0) {
      to1f = empties[gap / 2 - 1];
      to2f = empties[gap / 2];
    } else {
      const mid = empties[(gap - 1) / 2];
      const pair1 = [empties[(gap - 1) / 2 - 1], mid];
      const pair2 = [mid, empties[(gap - 1) / 2 + 1]];
      const d1 = dist(pair1[0]) + dist(pair1[1]);
      const d2 = dist(pair2[0]) + dist(pair2[1]);
      const chosen = d1 <= d2 ? pair1 : pair2;
      to1f = chosen[0];
      to2f = chosen[1];
    }
  }

  return {
    i1: p1,
    i2: p2,
    from1: sqOf(bd.words[p1]),
    from2: sqOf(bd.words[p2]),
    to1: rank * 8 + to1f,
    to2: rank * 8 + to2f,
  };
}

// --- Make: castle (REF: simulateCastle) ---
export function makeCastle(bd, plan) {
  const w1 = bd.words[plan.i1];
  const w2 = bd.words[plan.i2];
  const side = sideBit(w1);
  setWord(bd, plan.i1, withMasks((w1 & ~63) | plan.to1 | HAS_MOVED | CASTLED, TR | TK, 0));
  setWord(bd, plan.i2, withMasks((w2 & ~63) | plan.to2 | HAS_MOVED | CASTLED, TR | TK, 0));

  applyConstraintsFast(bd, side === 0 ? 1 : 2);
  contactZapHeal(bd, side, plan.i1, plan.i2);

  return !collapsedKingCapturable(bd, side);
}

// --- En passant window (REF: listEnPassantCaptures) ---
// ep: { victimIdx, to, crossed, side } (side = mover side bit of the double
// step) or null. Returns [{ pieceIdx, to, victimIdx }] in piece order.
export function listEnPassant(bd, side, ep) {
  if (!ep) return [];
  if (ep.side === side) return [];
  const vw = bd.words[ep.victimIdx];
  if ((vw & CAPTURED) || sqOf(vw) !== ep.to) return [];
  if (!(possibleOf(vw) & TP)) return [];
  if (bd.occ[ep.crossed] >= 0) return [];

  const toRank = ep.to >> 3;
  const toFile = ep.to & 7;
  const dir = side === BLACK ? -1 : 1;
  const out = [];
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if ((w & CAPTURED) || sideBit(w) !== side) continue;
    if (!(possibleOf(w) & TP)) continue;
    const sq = sqOf(w);
    if ((sq >> 3) !== toRank) continue;
    if (Math.abs((sq & 7) - toFile) !== 1) continue;
    if ((ep.crossed >> 3) !== (sq >> 3) + dir) continue;
    out.push({ pieceIdx: i, to: ep.crossed, victimIdx: ep.victimIdx });
  }
  return out;
}

// --- Legal replies (REF: generateLegalReplies) as make → visit → rollback ---
// visit(desc) runs with the board IN THE CHILD STATE; desc:
//   { kind: 'move'|'enpassant'|'castle', pieceIdx, from, to,
//     victimIdx (capture/-1), plan (castle) }.
// Generation order matches the reference exactly: en passant, standard moves
// per piece in array order with insertion-ordered merged destinations, then
// castle pairs.
const seenStamp = new Int32Array(64);
let seenGen = 0;

// --- Candidate collection WITHOUT make (V2 search) ---
// Returns pseudo-legal move descriptors: destinations from the merged move
// sets, en passant, castle plans. Legality (collapsed-king filter) is only
// known after make — V2 makes lazily in ordering order and skips illegal
// candidates. Descriptor: { kind: 0 move | 1 enpassant | 2 castle, pieceIdx,
// from, to, victimIdx, plan }.
export function collectCandidates(bd, side, ep) {
  const out = [];
  for (const c of listEnPassant(bd, side, ep)) {
    out.push({ kind: 1, pieceIdx: c.pieceIdx, from: sqOf(bd.words[c.pieceIdx]), to: c.to, victimIdx: c.victimIdx, plan: null });
  }
  const dests = [];
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if ((w & CAPTURED) || sideBit(w) !== side) continue;
    const from = sqOf(w);
    const poss = possibleOf(w);
    dests.length = 0;
    seenGen += 1;
    for (let b = 1; b <= TK; b <<= 1) {
      if (!(poss & b)) continue;
      const before = dests.length;
      emitMovesForType(bd, b, from, side, dests);
      let write = before;
      for (let k = before; k < dests.length; k++) {
        const sq = dests[k];
        if (seenStamp[sq] !== seenGen) {
          seenStamp[sq] = seenGen;
          dests[write] = sq;
          write += 1;
        }
      }
      dests.length = write;
    }
    for (let d = 0; d < dests.length; d++) {
      const to = dests[d];
      const victim = bd.occ[to];
      out.push({
        kind: 0, pieceIdx: i, from, to,
        victimIdx: victim >= 0 && sideBit(bd.words[victim]) !== side ? victim : -1,
        plan: null,
      });
    }
  }
  const sidePieces = [];
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if (!(w & CAPTURED) && sideBit(w) === side) sidePieces.push(i);
  }
  for (let a = 0; a < sidePieces.length; a++) {
    for (let b = a + 1; b < sidePieces.length; b++) {
      const plan = computeCastlePlan(bd, side, sidePieces[a], sidePieces[b]);
      if (plan) out.push({ kind: 2, pieceIdx: plan.i1, from: plan.from1, to: plan.to1, victimIdx: -1, plan });
    }
  }
  return out;
}

// Capture-only candidates for quiescence: en passant plus merged
// destinations landing on enemy pieces. Castles never capture.
export function collectCaptureCandidates(bd, side, ep) {
  const out = [];
  for (const c of listEnPassant(bd, side, ep)) {
    out.push({ kind: 1, pieceIdx: c.pieceIdx, from: sqOf(bd.words[c.pieceIdx]), to: c.to, victimIdx: c.victimIdx, plan: null });
  }
  const dests = [];
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if ((w & CAPTURED) || sideBit(w) !== side) continue;
    const from = sqOf(w);
    const poss = possibleOf(w);
    dests.length = 0;
    seenGen += 1;
    for (let b = 1; b <= TK; b <<= 1) {
      if (!(poss & b)) continue;
      const before = dests.length;
      emitMovesForType(bd, b, from, side, dests);
      let write = before;
      for (let k = before; k < dests.length; k++) {
        const sq = dests[k];
        if (seenStamp[sq] !== seenGen) {
          seenStamp[sq] = seenGen;
          dests[write] = sq;
          write += 1;
        }
      }
      dests.length = write;
    }
    for (let d = 0; d < dests.length; d++) {
      const to = dests[d];
      const victim = bd.occ[to];
      if (victim >= 0 && sideBit(bd.words[victim]) !== side) {
        out.push({ kind: 0, pieceIdx: i, from, to, victimIdx: victim, plan: null });
      }
    }
  }
  return out;
}

// The en-passant window a just-made standard move opens (reference
// buildLastMoveRecord semantics: two-rank straight advance by a piece that
// can still be a pawn). `desc` must be the descriptor just made.
export function epWindowAfter(bd, desc) {
  if (desc.kind !== 0) return null;
  const w = bd.words[desc.pieceIdx];
  if (w & CAPTURED) return null;
  if (!(possibleOf(w) & TP)) return null;
  const df = (desc.to & 7) - (desc.from & 7);
  const dr = (desc.to >> 3) - (desc.from >> 3);
  if (df !== 0 || Math.abs(dr) !== 2) return null;
  return {
    victimIdx: desc.pieceIdx,
    to: desc.to,
    crossed: (desc.from + desc.to) >> 1,
    side: sideBit(w),
  };
}

export function makeCandidate(bd, desc) {
  if (desc.kind === 0) return makeStandardMove(bd, desc.pieceIdx, desc.to);
  if (desc.kind === 1) return makeEnPassant(bd, desc.pieceIdx, desc.to, desc.victimIdx);
  return makeCastle(bd, desc.plan);
}

export function forEachLegalReply(bd, side, ep, visit) {
  // En passant first.
  const eps = listEnPassant(bd, side, ep);
  for (const cand of eps) {
    const mark = watermark(bd);
    const from = sqOf(bd.words[cand.pieceIdx]);
    const legal = makeEnPassant(bd, cand.pieceIdx, cand.to, cand.victimIdx);
    if (legal) {
      visit({ kind: 'enpassant', pieceIdx: cand.pieceIdx, from, to: cand.to, victimIdx: cand.victimIdx, plan: null });
    }
    rollback(bd, mark);
  }

  // Standard moves.
  const dests = [];
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if ((w & CAPTURED) || sideBit(w) !== side) continue;
    const from = sqOf(w);
    const poss = possibleOf(w);
    // REF: mergedDestinations — union over types p..k, insertion order.
    dests.length = 0;
    seenGen += 1;
    for (let b = 1; b <= TK; b <<= 1) {
      if (!(poss & b)) continue;
      const before = dests.length;
      emitMovesForType(bd, b, from, side, dests);
      // Dedupe the freshly emitted block, preserving first occurrence.
      let write = before;
      for (let k = before; k < dests.length; k++) {
        const sq = dests[k];
        if (seenStamp[sq] !== seenGen) {
          seenStamp[sq] = seenGen;
          dests[write] = sq;
          write += 1;
        }
      }
      dests.length = write;
    }

    for (let d = 0; d < dests.length; d++) {
      const to = dests[d];
      const victim = bd.occ[to];
      const victimIdx = victim >= 0 && sideBit(bd.words[victim]) !== side ? victim : -1;
      const mark = watermark(bd);
      const legal = makeStandardMove(bd, i, to);
      if (legal) {
        visit({ kind: 'move', pieceIdx: i, from, to, victimIdx, plan: null });
      }
      rollback(bd, mark);
    }
  }

  // Castles (REF: pairs i<j over alive side pieces in array order).
  const sidePieces = [];
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if (!(w & CAPTURED) && sideBit(w) === side) sidePieces.push(i);
  }
  for (let a = 0; a < sidePieces.length; a++) {
    for (let b = a + 1; b < sidePieces.length; b++) {
      const plan = computeCastlePlan(bd, side, sidePieces[a], sidePieces[b]);
      if (!plan) continue;
      const mark = watermark(bd);
      const legal = makeCastle(bd, plan);
      if (legal) {
        visit({ kind: 'castle', pieceIdx: plan.i1, from: plan.from1, to: plan.to1, victimIdx: -1, plan });
      }
      rollback(bd, mark);
    }
  }
}
