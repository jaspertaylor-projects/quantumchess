import { describe, expect, it } from 'vitest';

import {
  DEV_ACCOUNT_LEVEL,
  previewProfileFor,
} from '../src/dev/useDevAccountPreview.js';
import { isAdFree } from '../src/account/billing.js';

describe('development account previews', () => {
  it('models a normal free account', () => {
    const profile = previewProfileFor(DEV_ACCOUNT_LEVEL.FREE);
    expect(profile.tier).toBe('free');
    expect(isAdFree(profile)).toBe(false);
  });

  it('models the full Premium entitlement', () => {
    const profile = previewProfileFor(DEV_ACCOUNT_LEVEL.PREMIUM);
    expect(profile.tier).toBe('paid');
    expect(isAdFree(profile)).toBe(true);
    expect(profile.avatar_url).toContain('/avatars/premium/');
  });
});
