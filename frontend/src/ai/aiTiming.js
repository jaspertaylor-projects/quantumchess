// frontend/src/ai/aiTiming.js
// Purpose: Keep the UI worker watchdog safely outside the engine's own
// search deadline. Bot profiles may override the tier budget, so a fixed
// watchdog can otherwise kill the strongest bots before their result posts.

const TIER_SEARCH_MS = { easy: 800, medium: 5000, hard: 12000 };

export const AI_WORKER_GRACE_MS = 3000;
export const MIN_AI_HARD_CAP_MS = 15000;

export function searchBudgetMs(difficulty, bot = null) {
  const override = Number(bot?.search?.timeMs);
  if (Number.isFinite(override) && override > 0) return override;
  return TIER_SEARCH_MS[bot?.tier || difficulty] || TIER_SEARCH_MS.medium;
}

export function aiWorkerHardCapMs(difficulty, bot = null) {
  return Math.max(
    MIN_AI_HARD_CAP_MS,
    searchBudgetMs(difficulty, bot) + AI_WORKER_GRACE_MS,
  );
}
