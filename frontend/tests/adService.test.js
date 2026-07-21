import { describe, expect, it, vi } from 'vitest';
import {
  MIN_GAMES_BETWEEN_ADS,
  MIN_SECONDS_BETWEEN_ADS,
  requestRewardedAd,
  showRewardedAd,
} from '../src/ads/adService.js';

describe('monetization ad guardrails', () => {
  it('keeps each game eligible while retaining the three-minute floor', () => {
    expect(MIN_GAMES_BETWEEN_ADS).toBe(1);
    expect(MIN_SECONDS_BETWEEN_ADS).toBe(180);
  });

  it('grants a rewarded review only after adViewed', async () => {
    const show = vi.fn();
    const viewed = await requestRewardedAd((placement) => {
      placement.beforeReward(show);
      placement.adViewed();
      placement.adBreakDone();
    });
    expect(show).toHaveBeenCalledOnce();
    expect(viewed).toBe(true);

    const dismissed = await requestRewardedAd((placement) => {
      placement.beforeReward(show);
      placement.adDismissed();
      placement.adBreakDone();
    });
    expect(dismissed).toBe(false);
  });

  it('does not unlock when ads are unconfigured', async () => {
    await expect(showRewardedAd()).resolves.toBe(false);
  });

  it('fails closed if the ad SDK throws', async () => {
    await expect(requestRewardedAd(() => { throw new Error('sdk failed'); })).resolves.toBe(false);
  });
});
