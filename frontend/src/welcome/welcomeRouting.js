// Purpose: Pure first-visit routing decisions for the crawlable welcome page
// and the /play game surface. Kept separate so legacy-returning and deep-link
// behavior is regression-testable without a browser.

export const WELCOME_STORAGE_KEY = 'qcWelcomeSeen';
export const LEGACY_ONBOARD_STORAGE_KEY = 'qcOnboardSeen';

export const WELCOME_ACTION = Object.freeze({
  PLAY: 'play',
  INTRO: 'intro',
  PUZZLE: 'puzzle',
  RULES: 'rules',
});

const PLAY_ACTIONS = new Set([WELCOME_ACTION.PLAY, WELCOME_ACTION.INTRO, WELCOME_ACTION.PUZZLE]);
const APP_DEEP_LINKS = ['join', 'premium', 'puzzle', 'mined', 'minedGame', 'allbots', 'reset'];

export function welcomeActionFromSearch(search = '') {
  const value = new URLSearchParams(search).get('welcome');
  return PLAY_ACTIONS.has(value) ? value : null;
}

export function hasAppDeepLink(search = '') {
  const params = new URLSearchParams(search);
  return APP_DEEP_LINKS.some((key) => params.has(key));
}

export function resolveWelcomeEntry({
  pathname = '/',
  search = '',
  welcomeSeen = false,
  legacyOnboardSeen = false,
} = {}) {
  const action = welcomeActionFromSearch(search);
  const onPlayRoute = pathname === '/play' || pathname === '/play/';
  const returning = Boolean(welcomeSeen || legacyOnboardSeen);
  if (action) return { surface: 'play', action, markSeen: true };
  if (onPlayRoute || hasAppDeepLink(search) || returning) {
    return { surface: 'play', action: null, markSeen: false };
  }
  return { surface: 'welcome', action: null, markSeen: false };
}

export function playUrlFrom(search = '') {
  const params = new URLSearchParams(search);
  params.delete('welcome');
  const rest = params.toString();
  return `/play${rest ? `?${rest}` : ''}`;
}
