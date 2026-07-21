// frontend/src/ai/fast/fastEval.js
// Purpose: Static evaluation on the packed board — a statement-for-statement
// port of alphaBetaEngine.js evaluatePosition. FLOATING-POINT ORDER IS
// SEMANTICS here: the search compares child scores, and stable-sort ties must
// break identically to the reference, so every term is accumulated in exactly
// the reference's statement order (marked REF: where the mapping is not
// obvious). Only the data structures changed: attack Sets/Maps became flag
// and cheapest arrays.
// Imports From: ./fastBoard.js, ./fastGeometry.js
// Exported To: ./fastSearch.js, ../../../tests/fastEngineDiff.test.js

import {
  BLACK, CAPTURED, HAS_MOVED,
  TP, TN, TK,
  sqOf, sideBit, possibleOf, promoOf, popcount6,
} from './fastBoard.js';
import { emitAttacksForType } from './fastGeometry.js';

export const MATE = 1000;

// REF: VAL by bit index p,n,b,r,q,k.
const VAL = [1, 3, 3.1, 5, 9, 0];

const KING_SPREAD_CAP = 5;

// Attack info scratch (eval is single-threaded and non-reentrant).
const atkW = new Uint8Array(64);
const atkB = new Uint8Array(64);
const cheapW = new Float64Array(64);
const cheapB = new Float64Array(64);
const scratchSquares = [];

// REF: collapseValue — value of the least valuable non-king possibility.
function collapseValue(poss) {
  const nonKing = poss & ~TK;
  if (!nonKing) return 0;
  return VAL[31 - Math.clz32(nonKing & -nonKing)];
}

// REF: evaluatePosition. White-positive pawns.
export function evaluateFast(bd, W) {
  // Track King-holder spread for revealed-King safety and ambiguity value.
  let whiteHolders = 0;
  let blackHolders = 0;
  let whiteSoleSq = -1;
  let blackSoleSq = -1;
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if (w & CAPTURED) continue;
    if (!(possibleOf(w) & TK)) continue;
    if (sideBit(w) === BLACK) {
      blackHolders += 1;
      blackSoleSq = sqOf(w);
    } else {
      whiteHolders += 1;
      whiteSoleSq = sqOf(w);
    }
  }
  // REF: buildAttackInfo — squares + cheapest attacker value per side.
  atkW.fill(0);
  atkB.fill(0);
  cheapW.fill(Infinity);
  cheapB.fill(Infinity);
  let mobW = 0;
  let mobB = 0;
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    if (w & CAPTURED) continue;
    const side = sideBit(w);
    const from = sqOf(w);
    const poss = possibleOf(w);
    const flags = side === BLACK ? atkB : atkW;
    const cheap = side === BLACK ? cheapB : cheapW;
    for (let b = 1, t = 0; b <= TK; b <<= 1, t++) {
      if (!(poss & b)) continue;
      scratchSquares.length = 0;
      emitAttacksForType(bd, b, from, side, scratchSquares);
      const v = VAL[t];
      for (let k = 0; k < scratchSquares.length; k++) {
        const sq = scratchSquares[k];
        if (!flags[sq]) {
          flags[sq] = 1;
          if (side === BLACK) mobB += 1;
          else mobW += 1;
        }
        if (v < cheap[sq]) cheap[sq] = v;
      }
    }
  }

  let score = 0;
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    const sign = sideBit(w) === BLACK ? -1 : 1;
    const poss = possibleOf(w);

    if (w & CAPTURED) {
      // REF: VAL[possibleTypes[0]] — lowest set bit's value.
      score -= sign * W.material * (poss ? VAL[31 - Math.clz32(poss & -poss)] : 0);
      continue;
    }

    const sq = sqOf(w);
    const enemyFlags = sideBit(w) === BLACK ? atkW : atkB;
    const enemyCheap = sideBit(w) === BLACK ? cheapW : cheapB;
    const friendCheap = sideBit(w) === BLACK ? cheapB : cheapW;
    const riskValue = collapseValue(poss);
    const nTypes = popcount6(poss);

    if (nTypes > 1) score += sign * W.extraType * (nTypes - 1);
    if (poss & TN) score += sign * W.knightIdentity;
    if (enemyFlags[sq] && nTypes > 1) {
      score -= sign * W.enemyContact * Math.min(3, nTypes - 1);
    }
    if (friendCheap[sq] !== Infinity && nTypes < 6) {
      score += sign * W.friendlyContact * Math.min(3, 6 - nTypes);
    }

    if (enemyFlags[sq] && riskValue > 0.01) {
      const defended = friendCheap[sq] !== Infinity;
      if (!defended) {
        score -= sign * W.hangUndefended * riskValue;
      } else {
        const cheapest = enemyCheap[sq] !== Infinity ? enemyCheap[sq] : 99;
        if (cheapest < riskValue) score -= sign * W.hangBadTrade * (riskValue - cheapest);
      }
    }

    const f = sq & 7;
    const r = sq >> 3;
    const centrality = 3.5 - Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
    score += sign * W.center * centrality;
    if (poss & TP) {
      const progress = sideBit(w) === BLACK ? 6 - r : r - 1;
      if (progress > 0) score += sign * (W.pawnAdvance * progress + W.pawnRace * progress * progress);
    }
    if (poss & TP) {
      const stepsToGo = sideBit(w) === BLACK ? r : 7 - r;
      if (stepsToGo === 1 || stepsToGo === 2) {
        const dir = sideBit(w) === BLACK ? -1 : 1;
        const promoRank = sideBit(w) === BLACK ? 0 : 7;
        const promoSq = promoRank * 8 + f;
        let pathClear = true;
        for (let rr = r + dir; rr >= 0 && rr <= 7; rr += dir) {
          if (bd.occ[rr * 8 + f] >= 0) { pathClear = false; break; }
        }
        const unstoppable = pathClear && !enemyFlags[promoSq] && !enemyFlags[sq];
        const base = stepsToGo === 1 ? W.promoImminent : W.promoNear;
        score += sign * base * (unstoppable ? 1 : 0.35);
      }
    }
    if (w & HAS_MOVED) score += sign * W.development;
    // Banked promotion (see W.promoBank) — REF: same accumulation spot.
    if (promoOf(w) !== 0) score += sign * W.promoBank;
  }

  score += W.mobility * (mobW - mobB);
  score += W.kingSpread * (Math.min(whiteHolders, KING_SPREAD_CAP) - Math.min(blackHolders, KING_SPREAD_CAP));

  // REF: huntPressure — attacked squares in the 3x3 around a sole holder.
  const huntPressure = (holderSq, attackerFlags) => {
    const hf = holderSq & 7;
    const hr = holderSq >> 3;
    let count = 0;
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const f2 = hf + df;
        const r2 = hr + dr;
        if (f2 < 0 || f2 > 7 || r2 < 0 || r2 > 7) continue;
        if (attackerFlags[r2 * 8 + f2]) count += 1;
      }
    }
    return count;
  };

  if (whiteHolders === 1) {
    if (atkB[whiteSoleSq]) {
      // Collapsed = the sole holder is a known king.
      let collapsed = false;
      for (let i = 0; i < bd.n; i++) {
        const w = bd.words[i];
        if (!(w & CAPTURED) && sideBit(w) !== BLACK && (possibleOf(w) & TK)) {
          collapsed = popcount6(possibleOf(w)) === 1;
          break;
        }
      }
      score -= collapsed ? W.soleKingCollapsedAttacked : W.soleKingAttacked;
    }
    score -= W.kingHunt * huntPressure(whiteSoleSq, atkB);
  }
  if (blackHolders === 1) {
    if (atkW[blackSoleSq]) {
      let collapsed = false;
      for (let i = 0; i < bd.n; i++) {
        const w = bd.words[i];
        if (!(w & CAPTURED) && sideBit(w) === BLACK && (possibleOf(w) & TK)) {
          collapsed = popcount6(possibleOf(w)) === 1;
          break;
        }
      }
      score += collapsed ? W.soleKingCollapsedAttacked : W.soleKingAttacked;
    }
    score += W.kingHunt * huntPressure(blackSoleSq, atkW);
  }

  // REF: mop-up, gated on a decisive advantage against a sole holder.
  const mopUp = (loserSq, winnerIsBlackBit) => {
    const lf = loserSq & 7;
    const lr = loserSq >> 3;
    const centerDist = Math.max(Math.abs(lf - 3.5), Math.abs(lr - 3.5)) - 0.5;
    let proximity = 0;
    let n = 0;
    for (let i = 0; i < bd.n; i++) {
      const w = bd.words[i];
      if (w & CAPTURED) continue;
      if (sideBit(w) !== winnerIsBlackBit) continue;
      const psq = sqOf(w);
      const d = Math.max(Math.abs((psq & 7) - lf), Math.abs((psq >> 3) - lr));
      proximity += 7 - d;
      n += 1;
    }
    const avgProx = n ? proximity / n : 0;
    return W.mopUpEdge * centerDist + W.mopUpClose * avgProx;
  };
  if (blackHolders === 1 && score >= W.mopUpThreshold) score += mopUp(blackSoleSq, 0);
  else if (whiteHolders === 1 && -score >= W.mopUpThreshold) score -= mopUp(whiteSoleSq, BLACK);

  return score;
}
