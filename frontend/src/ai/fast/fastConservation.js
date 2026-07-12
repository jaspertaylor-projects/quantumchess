// frontend/src/ai/fast/fastConservation.js
// Purpose: Global conservation on the packed board — the journaled port of
// engineConservation.js. Same two solvers (Hall-set pass without promotions,
// exact Kuhn slot matching with them), same iteration orders, same fixpoint
// discipline; every write goes through setWord so callers can roll the whole
// cascade back to a watermark. Deliberate mirror points are marked "REF:".
// NOTE the reference computes side capacities ONCE per while-iteration and
// uses them stale while it restricts pieces inside that iteration — that
// staleness is replicated on purpose; "fixing" it would change game results.
// Imports From: ./fastBoard.js
// Exported To: ./fastRules.js

import {
  BLACK, CAPTURED, WAS_PROMOTED,
  TP, TN, TB, TR, TQ, TK, HEAVY_MASK,
  baseOf, promoOf, possibleOf, withMasks, popcount6, setWord, isCaptured, sideBit,
} from './fastBoard.js';

// REF: PIECE_LIMITS in PIECE_TYPES order p,n,b,r,q,k.
const LIMITS = [8, 2, 2, 2, 1, 1];
// REF: buildSlotPool — 16 slots as type bits, PIECE_TYPES order.
const SLOT_TYPE = [TP, TP, TP, TP, TP, TP, TP, TP, TN, TN, TB, TB, TR, TR, TQ, TK];
// REF: slotIdxByType — first slot index of each type (bit index -> slot).
const FIRST_SLOT = [0, 8, 10, 12, 14, 15];

const scratchConfirmed = new Int32Array(6);
const scratchRemaining = new Int32Array(6);

// REF: enforceGlobalTypeConstraintsOnce, Hall branch, for one side.
// Returns true if any word changed.
function hallPassSide(bd, side) {
  let any = false;
  let changed = true;
  while (changed) {
    changed = false;

    // REF: capacityInfoForSide — confirmed counts include CAPTURED pieces;
    // promo credits only living wasPromoted pieces; credits minus overflow
    // already confirmed above base limits.
    scratchConfirmed.fill(0);
    let promoTotal = 0;
    for (let i = 0; i < bd.n; i++) {
      const w = bd.words[i];
      if (sideBit(w) !== side) continue;
      const poss = possibleOf(w);
      if (popcount6(poss) === 1) scratchConfirmed[31 - Math.clz32(poss)] += 1;
      if (!(w & CAPTURED) && (w & WAS_PROMOTED)) promoTotal += 1;
    }
    let creditsUsed = 0;
    for (let t = 0; t < 6; t++) {
      scratchRemaining[t] = Math.max(0, LIMITS[t] - scratchConfirmed[t]);
      if ((1 << t) & HEAVY_MASK) creditsUsed += Math.max(0, scratchConfirmed[t] - LIMITS[t]);
    }
    const credits = Math.max(0, promoTotal - creditsUsed);

    // REF: stage 1 — capacity filter per piece (>1 possibility), using the
    // stale capInfo throughout this iteration.
    for (let i = 0; i < bd.n; i++) {
      const w = bd.words[i];
      if (sideBit(w) !== side) continue;
      const poss = possibleOf(w);
      if (popcount6(poss) <= 1) continue;
      let filtered = 0;
      for (let t = 0; t < 6; t++) {
        const bit = 1 << t;
        if (!(poss & bit)) continue;
        if (scratchRemaining[t] > 0 || ((bit & HEAVY_MASK) && credits > 0)) filtered |= bit;
      }
      if (filtered !== 0 && filtered !== poss) {
        setWord(bd, i, withMasks(w, baseOf(w) & filtered, promoOf(w) & filtered));
        changed = true;
        any = true;
      }
    }

    // REF: stage 2 — Hall-set exclusion over all 63 nonempty type subsets.
    // candidatePieces snapshot AFTER stage 1: side, alive.
    let totalRem = credits;
    for (let t = 0; t < 6; t++) totalRem += scratchRemaining[t];
    let candCount = 0;
    const cand = [];
    for (let i = 0; i < bd.n; i++) {
      const w = bd.words[i];
      if (sideBit(w) !== side || (w & CAPTURED)) continue;
      cand.push(i);
      candCount += 1;
    }
    if (candCount === 0 || totalRem === 0) continue;

    for (let S = 1; S < 64; S++) {
      // REF: capacityForSubset with the stale capInfo.
      let capS = (S & HEAVY_MASK) ? credits : 0;
      for (let t = 0; t < 6; t++) if (S & (1 << t)) capS += scratchRemaining[t];
      if (capS === 0) continue;

      let groupCount = 0;
      for (let k = 0; k < cand.length; k++) {
        const poss = possibleOf(bd.words[cand[k]]);
        if (popcount6(poss) > 1 && (poss & ~S) === 0) groupCount += 1;
      }
      if (groupCount === 0 || groupCount !== capS) continue;

      for (let k = 0; k < cand.length; k++) {
        const i = cand[k];
        const w = bd.words[i];
        const poss = possibleOf(w);
        if (popcount6(poss) <= 1) continue;
        if ((poss & ~S) === 0) continue; // group member
        const reduced = poss & ~S;
        if (reduced !== 0 && reduced !== poss) {
          setWord(bd, i, withMasks(w, baseOf(w) & reduced, promoOf(w) & reduced));
          changed = true;
          any = true;
        }
      }
    }
  }
  return any;
}

// REF: poolOptionsForPiece — base types as pools, plus the PAWN pool when any
// promo-origin identity exists.
const poolsOf = (w) => baseOf(w) | (promoOf(w) ? TP : 0);

// REF: canSeatAll — Kuhn matching, identical slot iteration order.
// options: array of pool masks; forcedPiece seated in forcedSlot first.
function canSeatAll(options, forcedPiece, forcedSlot) {
  const nSlots = SLOT_TYPE.length;
  const matchSlot = new Int8Array(nSlots).fill(-1);
  if (forcedPiece >= 0) matchSlot[forcedSlot] = forcedPiece;
  const visited = new Uint8Array(nSlots);

  const tryAssign = (u) => {
    for (let s = 0; s < nSlots; s++) {
      if (visited[s]) continue;
      if (!(options[u] & SLOT_TYPE[s])) continue;
      visited[s] = 1;
      const holder = matchSlot[s];
      if (holder === -1 || (holder !== forcedPiece && tryAssign(holder))) {
        matchSlot[s] = u;
        return true;
      }
    }
    return false;
  };

  for (let u = 0; u < options.length; u++) {
    if (u === forcedPiece) continue;
    visited.fill(0);
    if (forcedSlot >= 0) visited[forcedSlot] = 1;
    if (!tryAssign(u)) return false;
  }
  return true;
}

// REF: matchingPruneSide — promotion-aware exact pruning for one side.
function matchingPruneSide(bd, side) {
  const idxs = [];
  for (let i = 0; i < bd.n; i++) if (sideBit(bd.words[i]) === side) idxs.push(i);
  if (idxs.length === 0 || idxs.length > SLOT_TYPE.length) return false;
  const options = idxs.map((i) => poolsOf(bd.words[i]));

  if (!canSeatAll(options, -1, -1)) return false;

  let changed = false;
  for (let k = 0; k < idxs.length; k++) {
    const pools = options[k];
    if (popcount6(pools) <= 1) continue;
    let feasible = 0;
    for (let t = 0; t < 6; t++) {
      const bit = 1 << t;
      if (!(pools & bit)) continue;
      if (canSeatAll(options, k, FIRST_SLOT[t])) feasible |= bit;
    }
    if (feasible === 0) continue;
    const i = idxs[k];
    const w = bd.words[i];
    const newBase = baseOf(w) & feasible;
    const newPromo = (feasible & TP) ? promoOf(w) : 0;
    if ((newBase | newPromo) === 0) continue;
    if (newBase !== baseOf(w) || newPromo !== promoOf(w)) {
      setWord(bd, i, withMasks(w, newBase, newPromo));
      options[k] = poolsOf(bd.words[i]);
      changed = true;
    }
  }
  return changed;
}

// Run one side to its own fixpoint. Returns true when the side may NOT be at
// a fixpoint yet (only possible via the matching guard cap).
function runSide(bd, side) {
  let hasPromo = false;
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if (sideBit(w) === side && promoOf(w) !== 0) { hasPromo = true; break; }
  }
  if (hasPromo) {
    // REF: guarded matching loop; if the guard cap cut it short while still
    // changing, the caller must run this side again.
    let guard = 0;
    let changed = matchingPruneSide(bd, side);
    while (changed && guard < 8) {
      guard += 1;
      changed = matchingPruneSide(bd, side);
    }
    return changed;
  }
  hallPassSide(bd, side); // internal while-loop ends at the side's fixpoint
  return false;
}

// REF: applyQuantumConstraints = per-side solve iterated to a fixpoint.
// The two sides are INDEPENDENT (each side's census reads only its own
// pieces), so per-side fixpoints compose to the reference's global fixpoint
// and callers may pass `dirty` to solve only the side(s) whose pieces
// changed — bit 1 white, bit 2 black, default both.
export function applyConstraintsFast(bd, dirty = 3) {
  while (dirty) {
    let next = 0;
    if ((dirty & 1) && runSide(bd, 0)) next |= 1;
    if ((dirty & 2) && runSide(bd, BLACK)) next |= 2;
    dirty = next;
  }
}
