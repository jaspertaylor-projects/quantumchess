import { describe, expect, it } from 'vitest';

import {
  PRODUCT_EVENT,
  buildProductEvent,
} from '../src/analytics/productEvents.js';

describe('product analytics event contract', () => {
  it('uses GA4 recommended names for signup, sharing, tutorial, and checkout', () => {
    expect(buildProductEvent(PRODUCT_EVENT.ACCOUNT_CREATED).name).toBe('sign_up');
    expect(buildProductEvent(PRODUCT_EVENT.DAILY_SHARED, { date: '2026-07-16' }).name).toBe('share');
    expect(buildProductEvent(PRODUCT_EVENT.TUTORIAL_BEGIN).name).toBe('tutorial_begin');
    expect(buildProductEvent(PRODUCT_EVENT.TUTORIAL_COMPLETE).name).toBe('tutorial_complete');
    expect(buildProductEvent(PRODUCT_EVENT.CHECKOUT_STARTED).name).toBe('begin_checkout');
  });

  it('keeps the custom product event names stable', () => {
    expect([
      PRODUCT_EVENT.FIRST_MOVE,
      PRODUCT_EVENT.TUTORIAL_STEP_COMPLETE,
      PRODUCT_EVENT.DAILY_OPENED,
      PRODUCT_EVENT.DAILY_SOLVED,
      PRODUCT_EVENT.BOT_GAME_FINISHED,
      PRODUCT_EVENT.PREMIUM_UPSELL_VIEWED,
      PRODUCT_EVENT.PREMIUM_UPSELL_CLICKED,
      PRODUCT_EVENT.REVIEW_OPENED,
    ].map((type) => buildProductEvent(type).name)).toEqual([
      'first_move',
      'tutorial_step_complete',
      'daily_opened',
      'daily_solved',
      'bot_game_finished',
      'premium_upsell_viewed',
      'premium_upsell_clicked',
      'review_opened',
    ]);
  });

  it('builds a complete subscription checkout payload', () => {
    expect(buildProductEvent(PRODUCT_EVENT.CHECKOUT_STARTED, {
      offer: 'subscription',
      source: 'account',
      value: 3,
    })).toEqual({
      name: 'begin_checkout',
      params: {
        currency: 'USD',
        value: 3,
        upsell_source: 'account',
        offer: 'subscription',
        items: [{
          item_id: 'quantum_chess_premium_monthly',
          item_name: 'Quantum Chess Premium',
          item_category: 'support',
          price: 3,
          quantity: 1,
        }],
      },
    });
  });

  it('keeps only the approved, non-identifying parameters', () => {
    const event = buildProductEvent(PRODUCT_EVENT.BOT_GAME_FINISHED, {
      result: 'win',
      botId: 'boris-bohr',
      botTier: 'medium',
      moveCount: 42,
      endReason: 'checkmate',
      email: 'do-not-send@example.com',
      userId: 'also-do-not-send',
    });
    expect(event.params).toEqual({
      result: 'win',
      bot_id: 'boris-bohr',
      bot_tier: 'medium',
      move_count: 42,
      end_reason: 'checkmate',
    });
  });

  it('uses one placement parameter across the premium funnel', () => {
    expect(buildProductEvent(PRODUCT_EVENT.PREMIUM_UPSELL_VIEWED, {
      source: 'premium_bot',
    }).params).toEqual({ upsell_source: 'premium_bot' });
    expect(buildProductEvent(PRODUCT_EVENT.PREMIUM_UPSELL_CLICKED, {
      source: 'premium_bot',
      offer: 'subscription',
    }).params).toEqual({
      upsell_source: 'premium_bot',
      offer: 'subscription',
    });
    expect(buildProductEvent(PRODUCT_EVENT.CHECKOUT_STARTED, {
      source: 'premium_bot',
      offer: 'subscription',
      value: 3,
    }).params).toMatchObject({
      upsell_source: 'premium_bot',
      offer: 'subscription',
    });
  });

  it('normalizes daily events into one reportable puzzle id', () => {
    const opened = buildProductEvent(PRODUCT_EVENT.DAILY_OPENED, {
      date: '2026-07-16',
      moves: 3,
    });
    const solved = buildProductEvent(PRODUCT_EVENT.DAILY_SOLVED, {
      date: '2026-07-16',
      moves: 3,
      score: 87,
      grade: 'A',
      outcome: 'completed',
    });
    expect(opened.params.puzzle_id).toBe('daily_2026-07-16');
    expect(solved.params).toMatchObject({
      puzzle_id: 'daily_2026-07-16',
      score: 87,
      grade: 'A',
    });
  });
});
