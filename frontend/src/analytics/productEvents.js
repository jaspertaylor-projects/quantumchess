// Purpose: Stable, privacy-safe GA4 product-event taxonomy. Components send
// product facts to this module instead of inventing raw event names or
// parameters at call sites. Recommended GA4 names are used where applicable.
// Imports From: ./analytics.js
// Exported To: App/product feature components and analytics tests

import { trackEvent } from './analytics.js';

export const PRODUCT_EVENT = Object.freeze({
  WELCOME_VIEWED: 'welcome_viewed',
  WELCOME_CHOICE: 'welcome_choice',
  FIRST_MOVE: 'first_move',
  TUTORIAL_BEGIN: 'tutorial_begin',
  TUTORIAL_STEP_COMPLETE: 'tutorial_step_complete',
  TUTORIAL_COMPLETE: 'tutorial_complete',
  DAILY_OPENED: 'daily_opened',
  DAILY_SOLVED: 'daily_solved',
  DAILY_SHARED: 'daily_shared',
  BOT_GAME_FINISHED: 'bot_game_finished',
  PREMIUM_UPSELL_VIEWED: 'premium_upsell_viewed',
  PREMIUM_UPSELL_CLICKED: 'premium_upsell_clicked',
  ACCOUNT_CREATED: 'account_created',
  CHECKOUT_STARTED: 'checkout_started',
  REVIEW_OPENED: 'review_opened',
});

const safeText = (value, fallback = 'unknown') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value)
    .replace(/[^A-Za-z0-9 _.:/-]/g, '_')
    .slice(0, 100);
};

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const compact = (params) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
);

const dailyId = (date) => `daily_${safeText(date, 'unknown')}`;

// Pure builder so the event contract is pinned by tests without requiring a
// live GA Measurement ID. Unknown detail fields are deliberately discarded.
export function buildProductEvent(type, details = {}) {
  switch (type) {
    case PRODUCT_EVENT.WELCOME_VIEWED:
      return { name: 'welcome_viewed', params: {} };

    case PRODUCT_EVENT.WELCOME_CHOICE:
      return {
        name: 'welcome_choice',
        params: { welcome_choice: safeText(details.choice) },
      };

    case PRODUCT_EVENT.FIRST_MOVE:
      return {
        name: 'first_move',
        params: compact({
          game_mode: safeText(details.gameMode),
          player_side: safeText(details.playerSide),
          bot_tier: details.botTier ? safeText(details.botTier) : undefined,
          intro: Boolean(details.intro),
        }),
      };

    case PRODUCT_EVENT.TUTORIAL_BEGIN:
      return {
        name: 'tutorial_begin',
        params: { tutorial_entry: safeText(details.entry, 'full') },
      };

    case PRODUCT_EVENT.TUTORIAL_STEP_COMPLETE:
      return {
        name: 'tutorial_step_complete',
        params: {
          lesson_id: safeText(details.lessonId),
          lesson_number: safeNumber(details.lessonNumber),
          step_number: safeNumber(details.stepNumber),
        },
      };

    case PRODUCT_EVENT.TUTORIAL_COMPLETE:
      return { name: 'tutorial_complete', params: {} };

    case PRODUCT_EVENT.DAILY_OPENED:
      return {
        name: 'daily_opened',
        params: {
          puzzle_id: dailyId(details.date),
          puzzle_moves: safeNumber(details.moves),
        },
      };

    case PRODUCT_EVENT.DAILY_SOLVED:
      return {
        name: 'daily_solved',
        params: {
          puzzle_id: dailyId(details.date),
          puzzle_moves: safeNumber(details.moves),
          score: safeNumber(details.score),
          grade: safeText(details.grade),
          outcome: safeText(details.outcome, 'completed'),
        },
      };

    case PRODUCT_EVENT.DAILY_SHARED:
      return {
        name: 'share',
        params: {
          method: safeText(details.method, 'clipboard'),
          content_type: 'daily_puzzle',
          item_id: dailyId(details.date),
          score: safeNumber(details.score),
          grade: safeText(details.grade),
        },
      };

    case PRODUCT_EVENT.BOT_GAME_FINISHED:
      return {
        name: 'bot_game_finished',
        params: {
          result: safeText(details.result),
          bot_id: safeText(details.botId),
          bot_tier: safeText(details.botTier),
          move_count: safeNumber(details.moveCount),
          end_reason: safeText(details.endReason),
        },
      };

    case PRODUCT_EVENT.PREMIUM_UPSELL_VIEWED:
      return {
        name: 'premium_upsell_viewed',
        params: {
          upsell_source: safeText(details.source),
        },
      };

    case PRODUCT_EVENT.PREMIUM_UPSELL_CLICKED:
      return {
        name: 'premium_upsell_clicked',
        params: {
          upsell_source: safeText(details.source),
          offer: safeText(details.offer),
        },
      };

    case PRODUCT_EVENT.ACCOUNT_CREATED:
      return {
        name: 'sign_up',
        params: { method: safeText(details.method, 'email') },
      };

    case PRODUCT_EVENT.CHECKOUT_STARTED: {
      const offer = details.offer === 'tip' ? 'tip' : 'subscription';
      const value = safeNumber(details.value, 3);
      return {
        name: 'begin_checkout',
        params: {
          currency: 'USD',
          value,
          upsell_source: safeText(details.source),
          offer,
          items: [{
            item_id: offer === 'tip' ? 'quantum_chess_tip' : 'quantum_chess_premium_monthly',
            item_name: offer === 'tip' ? 'Quantum Chess Tip' : 'Quantum Chess Premium',
            item_category: 'support',
            price: value,
            quantity: 1,
          }],
        },
      };
    }

    case PRODUCT_EVENT.REVIEW_OPENED:
      return {
        name: 'review_opened',
        params: {
          access_type: safeText(details.accessType),
          result: safeText(details.gameResult),
          move_count: safeNumber(details.moveCount),
        },
      };

    default:
      return null;
  }
}

export function trackProductEvent(type, details = {}) {
  const event = buildProductEvent(type, details);
  if (!event) return null;
  trackEvent(event.name, event.params);
  return event;
}
