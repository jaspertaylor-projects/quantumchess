import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FREE_REVIEW_CAP,
  TIP_PITCH,
  TIP_PRICE_LABEL,
  TIP_PRICE_VALUE,
  TIP_REVIEW_CAP,
  markReviewUsed,
  reviewCapFor,
  reviewsRemaining,
  reviewsUsedToday,
} from '../src/account/billing.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    clear: () => data.clear(),
  };
}

describe('daily engine-review ladder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00'));
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps Free below Tip and Premium unlimited', () => {
    const tipper = { tier: 'free', ad_free_until: '2026-10-20T00:00:00Z' };
    expect(reviewCapFor(null)).toBe(FREE_REVIEW_CAP);
    expect(reviewCapFor(tipper)).toBe(TIP_REVIEW_CAP);
    expect(reviewCapFor({ tier: 'paid' })).toBe(Infinity);
    expect(FREE_REVIEW_CAP).toBeLessThan(TIP_REVIEW_CAP);
  });

  it('advertises the same five-dollar tip that Checkout charges', () => {
    expect(TIP_PRICE_LABEL).toBe('$5');
    expect(TIP_PRICE_VALUE).toBe(5);
    expect(TIP_PITCH).toContain('three months');
    expect(TIP_PITCH).toContain('5 engine game reviews a day');
  });

  it('counts usage per account and local calendar day', () => {
    markReviewUsed('alice');
    markReviewUsed('alice');
    expect(reviewsUsedToday('alice')).toBe(2);
    expect(reviewsRemaining(null, 'alice')).toBe(1);
    expect(reviewsUsedToday('bob')).toBe(0);

    vi.setSystemTime(new Date('2026-07-21T12:00:00'));
    expect(reviewsUsedToday('alice')).toBe(0);
    expect(reviewsRemaining(null, 'alice')).toBe(3);
  });

  it('clamps exhausted quotas at zero', () => {
    for (let i = 0; i < 5; i += 1) markReviewUsed('alice');
    expect(reviewsRemaining(null, 'alice')).toBe(0);
  });
});
