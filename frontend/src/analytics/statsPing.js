// frontend/src/analytics/statsPing.js
// Purpose: First-party stats ping for bot games. Bot games run entirely in
// the browser, so the server only learns a game finished from this report,
// which feeds the admin dashboard's qc_finished_games table. Unlike GA this
// is consent-free: it carries no identifier, no cookie, and nothing about the
// visitor — only the game's outcome shape.
// Imports From: None
// Exported To: ../hooks/useMonetization.js, ../../tests/statsPing.test.js

const clip = (value, cap = 40) => String(value == null ? '' : value).slice(0, cap);

const RESULTS = new Set(['win', 'loss', 'draw', 'unknown']);

// Pure builder so tests can pin the payload contract without a network layer.
export function buildBotGameFinishedPayload({ result, botId, botTier, moveCount, endReason } = {}) {
  return {
    result: RESULTS.has(result) ? result : 'unknown',
    botId: clip(botId),
    botTier: clip(botTier),
    moveCount: Number.isFinite(Number(moveCount)) ? Math.max(0, Math.trunc(Number(moveCount))) : 0,
    endReason: clip(endReason),
  };
}

export function sendBotGameFinished(details) {
  try {
    fetch('/api/stats/game-finished', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBotGameFinishedPayload(details)),
      keepalive: true, // survives the tab closing right after the game ends
    }).catch(() => {});
  } catch (_) {
    // Stats are never allowed to break the game.
  }
}
