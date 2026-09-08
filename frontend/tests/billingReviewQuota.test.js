import { describe, expect, it } from 'vitest';
import { PREMIUM_PRICE_LABEL, PREMIUM_PRICE_VALUE, PREMIUM_FEATURES, isAdFree, botAccountAccess, reviewCapFor } from '../src/account/billing.js';
import { ACTIVE_BOTS, canAccessBot } from '../src/ai/bots.js';
import { unlockedCharacters, CHARACTERS } from '../src/characters/characterCatalog.js';

describe('two-tier permanent Premium', () => {
  it('offers one $10 purchase with Premium bots and unlimited reviews', () => {
    expect(PREMIUM_PRICE_LABEL).toBe('$10 once');
    expect(PREMIUM_PRICE_VALUE).toBe(10);
    expect(PREMIUM_FEATURES.join(' ')).toContain('All 8 Premium bots, unlocked immediately');
    expect(reviewCapFor({ tier: 'paid' })).toBe(Infinity);
    expect(ACTIVE_BOTS.every(bot => canAccessBot(bot, botAccountAccess({ tier: 'paid' })))).toBe(true);
    expect(unlockedCharacters({ isPaid: true })).toHaveLength(CHARACTERS.length);
  });
  it('keeps Free accounts free without a temporary intermediate tier', () => {
    for (const profile of [null, { tier: 'free' }, { tier: 'free', ad_free_until: '2099-01-01' }]) {
      expect(isAdFree(profile)).toBe(false);
      expect(botAccountAccess(profile)).toBe('free');
      expect(reviewCapFor(profile)).toBe(0);
    }
  });
  it('keeps purchased access independent of timestamps or a subscription', () => {
    const profile = { tier: 'paid', premium_unlocked_at: '2026-09-08', stripe_subscription_id: null, ad_free_until: '2020-01-01' };
    expect(isAdFree(profile)).toBe(true);
    expect(reviewCapFor(profile)).toBe(Infinity);
  });
});
