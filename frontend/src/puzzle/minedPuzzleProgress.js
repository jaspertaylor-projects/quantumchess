// frontend/src/puzzle/minedPuzzleProgress.js
// Purpose: Per-device completion state for the mined daily puzzle.

const RESULTS_KEY = 'qcMinedPuzzleResultsV1';

export function minedPuzzleDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readResults() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESULTS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function getMinedPuzzleResult(date = minedPuzzleDay()) {
  const result = readResults()[date];
  return result && typeof result === 'object' ? result : null;
}

export function recordMinedPuzzleResult(date, result = {}) {
  try {
    const results = readResults();
    results[date] = {
      completed: true,
      totalCollapse: Boolean(result.totalCollapse),
      completedAt: new Date().toISOString(),
    };
    const dates = Object.keys(results).sort();
    while (dates.length > 400) delete results[dates.shift()];
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  } catch (_) {
    // Storage can be unavailable; the puzzle remains playable for the visit.
  }
}

