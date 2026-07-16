// frontend/src/chessboard/gameConstants.js
// Purpose: Define core constants, helpers, and starting setup for Quantum Chess pieces and board squares; includes capture-collapse priority and heavy piece taxonomy for promotion-aware capacity logic.
// Imports From: ./boardUtils.js
// Exported To: ./useQuantumGameState.js, ../App.jsx

import { FILES, RANKS, toAlgebraic } from './boardUtils.js';

export const PIECE_TYPES = ['p', 'n', 'b', 'r', 'q', 'k'];
export const HEAVY_TYPES = ['n', 'b', 'r', 'q'];

export const SIDES = {
  WHITE: 'white',
  BLACK: 'black',
};

// Per-side baseline maximum piece counts used by global conservation logic.
// Promotion credits may temporarily extend N/B/R/Q above these baselines.
export const PIECE_LIMITS = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

export function allSquares() {
  const squares = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      squares.push(toAlgebraic(f, r));
    }
  }
  return squares;
}

export function standardStartingSquares() {
  const white = [
    'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1',
    'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
  ];
  const black = [
    'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
    'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
  ];
  return { white, black };
}

export function createStartingPieces() {
  const { white, black } = standardStartingSquares();
  const allTypes = [...PIECE_TYPES];
  const pieces = [];

  white.forEach((sq, i) => {
    pieces.push({
      id: `W_${sq}_${i}`,
      side: SIDES.WHITE,
      square: sq,
      possibleTypes: allTypes,
      baseTypes: allTypes,
      promoTypes: [],
      captured: false,
      moveCount: 0,
      wasPromoted: false,
      castled: false,
    });
  });

  black.forEach((sq, i) => {
    pieces.push({
      id: `B_${sq}_${i}`,
      side: SIDES.BLACK,
      square: sq,
      possibleTypes: allTypes,
      baseTypes: allTypes,
      promoTypes: [],
      captured: false,
      moveCount: 0,
      wasPromoted: false,
      castled: false,
    });
  });

  return pieces;
}

// Capture collapse priority: lowest valuable non-king first (P < N < B < R < Q)
export const CAPTURE_COLLAPSE_ORDER = ['p', 'n', 'b', 'r', 'q'];

// A zap sheds the MOST valuable possibility it can lose cleanly. King is
// normally first, but the contact resolver protects a side's final King
// possibility and falls through to Queen (then the rest of this ladder).
export const CONTACT_ZAP_ORDER = ['k', 'q', 'r', 'b', 'n', 'p'];

// Least valuable first — the mover's contact reach projects from the first
// type here it still holds, and heals walk it to pick the regained identity.
export const LEAST_VALUABLE_ORDER = ['p', 'n', 'b', 'r', 'q', 'k'];

// Normal Heal regain order: least valuable first, including King last. The
// contact resolver moves King to the front while its side is kingless.
export const HEAL_GAIN_ORDER = ['p', 'n', 'b', 'r', 'q', 'k'];

export function isSide(value) {
  return value === SIDES.WHITE || value === SIDES.BLACK;
}

export function normalizeTypes(types) {
  const set = new Set(types.filter(Boolean));
  return Array.from(set);
}
