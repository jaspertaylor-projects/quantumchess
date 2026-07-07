// frontend/src/puzzle/puzzleProgress.js
// Purpose: Daily-puzzle progress: per-day results, the streak, the Wordle
// style share card, and a per-device cache of the generated puzzle (the
// generator is deterministic, so caching is just a speedup).
// Imports From: ./puzzleGenerator.js
// Exported To: ./DailyPuzzleModal.jsx, ../App.jsx

import { generateDailyPuzzle, puzzleNumber, PUZZLE_VERSION } from './puzzleGenerator.js';

const RESULTS_KEY = 'qcPuzzleResultsV1';
const CACHE_PREFIX = 'qcPuzzleCache';
export const MAX_ATTEMPTS = 3;

// Local calendar day, Wordle-style: everyone's puzzle flips at their own
// midnight.
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function msUntilTomorrow(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

function readResults() {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeResults(results) {
  try {
    // keep the map bounded
    const keys = Object.keys(results).sort();
    while (keys.length > 400) delete results[keys.shift()];
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  } catch (_) {
    // storage unavailable — progress just isn't remembered
  }
}

// { solved: bool, tries: number } | null
export function getDayResult(dateStr) {
  const r = readResults()[dateStr];
  return r && typeof r === 'object' ? r : null;
}

export function recordDayResult(dateStr, { solved, tries }) {
  const results = readResults();
  results[dateStr] = { solved: Boolean(solved), tries: Math.max(1, tries | 0) };
  writeResults(results);
}

function prevDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d - 1));
}

// Current streak of consecutive solved days ending today (or yesterday, if
// today is still unplayed — an unplayed today doesn't break the streak yet).
export function getStreak(dateStr = todayStr()) {
  const results = readResults();
  let streak = 0;
  let cursor = dateStr;
  if (!results[cursor] || !results[cursor].solved) {
    if (results[cursor] && !results[cursor].solved) return 0; // failed today
    cursor = prevDateStr(cursor); // today unplayed: count from yesterday
  }
  while (results[cursor] && results[cursor].solved) {
    streak += 1;
    cursor = prevDateStr(cursor);
  }
  return streak;
}

export function getTotals() {
  const results = readResults();
  let solved = 0;
  let played = 0;
  for (const k of Object.keys(results)) {
    played += 1;
    if (results[k].solved) solved += 1;
  }
  return { solved, played };
}

// ------------------------------------------------------------- puzzle cache

export function loadOrGeneratePuzzle(dateStr = todayStr()) {
  const key = `${CACHE_PREFIX}V${PUZZLE_VERSION}:${dateStr}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && cached.version === PUZZLE_VERSION && Array.isArray(cached.plies)) return cached;
    }
  } catch (_) {
    // fall through to generation
  }
  const puzzle = generateDailyPuzzle(dateStr);
  if (puzzle) {
    try {
      // drop older cache entries, keep only today's
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX) && !k.endsWith(dateStr)) localStorage.removeItem(k);
      }
      localStorage.setItem(key, JSON.stringify(puzzle));
    } catch (_) {
      // cache is only a speedup
    }
  }
  return puzzle;
}

// --------------------------------------------------------------- share card

// e.g.  Quantum Chess #12 — The Ledger 📒 (2 moves)
//       🟥🟩 solved on try 2 · 🔥 5 day streak
//       quantumchess.ninja
export function buildShareText(puzzle, { solved, tries }, streak) {
  const attempts = solved
    ? '🟥'.repeat(Math.max(0, tries - 1)) + '🟩'
    : '🟥'.repeat(MAX_ATTEMPTS);
  const movesLabel = puzzle.recipe.moves === 1 ? '1 move' : `${puzzle.recipe.moves} moves`;
  const lines = [
    `Quantum Chess #${puzzle.number} — ${puzzle.recipe.title} ${puzzle.recipe.emoji} (${movesLabel})`,
    solved
      ? `${attempts} solved on try ${tries}${streak > 1 ? ` · 🔥 ${streak} day streak` : ''}`
      : `${attempts} it collapsed on me`,
    'quantumchess.ninja',
  ];
  return lines.join('\n');
}

export { puzzleNumber };
