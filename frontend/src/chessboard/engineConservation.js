// frontend/src/chessboard/engineConservation.js
// Purpose: Global conservation — a possibility is
// real iff some full seating of the side's 16 slots uses it. Promotion-aware:
// a promo-origin identity occupies a PAWN slot (one pawn out, one heavy in).
// Runs the cheap Hall-set pass when no promotions exist, exact Kuhn matching
// otherwise, iterated to a fixpoint. Split out of quantumEngine.js (which
// re-exports applyQuantumConstraints).
// Imports From: ./gameConstants.js, ./engineTypes.js
// Exported To: ./quantumEngine.js

import { HEAVY_TYPES, PIECE_LIMITS, PIECE_TYPES } from './gameConstants.js';
import { clonePieces, getBaseTypes, getPromoTypes, restrictTypes, withTypes } from './engineTypes.js';

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

// --- Slot-matching conservation (exact, promotion-aware) ---
// A side's ground truth is an assignment of each of its pieces (living and
// captured) to one of 16 slots: 8 pawn, 2 knight, 2 bishop, 2 rook, 1 queen,
// 1 king. A base-origin identity occupies its own type's slot; any
// promo-origin identity occupies a PAWN slot (one pawn out, one heavy in).
// A possibility is real iff some full seating of the side uses it.

function buildSlotPool() {
  const slots = [];
  for (const t of PIECE_TYPES) {
    const cap = PIECE_LIMITS[t] || 0;
    for (let i = 0; i < cap; i++) slots.push(t);
  }
  return slots;
}

function poolOptionsForPiece(p) {
  const pools = new Set(getBaseTypes(p));
  if (getPromoTypes(p).length > 0) pools.add('p');
  return pools;
}

// Kuhn's augmenting-path bipartite matching: can every piece be seated in a
// distinct slot? Optionally pre-seats one piece in one slot to test support.
function canSeatAll(pieceOptions, slots, forcedPieceIdx = -1, forcedSlotIdx = -1) {
  const matchSlot = new Array(slots.length).fill(-1);
  if (forcedPieceIdx >= 0) matchSlot[forcedSlotIdx] = forcedPieceIdx;

  const tryAssign = (u, visited) => {
    for (let s = 0; s < slots.length; s++) {
      if (visited[s]) continue;
      if (!pieceOptions[u].has(slots[s])) continue;
      visited[s] = true;
      const holder = matchSlot[s];
      if (holder === -1 || (holder !== forcedPieceIdx && tryAssign(holder, visited))) {
        matchSlot[s] = u;
        return true;
      }
    }
    return false;
  };

  for (let u = 0; u < pieceOptions.length; u++) {
    if (u === forcedPieceIdx) continue;
    const visited = new Array(slots.length).fill(false);
    if (forcedSlotIdx >= 0) visited[forcedSlotIdx] = true;
    if (!tryAssign(u, visited)) return false;
  }
  return true;
}

// Whether the side still has at least one complete census seating. Zap uses
// this before committing a volley: collapse chains are welcome, but removing
// a combination of possibilities that leaves no legal chess set is not.
export function isCensusConsistent(pieces, side) {
  const sidePieces = pieces.filter((p) => p.side === side);
  const slots = buildSlotPool();
  if (sidePieces.length === 0) return true;
  if (sidePieces.length > slots.length) return false;
  return canSeatAll(sidePieces.map(poolOptionsForPiece), slots);
}

// Prune every (piece, pool) option that appears in no full seating.
// Returns whether anything changed; returns false untouched when the side has
// no consistent seating at all (a lost/terminal state the game-over logic owns).
function matchingPruneSide(updated, side) {
  const sidePieces = updated.filter((p) => p.side === side);
  const slots = buildSlotPool();
  if (sidePieces.length === 0 || sidePieces.length > slots.length) return false;
  const options = sidePieces.map(poolOptionsForPiece);

  if (!canSeatAll(options, slots)) return false;

  const slotIdxByType = {};
  slots.forEach((t, i) => { if (!(t in slotIdxByType)) slotIdxByType[t] = i; });

  let changed = false;
  sidePieces.forEach((p, i) => {
    const pools = options[i];
    if (pools.size <= 1) return;
    const feasible = new Set();
    for (const t of pools) {
      if (canSeatAll(options, slots, i, slotIdxByType[t])) feasible.add(t);
    }
    if (feasible.size === 0) return;
    const newBase = getBaseTypes(p).filter((t) => feasible.has(t));
    const newPromo = feasible.has('p') ? getPromoTypes(p) : [];
    if (newBase.length + newPromo.length === 0) return;
    if (newBase.length !== getBaseTypes(p).length || newPromo.length !== getPromoTypes(p).length) {
      withTypes(p, newBase, newPromo);
      options[i] = poolOptionsForPiece(p);
      changed = true;
    }
  });
  return changed;
}

function enforceGlobalTypeConstraintsOnce(pieces) {
  const updated = clonePieces(pieces);
  const sides = ['white', 'black'];

  for (const side of sides) {
    // Once a side has any pawn-funded identity, exact slot matching is
    // required; the cheaper Hall-set pass below is only sound without promos.
    const hasPromo = updated.some((p) => p.side === side && getPromoTypes(p).length > 0);
    if (hasPromo) {
      let guard = 0;
      while (matchingPruneSide(updated, side) && guard < 8) guard += 1;
      continue;
    }

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
          restrictTypes(p, filtered);
          changed = true;
        }
      }

      const candidatePieces = updated.filter(
        (p) => p.side === side && !p.captured && p.possibleTypes.length >= 1 && p.possibleTypes.length <= PIECE_TYPES.length
      );

      const totalRem = totalCapacityLeft(capInfo);
      if (candidatePieces.length === 0 || totalRem === 0) continue;

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
              restrictTypes(p, reduced);
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
  const sig = (p) => `${(p.possibleTypes || []).join('')}|${getBaseTypes(p).join('')}|${getPromoTypes(p).join('')}`;
  let current = clonePieces(pieces);
  while (true) {
    const next = enforceGlobalTypeConstraintsOnce(current);
    let diff = false;
    for (let i = 0; i < current.length; i++) {
      if (sig(current[i]) !== sig(next[i])) { diff = true; break; }
    }
    if (!diff) return next;
    current = next;
  }
}

// Run global conservation to a fixpoint. (Castled pairs need no special
// link: if one partner resolves to the King, conservation strips King from
// everything else — the census IS the correlation.)
export function applyQuantumConstraints(pieces) {
  return enforceGlobalTypeConstraintsToFixpoint(pieces);
}
