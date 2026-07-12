// frontend/src/chessboard/engineTypes.js
// Purpose: Origin-tagged possibility sets — the quantum piece's core data
// shape. Every possibility has an origin: `base` (one of the side's original
// slots) or `promo` (a heavy identity funded by a pawn slot via promotion).
// `possibleTypes` is always the union of the two and is what move generation,
// threat maps, and the UI consume. Conservation reasons over the tagged sets.
// Split out of quantumEngine.js (which re-exports the public API).
// Imports From: ./gameConstants.js
// Exported To: ./quantumEngine.js, ./engineConservation.js

import { PIECE_TYPES } from './gameConstants.js';

function orderTypes(list) {
  const set = new Set(list);
  return PIECE_TYPES.filter((t) => set.has(t));
}

export function getBaseTypes(p) {
  return Array.isArray(p.baseTypes) ? p.baseTypes : (p.possibleTypes || []);
}

export function getPromoTypes(p) {
  return Array.isArray(p.promoTypes) ? p.promoTypes : [];
}

// Set a piece's tagged sets and keep the union invariant. Mutates the piece.
export function withTypes(piece, base, promo) {
  piece.baseTypes = orderTypes(base);
  piece.promoTypes = orderTypes(promo);
  piece.possibleTypes = orderTypes([...piece.baseTypes, ...piece.promoTypes]);
}

// Restrict a piece to `allowedTypes`, preserving origins. Mutates the piece.
export function restrictTypes(piece, allowedTypes) {
  const allowed = new Set(allowedTypes);
  withTypes(
    piece,
    getBaseTypes(piece).filter((t) => allowed.has(t)),
    getPromoTypes(piece).filter((t) => allowed.has(t))
  );
}

export function clonePieces(pieces) {
  return pieces.map((p) => ({
    ...p,
    possibleTypes: Array.isArray(p.possibleTypes) ? [...p.possibleTypes] : [],
    baseTypes: [...getBaseTypes(p)],
    promoTypes: [...getPromoTypes(p)],
  }));
}
