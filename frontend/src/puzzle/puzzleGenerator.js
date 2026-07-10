// frontend/src/puzzle/puzzleGenerator.js
// Purpose: The daily puzzle generator entry points. Date-seeded and fully
// deterministic — every player on Earth gets the same puzzle with no
// backend. The week has a difficulty arc: two 1-move puzzles (Mon/Tue), two
// 2-move chains (Wed/Thu), two 3-move chains (Fri/Sat) and a 4-move hunt on
// Sunday. Construction/verification live in ./puzzleBoardKit.js; the recipes
// in ./puzzleRecipesOneMove.js and ./puzzleRecipesChains.js.
// Imports From: ./puzzleBoardKit.js, ./puzzleRecipesOneMove.js, ./puzzleRecipesChains.js, ../utils/rng.js
// Exported To: ./DailyPuzzleModal.jsx, ./puzzleProgress.js, ./usePuzzleBoard.js, ./minedPreview.js (and the harness in tools/)

import { hashString, mulberry32 } from '../utils/rng.js';
import {
  SUBGOALS,
  enumerateWhiteMoves,
  resetPieceSeq,
  verifyCandidate,
} from './puzzleBoardKit.js';
import { R_INSTRUMENT, R_CENSUS, R_SEAL, R_SNAP, R_PHANTOM, R_MATE1 } from './puzzleRecipesOneMove.js';
import { R_SNAP_TRAP, R_LEDGER, R_HUNT3, R_HUNT4, R_INVESTIGATION } from './puzzleRecipesChains.js';

// Re-exports for the puzzle UI and the harness.
export { SUBGOALS, enumerateWhiteMoves } from './puzzleBoardKit.js';
export { BUILD_FAIL } from './puzzleRecipesChains.js';

// Bump to invalidate cached puzzles after generator changes.
export const PUZZLE_VERSION = 4;

// Puzzle #1 — update to the public launch day before launch.
export const PUZZLE_EPOCH = '2026-07-06';

// A date whose generation is verified by the harness; used only if a day's
// whole recipe rotation somehow fails (it shouldn't).
const FALLBACK_DATE = '2026-01-01';

// ------------------------------------------------------------- weekly slate

const RECIPES = [
  R_INSTRUMENT, R_CENSUS, R_SEAL, R_SNAP, R_PHANTOM, R_MATE1,
  R_SNAP_TRAP, R_LEDGER, R_HUNT3, R_INVESTIGATION, R_HUNT4,
];

// Tuesday rotates through the classic one-movers so the week never repeats.
const TUESDAY_POOL = ['census', 'seal', 'snap', 'phantom', 'mate'];

// getDay(): 0 = Sunday ... 6 = Saturday
function primaryKeyFor(dateStr) {
  const dow = dayOfWeek(dateStr);
  if (dow === 0) return 'hunt4';
  if (dow === 1) return 'instrument';
  if (dow === 2) return TUESDAY_POOL[hashString(`tue:${dateStr}`) % TUESDAY_POOL.length];
  if (dow === 3) return 'snaptrap';
  if (dow === 4) return 'ledger';
  if (dow === 5) return 'hunt3';
  return 'investigation';
}

// If a day's primary recipe fails to converge, fall through the reliable
// one-movers — deterministically, so every device drifts identically.
const SAFETY_CHAIN = ['census', 'snap', 'instrument', 'seal', 'phantom', 'mate'];

const TRIES_PER_RECIPE = 150;

function recipeByKey(key) { return RECIPES.find((a) => a.key === key); }

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function puzzleNumber(dateStr) {
  const [y1, m1, d1] = PUZZLE_EPOCH.split('-').map(Number);
  const [y2, m2, d2] = dateStr.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

function tryRecipe(recipe, dateStr) {
  const rng = mulberry32(hashString(`qc-puzzle-v${PUZZLE_VERSION}:${dateStr}:${recipe.key}`));
  const tries = recipe.tries || TRIES_PER_RECIPE;
  for (let i = 0; i < tries; i++) {
    resetPieceSeq();
    let cand = null;
    try { cand = recipe.build(rng); } catch (_) { cand = null; }
    if (!cand) continue;
    let verified = null;
    try { verified = verifyCandidate(cand, recipe); } catch (_) { verified = null; }
    if (verified) {
      return {
        date: dateStr,
        number: puzzleNumber(dateStr),
        version: PUZZLE_VERSION,
        recipe: { key: recipe.key, title: recipe.title, emoji: recipe.emoji, moves: recipe.moves },
        pieces: verified.pieces,
        lastMove: verified.lastMove,
        plies: verified.plies,
      };
    }
  }
  return null;
}

// The main entry point. Deterministic in dateStr; throws never — falls back
// to a harness-verified date if a whole rotation fails.
export function generateDailyPuzzle(dateStr, { isFallback = false } = {}) {
  const keys = [primaryKeyFor(dateStr), ...SAFETY_CHAIN.filter((k) => recipeByKey(k))];
  for (const key of keys) {
    const recipe = recipeByKey(key);
    if (!recipe) continue;
    const puzzle = tryRecipe(recipe, dateStr);
    if (puzzle) return puzzle;
  }
  if (!isFallback) {
    const fb = generateDailyPuzzle(FALLBACK_DATE, { isFallback: true });
    return fb ? { ...fb, date: dateStr, number: puzzleNumber(dateStr) } : null;
  }
  return null;
}

// Check a player's move against ply `plyIdx` of the puzzle. Returns
// { correct, move } — move is the enumerated move actually applied, so the
// UI can show the result either way. En passant is preferred when both
// readings share a destination (the phantom goal says "en passant").
export function checkPuzzleMove(puzzle, plyIdx, from, to) {
  const ply = puzzle.plies[plyIdx];
  if (!ply) return { correct: false, move: null };
  const predicate = SUBGOALS[ply.subgoal];
  const moves = enumerateWhiteMoves(ply.pieces, ply.lastMove || null);
  const candidates = moves.filter((m) => m.from === from && m.to === to);
  if (candidates.length === 0) return { correct: false, move: null };
  candidates.sort((a, b) => (b.enPassant ? 1 : 0) - (a.enPassant ? 1 : 0));
  for (const m of candidates) {
    if (predicate(ply.pieces, m, ply.ctx || {})) return { correct: true, move: m };
  }
  return { correct: false, move: candidates[0] };
}

export { RECIPES };


// Harness/debug helper: run one recipe for a date and report where every
// candidate died. Deterministic, read-only.
export function debugRecipe(dateStr, key) {
  const recipe = recipeByKey(key);
  if (!recipe) return null;
  const rng = mulberry32(hashString(`qc-puzzle-v${PUZZLE_VERSION}:${dateStr}:${recipe.key}`));
  const stats = { buildNull: 0, ok: 0 };
  for (let i = 0; i < (recipe.tries || TRIES_PER_RECIPE); i++) {
    resetPieceSeq();
    let cand = null;
    try { cand = recipe.build(rng); } catch (_) { cand = null; }
    if (!cand) { stats.buildNull += 1; continue; }
    let verified = null;
    try { verified = verifyCandidate(cand, recipe, stats); } catch (e) { stats[`throw:${e.message}`] = (stats[`throw:${e.message}`] || 0) + 1; }
    if (verified) stats.ok += 1;
  }
  return stats;
}
