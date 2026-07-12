// frontend/src/ai/fast/fastGeometry.js
// Purpose: Movement geometry on the packed board — precomputed step targets
// and rays per square. EMIT ORDER IS SEMANTICS: the reference engine's move
// lists feed insertion-ordered Sets and stable sorts, so every generator here
// walks deltas in exactly engineGeometry.js's order (marked REF:). Also the
// reverse attack test used for collapsed-king legality.
// Imports From: ./fastBoard.js
// Exported To: ./fastRules.js, ./fastEval.js

import { SQ, sideBit, BLACK, TP, TN, TB, TR, TQ, TK } from './fastBoard.js';

// REF: engineGeometry delta orders.
const ORTHO_DELTAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG_DELTAS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const QUEEN_DELTAS = [...ORTHO_DELTAS, ...DIAG_DELTAS];
const KING_STEPS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
const KNIGHT_STEPS = [
  [-1, -2], [1, -2], [-2, -1], [2, -1],
  [-2, 1], [2, 1], [-1, 2], [1, 2],
];

const inB = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

function stepTable(steps) {
  const t = new Array(64);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const out = [];
      for (const [df, dr] of steps) if (inB(f + df, r + dr)) out.push(SQ(f + df, r + dr));
      t[SQ(f, r)] = Int8Array.from(out);
    }
  }
  return t;
}

// rays[sq] = array of rays (delta order preserved); each ray = squares
// walking outward. Empty rays are dropped but ORDER of remaining rays keeps
// the delta order (matches reference: an empty ray emits nothing anyway).
function rayTable(deltas) {
  const t = new Array(64);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const rays = [];
      for (const [df, dr] of deltas) {
        const ray = [];
        let ff = f + df;
        let rr = r + dr;
        while (inB(ff, rr)) {
          ray.push(SQ(ff, rr));
          ff += df;
          rr += dr;
        }
        if (ray.length) rays.push(Int8Array.from(ray));
      }
      t[SQ(f, r)] = rays;
    }
  }
  return t;
}

export const KNIGHT_T = stepTable(KNIGHT_STEPS);
export const KING_T = stepTable(KING_STEPS);
export const ORTHO_RAYS = rayTable(ORTHO_DELTAS);
export const DIAG_RAYS = rayTable(DIAG_DELTAS);
export const QUEEN_RAYS = rayTable(QUEEN_DELTAS);

// Pawn attack targets (REF order: file-1 then file+1) per side, and pawn
// attack SOURCES per side (squares from which a side's pawn attacks sq).
function pawnAtkTable(dir) {
  const t = new Array(64);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const out = [];
      if (inB(f - 1, r + dir)) out.push(SQ(f - 1, r + dir));
      if (inB(f + 1, r + dir)) out.push(SQ(f + 1, r + dir));
      t[SQ(f, r)] = Int8Array.from(out);
    }
  }
  return t;
}
export const PAWN_ATK_W = pawnAtkTable(1);
export const PAWN_ATK_B = pawnAtkTable(-1);
function pawnSrcTable(dir) {
  const t = new Array(64);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const out = [];
      if (inB(f - 1, r - dir)) out.push(SQ(f - 1, r - dir));
      if (inB(f + 1, r - dir)) out.push(SQ(f + 1, r - dir));
      t[SQ(f, r)] = Int8Array.from(out);
    }
  }
  return t;
}
export const PAWN_SRC_W = pawnSrcTable(1); // squares a WHITE pawn attacks sq from
export const PAWN_SRC_B = pawnSrcTable(-1);

// --- Move emission (REF: engineGeometry movesForType) ---
// All emitters append destination squares to `out` in reference order.
// `mySide` is the mover's side bit (0 or BLACK); occ maps square -> piece
// index (-1 empty); sideAt(bd, idx) resolved via words.

function emitRayMoves(bd, rays, mySide, out) {
  for (const ray of rays) {
    for (let k = 0; k < ray.length; k++) {
      const sq = ray[k];
      const b = bd.occ[sq];
      if (b >= 0) {
        if (sideBit(bd.words[b]) !== mySide) out.push(sq);
        break;
      }
      out.push(sq);
    }
  }
}

function emitStepMoves(bd, targets, mySide, out) {
  for (let k = 0; k < targets.length; k++) {
    const sq = targets[k];
    const b = bd.occ[sq];
    if (b < 0 || sideBit(bd.words[b]) !== mySide) out.push(sq);
  }
}

function emitPawnMoves(bd, from, mySide, out) {
  const dir = mySide === BLACK ? -8 : 8;
  const rank = from >> 3;
  const one = from + dir;
  if (one >= 0 && one < 64 && bd.occ[one] < 0) out.push(one);
  // REF: double step from the side's own first two ranks, both squares empty.
  const onHome = mySide === BLACK ? rank >= 6 : rank <= 1;
  if (onHome) {
    const two = from + 2 * dir;
    if (two >= 0 && two < 64 && bd.occ[one] < 0 && bd.occ[two] < 0) out.push(two);
  }
  const atk = mySide === BLACK ? PAWN_ATK_B[from] : PAWN_ATK_W[from];
  for (let k = 0; k < atk.length; k++) {
    const sq = atk[k];
    const b = bd.occ[sq];
    if (b >= 0 && sideBit(bd.words[b]) !== mySide) out.push(sq);
  }
}

export function emitMovesForType(bd, typeBit, from, mySide, out) {
  switch (typeBit) {
    case TP: emitPawnMoves(bd, from, mySide, out); break;
    case TN: emitStepMoves(bd, KNIGHT_T[from], mySide, out); break;
    case TB: emitRayMoves(bd, DIAG_RAYS[from], mySide, out); break;
    case TR: emitRayMoves(bd, ORTHO_RAYS[from], mySide, out); break;
    case TQ: emitRayMoves(bd, QUEEN_RAYS[from], mySide, out); break;
    case TK: emitStepMoves(bd, KING_T[from], mySide, out); break;
    default: break;
  }
}

// --- Attack emission (REF: attacksForType — blocker squares included) ---
export function emitAttacksForType(bd, typeBit, from, mySide, out) {
  switch (typeBit) {
    case TP: {
      const atk = mySide === BLACK ? PAWN_ATK_B[from] : PAWN_ATK_W[from];
      for (let k = 0; k < atk.length; k++) out.push(atk[k]);
      break;
    }
    case TN: {
      const t = KNIGHT_T[from];
      for (let k = 0; k < t.length; k++) out.push(t[k]);
      break;
    }
    case TK: {
      const t = KING_T[from];
      for (let k = 0; k < t.length; k++) out.push(t[k]);
      break;
    }
    case TB: emitRayAttacks(bd, DIAG_RAYS[from], out); break;
    case TR: emitRayAttacks(bd, ORTHO_RAYS[from], out); break;
    case TQ: emitRayAttacks(bd, QUEEN_RAYS[from], out); break;
    default: break;
  }
}

function emitRayAttacks(bd, rays, out) {
  for (const ray of rays) {
    for (let k = 0; k < ray.length; k++) {
      const sq = ray[k];
      out.push(sq);
      if (bd.occ[sq] >= 0) break;
    }
  }
}

// --- Per-type "can this type make from->to" (REF: subsetTypesThatCanMakeMove
// via movesForType membership). Only ever asked for destinations that came
// from the merged move set, so it mirrors movesForType exactly.
export function typeCanMove(bd, typeBit, from, to, mySide) {
  const df = (to & 7) - (from & 7);
  const dr = (to >> 3) - (from >> 3);
  const target = bd.occ[to];
  const targetEnemy = target >= 0 && sideBit(bd.words[target]) !== mySide;
  switch (typeBit) {
    case TP: {
      const dir = mySide === BLACK ? -1 : 1;
      if (df === 0 && dr === dir) return target < 0;
      if (df === 0 && dr === 2 * dir) {
        const rank = from >> 3;
        const onHome = mySide === BLACK ? rank >= 6 : rank <= 1;
        return onHome && target < 0 && bd.occ[from + 8 * dir] < 0;
      }
      if (Math.abs(df) === 1 && dr === dir) return targetEnemy;
      return false;
    }
    case TN:
      return ((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1)) &&
        (target < 0 || targetEnemy);
    case TK:
      return df !== 0 || dr !== 0
        ? Math.abs(df) <= 1 && Math.abs(dr) <= 1 && (target < 0 || targetEnemy)
        : false;
    case TB:
      if (Math.abs(df) !== Math.abs(dr) || df === 0) return false;
      return rayClear(bd, from, to, df > 0 ? 1 : -1, dr > 0 ? 8 : -8) && (target < 0 || targetEnemy);
    case TR:
      if (df !== 0 && dr !== 0) return false;
      if (df === 0 && dr === 0) return false;
      return rayClear(bd, from, to, df === 0 ? 0 : df > 0 ? 1 : -1, dr === 0 ? 0 : dr > 0 ? 8 : -8) &&
        (target < 0 || targetEnemy);
    case TQ: {
      const diag = Math.abs(df) === Math.abs(dr) && df !== 0;
      const ortho = (df === 0) !== (dr === 0);
      if (!diag && !ortho) return false;
      return rayClear(bd, from, to, df === 0 ? 0 : df > 0 ? 1 : -1, dr === 0 ? 0 : dr > 0 ? 8 : -8) &&
        (target < 0 || targetEnemy);
    }
    default:
      return false;
  }
}

function rayClear(bd, from, to, stepF, stepR) {
  const step = stepF + stepR;
  for (let sq = from + step; sq !== to; sq += step) {
    if (bd.occ[sq] >= 0) return false;
  }
  return true;
}

// --- Reverse attack test (REF: canSideCaptureSquare — "does any piece of
// `bySide` have a movesForType containing `sq`"). Only ever called for
// OCCUPIED squares (a king stands there), where movesForType membership is
// exactly attack reach: pawn pushes are excluded by the blocker, diagonals
// and rays/steps land on the enemy piece.
export function isSquareCapturableBy(bd, sq, bySide) {
  // Pawn sources.
  const psrc = bySide === BLACK ? PAWN_SRC_B[sq] : PAWN_SRC_W[sq];
  for (let k = 0; k < psrc.length; k++) {
    const i = bd.occ[psrc[k]];
    if (i >= 0) {
      const w = bd.words[i];
      if (sideBit(w) === bySide && (((w >> 8) | (w >> 14)) & TP)) return true;
    }
  }
  // Knight sources.
  const kn = KNIGHT_T[sq];
  for (let k = 0; k < kn.length; k++) {
    const i = bd.occ[kn[k]];
    if (i >= 0) {
      const w = bd.words[i];
      if (sideBit(w) === bySide && (((w >> 8) | (w >> 14)) & TN)) return true;
    }
  }
  // King sources.
  const kg = KING_T[sq];
  for (let k = 0; k < kg.length; k++) {
    const i = bd.occ[kg[k]];
    if (i >= 0) {
      const w = bd.words[i];
      if (sideBit(w) === bySide && (((w >> 8) | (w >> 14)) & TK)) return true;
    }
  }
  // Ortho rays: first blocker with r|q.
  for (const ray of ORTHO_RAYS[sq]) {
    for (let k = 0; k < ray.length; k++) {
      const i = bd.occ[ray[k]];
      if (i >= 0) {
        const w = bd.words[i];
        if (sideBit(w) === bySide && (((w >> 8) | (w >> 14)) & (TR | TQ))) return true;
        break;
      }
    }
  }
  // Diag rays: first blocker with b|q.
  for (const ray of DIAG_RAYS[sq]) {
    for (let k = 0; k < ray.length; k++) {
      const i = bd.occ[ray[k]];
      if (i >= 0) {
        const w = bd.words[i];
        if (sideBit(w) === bySide && (((w >> 8) | (w >> 14)) & (TB | TQ))) return true;
        break;
      }
    }
  }
  return false;
}
