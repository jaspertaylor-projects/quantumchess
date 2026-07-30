import { describe, expect, it } from 'vitest';

import {
  WELCOME_ACTION,
  hasAppDeepLink,
  isProfileRoute,
  isReviewRoute,
  playUrlFrom,
  profileUrlFrom,
  puzzleUrlFrom,
  reviewUrlFrom,
  resolveWelcomeEntry,
  welcomeActionFromSearch,
} from '../src/welcome/welcomeRouting.js';

describe('welcome routing', () => {
  it('shows the welcome page only to a genuinely new root visitor', () => {
    expect(resolveWelcomeEntry({ pathname: '/' })).toEqual({
      surface: 'welcome',
      action: null,
      markSeen: false,
    });
  });

  it('sends visitors who actually saw Welcome back to the game', () => {
    expect(resolveWelcomeEntry({ pathname: '/', welcomeSeen: true }).surface).toBe('play');
  });

  it('does not confuse the in-game coach flag with a completed welcome visit', () => {
    expect(resolveWelcomeEntry({ pathname: '/', legacyOnboardSeen: true }).surface).toBe('welcome');
  });

  it('honors the three playable welcome choices', () => {
    expect(welcomeActionFromSearch('?welcome=play')).toBe(WELCOME_ACTION.PLAY);
    expect(welcomeActionFromSearch('?welcome=intro')).toBe(WELCOME_ACTION.INTRO);
    expect(welcomeActionFromSearch('?welcome=puzzle')).toBe(WELCOME_ACTION.PUZZLE);
    expect(welcomeActionFromSearch('?welcome=rules')).toBeNull();
    expect(resolveWelcomeEntry({ pathname: '/play', search: '?welcome=intro' })).toEqual({
      surface: 'play',
      action: WELCOME_ACTION.INTRO,
      markSeen: true,
    });
  });

  it('never puts a deep link behind the welcome page', () => {
    expect(hasAppDeepLink('?join=ABC123')).toBe(true);
    expect(hasAppDeepLink('?puzzle=daily')).toBe(true);
    expect(resolveWelcomeEntry({ pathname: '/', search: '?join=ABC123' }).surface).toBe('play');
    expect(resolveWelcomeEntry({ pathname: '/', search: '?puzzle' })).toEqual({
      surface: 'play', action: WELCOME_ACTION.PUZZLE, markSeen: false,
    });
    expect(hasAppDeepLink('?reset=1')).toBe(true);
    expect(resolveWelcomeEntry({ pathname: '/', search: '?reset=1' }).surface).toBe('play');
    expect(hasAppDeepLink('?game=00000000-0000-4000-8000-000000000000')).toBe(true);
    expect(resolveWelcomeEntry({ pathname: '/', search: '?game=shared-token' }).surface).toBe('play');
  });

  it('opens the canonical puzzle route without marking Welcome as seen', () => {
    expect(resolveWelcomeEntry({ pathname: '/puzzle' })).toEqual({
      surface: 'play',
      action: WELCOME_ACTION.PUZZLE,
      markSeen: false,
    });
    expect(puzzleUrlFrom('?welcome=puzzle&puzzle=1&ref=share')).toBe('/puzzle?ref=share');
  });

  it('opens and preserves the dedicated review route', () => {
    expect(isReviewRoute('/review')).toBe(true);
    expect(isReviewRoute('/review/')).toBe(true);
    expect(resolveWelcomeEntry({ pathname: '/review' })).toEqual({
      surface: 'play',
      action: null,
      markSeen: false,
    });
    expect(reviewUrlFrom('?welcome=play&game=shared-token')).toBe('/review?game=shared-token');
  });

  it('opens the private profile route without marking Welcome as seen', () => {
    expect(isProfileRoute('/profile')).toBe(true);
    expect(isProfileRoute('/profile/')).toBe(true);
    expect(resolveWelcomeEntry({ pathname: '/profile' })).toEqual({
      surface: 'play',
      action: WELCOME_ACTION.PROFILE,
      markSeen: false,
    });
    expect(profileUrlFrom('?welcome=play&game=shared-token&ref=account')).toBe('/profile?ref=account');
  });

  it('cleans the one-time action while preserving other query parameters', () => {
    expect(playUrlFrom('?welcome=intro&join=ABC123')).toBe('/play?join=ABC123');
    expect(playUrlFrom('?welcome=play')).toBe('/play');
  });
});
