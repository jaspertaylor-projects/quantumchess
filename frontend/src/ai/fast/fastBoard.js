// frontend/src/ai/fast/fastBoard.js
// Purpose: Packed board for the fast search engine. One piece = one Int32
// word (square, captured, side, base/promo type masks, moved/promoted/castled
// flags); the whole position is 32 words + a 64-entry occupancy index. All
// mutation goes through setWord, which journals (index, oldWord) pairs so any
// state can be rolled back to a watermark — the journal IS make/unmake and
// (in fastRules) the zap cleanliness test. The packed engine is SEARCH-ONLY:
// the game path stays on chessboard/quantumEngine.js, and pack/unpack is the
// boundary. Semantics must mirror the reference engine bit-for-bit; every
// deliberate mirror point is marked "REF:".
// Imports From: None
// Exported To: ./fastGeometry.js, ./fastConservation.js, ./fastRules.js,
//   ./fastEval.js, ./fastSearch.js, ../../../tests/fastEngineDiff.test.js

// Type bits, in reference PIECE_TYPES order (p,n,b,r,q,k) so that ascending
// bit order == reference type order everywhere (orderTypes, LEAST_VALUABLE).
export const TP = 1; // pawn
export const TN = 2; // knight
export const TB = 4; // bishop
export const TR = 8; // rook
export const TQ = 16; // queen
export const TK = 32; // king
export const ALL_TYPES = 63;
export const HEAVY_MASK = TN | TB | TR | TQ;
export const BIT_TYPE = ['p', 'n', 'b', 'r', 'q', 'k'];
export const TYPE_BIT = { p: TP, n: TN, b: TB, r: TR, q: TQ, k: TK };

// Word layout.
export const SQ_MASK = 63;
export const CAPTURED = 1 << 6;
export const BLACK = 1 << 7; // side bit: 0 white, 1 black
export const BASE_SHIFT = 8;
export const PROMO_SHIFT = 14;
export const HAS_MOVED = 1 << 20;
export const WAS_PROMOTED = 1 << 21;
export const CASTLED = 1 << 22;

export const sqOf = (w) => w & SQ_MASK;
export const isCaptured = (w) => (w & CAPTURED) !== 0;
export const sideBit = (w) => w & BLACK; // 0 or BLACK
export const baseOf = (w) => (w >> BASE_SHIFT) & 63;
export const promoOf = (w) => (w >> PROMO_SHIFT) & 63;
export const possibleOf = (w) => ((w >> BASE_SHIFT) & 63) | ((w >> PROMO_SHIFT) & 63);

export function withMasks(w, base, promo) {
  return (w & ~((63 << BASE_SHIFT) | (63 << PROMO_SHIFT))) | (base << BASE_SHIFT) | (promo << PROMO_SHIFT);
}

export function popcount6(m) {
  m = m - ((m >> 1) & 0x15); // 6-bit popcount (0b010101)
  m = (m & 0x33) + ((m >> 2) & 0x33);
  return (m + (m >> 4)) & 0xf;
}

export const lowestBit = (m) => m & -m;

// Square index: rank * 8 + file (a1 = 0, h1 = 7, a8 = 56).
export const SQ = (file, rank) => rank * 8 + file;
export const fileOf = (sq) => sq & 7;
export const rankOf = (sq) => sq >> 3;

export const ALGEBRAIC = (() => {
  const out = new Array(64);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) out[r * 8 + f] = 'abcdefgh'[f] + '12345678'[r];
  return out;
})();

export function parseSquare(s) {
  if (typeof s !== 'string' || s.length !== 2) return -1;
  const f = s.charCodeAt(0) - 97;
  const r = s.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 8 + f;
}

export function maskFromTypes(list) {
  let m = 0;
  for (const t of list || []) m |= TYPE_BIT[t] || 0;
  return m;
}

export function typesFromMask(m) {
  const out = [];
  for (let i = 0; i < 6; i++) if (m & (1 << i)) out.push(BIT_TYPE[i]);
  return out;
}

// Debug mode: search entry points verify root-state restoration after every
// call. Cheap (one 32-word compare) — tests keep it on permanently.
export let FAST_DEBUG = false;
export function setFastDebug(v) {
  FAST_DEBUG = Boolean(v);
}

// --- Board struct ---
// words: Int32Array(n) piece words, in the SAME order as the source pieces
// array (reference iteration order = array order, so order is semantics).
// occ: square -> piece index, -1 empty. ids/moveCounts: pack-time metadata
// used only at the unpack boundary. journal: flat [idx, oldWord, ...] pairs.
export function packBoard(pieces) {
  const n = pieces.length;
  const bd = {
    n,
    words: new Int32Array(n),
    occ: new Int8Array(64).fill(-1),
    ids: new Array(n),
    moveCounts: new Int32Array(n),
    captureIdxs: new Array(n),
    journal: [],
    debug: FAST_DEBUG,
  };
  for (let i = 0; i < n; i++) {
    const p = pieces[i];
    bd.ids[i] = p.id;
    bd.moveCounts[i] = p.moveCount || 0;
    bd.captureIdxs[i] = p.captureIndex;
    const captured = p.captured || !p.square;
    const sq = captured ? 0 : parseSquare(p.square);
    const base = maskFromTypes(Array.isArray(p.baseTypes) ? p.baseTypes : p.possibleTypes || []);
    const promo = maskFromTypes(Array.isArray(p.promoTypes) ? p.promoTypes : []);
    let w = sq & SQ_MASK;
    if (captured) w |= CAPTURED;
    if (p.side === 'black') w |= BLACK;
    w |= (base << BASE_SHIFT) | (promo << PROMO_SHIFT);
    if ((p.moveCount || 0) > 0) w |= HAS_MOVED;
    if (p.wasPromoted) w |= WAS_PROMOTED;
    if (p.castled) w |= CASTLED;
    bd.words[i] = w;
    if (!captured) bd.occ[sq] = i;
  }
  return bd;
}

// The single mutation point: journals the old word and keeps occ in sync.
export function setWord(bd, i, w) {
  const old = bd.words[i];
  if (old === w) return;
  bd.journal.push(i, old);
  bd.words[i] = w;
  if ((old ^ w) & (SQ_MASK | CAPTURED)) {
    // Guarded vacate: during a castle the partner may already have claimed
    // this square in the same make — only clear an occ entry we still own.
    if (!(old & CAPTURED) && bd.occ[old & SQ_MASK] === i) bd.occ[old & SQ_MASK] = -1;
    if (!(w & CAPTURED)) bd.occ[w & SQ_MASK] = i;
  }
}

export const watermark = (bd) => bd.journal.length;

export function rollback(bd, mark) {
  const j = bd.journal;
  while (j.length > mark) {
    const old = j.pop();
    const i = j.pop();
    const cur = bd.words[i];
    bd.words[i] = old;
    if ((cur ^ old) & (SQ_MASK | CAPTURED)) {
      if (!(cur & CAPTURED) && bd.occ[cur & SQ_MASK] === i) bd.occ[cur & SQ_MASK] = -1;
      if (!(old & CAPTURED)) bd.occ[old & SQ_MASK] = i;
    }
  }
}

export const snapshotWords = (bd) => bd.words.slice();

export function wordsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Unpack to reference-shaped piece objects. `moveBumps` maps pieceIdx ->
// extra move count (root materialization knows exactly who moved once);
// `captureIndexFor` mirrors the reference's captureIndex stamp for pieces
// captured since pack (reference search paths always pass captureCounter 0).
export function unpackBoard(bd, opts = {}) {
  const moveBumps = opts.moveBumps || null;
  const out = new Array(bd.n);
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    const captured = isCaptured(w);
    const base = typesFromMask(baseOf(w));
    const promo = typesFromMask(promoOf(w));
    const p = {
      id: bd.ids[i],
      side: w & BLACK ? 'black' : 'white',
      square: captured ? null : ALGEBRAIC[sqOf(w)],
      possibleTypes: typesFromMask(possibleOf(w)),
      baseTypes: base,
      promoTypes: promo,
      captured,
      moveCount: bd.moveCounts[i] + (moveBumps ? moveBumps.get(i) || 0 : 0),
      wasPromoted: (w & WAS_PROMOTED) !== 0,
      castled: (w & CASTLED) !== 0,
    };
    if (opts.captureIndexFor && opts.captureIndexFor.has(i)) p.captureIndex = opts.captureIndexFor.get(i);
    else if (captured && bd.captureIdxs[i] !== undefined) p.captureIndex = bd.captureIdxs[i];
    out[i] = p;
  }
  return out;
}

// REF: computePositionSignature — identical string, built from the packed
// state (moveCount collapses to the 'f'/'m' flag the signature already uses).
export function positionSignature(bd, sideToMove, epCrossedSquare) {
  const parts = new Array(bd.n);
  for (let i = 0; i < bd.n; i++) {
    const w = bd.words[i];
    parts[i] = [
      bd.ids[i],
      isCaptured(w) ? 'x' : ALGEBRAIC[sqOf(w)],
      typesFromMask(baseOf(w)).join(''),
      typesFromMask(promoOf(w)).join(''),
      (w & HAS_MOVED) || (bd.moveCounts[i] > 0) ? 'm' : 'f',
      w & CASTLED ? 'c' : '',
    ].join(':');
  }
  parts.sort();
  return `${sideToMove}#${epCrossedSquare || '-'}#${parts.join('|')}`;
}
