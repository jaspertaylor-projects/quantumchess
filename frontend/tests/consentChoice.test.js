import { describe, expect, it } from 'vitest';

import {
  CONSENT_CHOICE,
  CONSENT_STORAGE_KEY,
  readStoredConsent,
} from '../src/components/ConsentBanner.jsx';

const storageWith = (value) => ({
  getItem: (key) => (key === CONSENT_STORAGE_KEY ? value : null),
});

describe('consent choice storage contract', () => {
  it('recognizes either explicit choice as resolved', () => {
    expect(readStoredConsent(storageWith(CONSENT_CHOICE.GRANTED))).toBe('granted');
    expect(readStoredConsent(storageWith(CONSENT_CHOICE.DENIED))).toBe('denied');
  });

  it('does not treat missing or unknown values as consent', () => {
    expect(readStoredConsent(storageWith(null))).toBeNull();
    expect(readStoredConsent(storageWith('yes-please'))).toBeNull();
  });

  it('fails closed when browser storage is unavailable', () => {
    expect(readStoredConsent({ getItem: () => { throw new Error('blocked'); } })).toBeNull();
  });
});
