import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildSharedGameLink,
  isSharedGameToken,
  readSharedGameToken,
} from '../src/account/gameSync.js';

describe('shared game replay links', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds a shareable /play link and reads it back', () => {
    const token = '123e4567-e89b-42d3-a456-426614174000';
    vi.stubGlobal('window', {
      location: {
        origin: 'https://quantumchess.ninja',
        search: `?game=${token}`,
      },
    });

    expect(buildSharedGameLink(token)).toBe(`https://quantumchess.ninja/play?game=${token}`);
    expect(readSharedGameToken()).toBe(token);
  });

  it('accepts UUID capability tokens and rejects malformed values', () => {
    expect(isSharedGameToken('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isSharedGameToken('shared-game-12')).toBe(false);
    expect(isSharedGameToken('')).toBe(false);
    expect(isSharedGameToken(null)).toBe(false);
  });
});
