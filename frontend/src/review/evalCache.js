// frontend/src/review/evalCache.js
// Purpose: Cache of review-engine judgments keyed by POSITION (a hash of the
// canonical position signature), so closing and reopening a game review —
// or reviewing another game that passes through the same positions — reuses
// every eval instead of recomputing the whole curve. Eval numbers persist to
// localStorage (they're tiny); hint move lists are session-only (they
// recompute in ~a second and are bulky).
// Tiers match useGameEvalGraph's parity-matched rulers: 'fast' (d2/d1),
// 'mid' (d4/d3), 'deep' (d6/d5) — values are white-positive pawns.
// Imports From: ../utils/rng.js
// Exported To: ./useGameEvalGraph.js, ./ReviewModal.jsx

import { hashString } from '../utils/rng.js';

// Bump the version suffix whenever the ENGINE'S EVAL changes materially —
// cached numbers are engine judgments, and the position signature alone
// can't see an eval-weights change.
const STORAGE_KEY = 'qcReviewEvalCache.v1';
const MAX_ENTRIES = 20000; // ~30 bytes each — well under localStorage limits

// Position signatures are ~1-2KB; a 32-bit hash keeps keys tiny. Collisions
// are ~one-in-4-billion per pair — nothing for display values.
const keyOf = (sig) => hashString(sig).toString(16);

// key -> { fast?, mid?, deep? }, insertion order = LRU order.
const evals = new Map();
// key -> hint move list (deep stage), session only.
const hints = new Map();

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.v === 1 && Array.isArray(parsed.entries)) {
      for (const [k, vals] of parsed.entries) {
        if (typeof k === 'string' && vals && typeof vals === 'object') evals.set(k, vals);
      }
    }
  } catch (_) {
    // corrupt or unavailable storage — start empty
  }
}
loadPersisted();

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, entries: [...evals] }));
    } catch (_) {
      // storage full/blocked — cache still works in-memory
    }
  }, 1500);
}

function touch(map, key, value) {
  if (map.has(key)) map.delete(key); // re-insert = most recently used
  map.set(key, value);
  if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
}

// Returns the cached { fast?, mid?, deep? } for a position, or null.
export function getCachedEvals(sig) {
  if (!sig) return null;
  return evals.get(keyOf(sig)) || null;
}

export function cacheEval(sig, tier, value) {
  if (!sig || !Number.isFinite(value)) return;
  const k = keyOf(sig);
  touch(evals, k, { ...(evals.get(k) || {}), [tier]: value });
  scheduleSave();
}

export function getCachedHints(sig) {
  if (!sig) return null;
  return hints.get(keyOf(sig)) || null;
}

export function cacheHints(sig, moves) {
  if (!sig || !Array.isArray(moves)) return;
  touch(hints, keyOf(sig), moves);
}
