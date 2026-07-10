// frontend/src/chessboard/engineTypes.js
// Purpose: Origin-tagged possibility sets — the quantum piece's core data
// shape. Every possibility has an origin: `base` (one of the side's original
// slots) or `promo` (a heavy identity funded by a pawn slot via promotion).
// `possibleTypes` is always the union of the two and is what move generation,
// threat maps, and the UI consume. Conservation reasons over the tagged sets.
// Split out of quantumEngine.js (which re-exports the public API).
// Imports From: ./gameConstants.js
// Exported To: ./quantumEngine.js, ./engineConservation.js

import { DEFAULT_COHERENCE, PIECE_TYPES } from './gameConstants.js';

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

// Any collapse is a fresh start: whenever a piece's possibility set shrank
// during a move's resolution (its own collapse, solver pruning, check
// pruning, sheds), its coherence resets to full. If the shrink
// leaves the piece nearly defined (<= 2 possibilities), its recoherence
// clock restarts empty: the dots show zero the moment it collapses, and each
// of the owner's subsequent moves ticks the clock (0 -> 1 -> 2 -> 3). This
// runs AFTER applyOwnerTurnEffects, so a piece never earns a dot on the very
// move that collapsed it. Mutates finalPieces in place.
export function resetCoherenceOnCollapse(prevPieces, finalPieces) {
  const before = new Map(prevPieces.map((p) => [p.id, (p.possibleTypes || []).length]));
  for (const p of finalPieces) {
    if (p.captured || !p.square) continue;
    const prevLen = before.get(p.id);
    if (prevLen !== undefined && (p.possibleTypes || []).length < prevLen) {
      p.coherence = DEFAULT_COHERENCE;
      if ((p.possibleTypes || []).length <= 2) p.recohere = 0;
    }
  }
}

// End-of-turn king pruning helper: returns a copy of the piece with King
// removed from its possibilities, origins preserved.
export function cloneWithoutKing(p) {
  const clone = { ...p };
  restrictTypes(clone, p.possibleTypes.filter((t) => t !== 'k'));
  return clone;
}

export function clonePieces(pieces) {
  return pieces.map((p) => ({
    ...p,
    possibleTypes: Array.isArray(p.possibleTypes) ? [...p.possibleTypes] : [],
    baseTypes: [...getBaseTypes(p)],
    promoTypes: [...getPromoTypes(p)],
  }));
}
