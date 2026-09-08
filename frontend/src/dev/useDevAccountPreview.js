// Purpose: Development-only account overlays for inspecting anonymous, free,
// and Premium UI without mutating a real Supabase profile.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEV_PREMIUM_GAME_COUNT, DEV_PREMIUM_RATING } from './devSavedGames.js';

const STORAGE_KEY = 'qcDevAccountPreview';

export const DEV_ACCOUNT_LEVEL = Object.freeze({
  ACTUAL: 'actual',
  SIGNED_OUT: 'signed-out',
  FREE: 'free',
  PREMIUM: 'premium',
  ADMIN: 'admin',
});

const LEVELS = new Set(Object.values(DEV_ACCOUNT_LEVEL));

const PREVIEW_USER = Object.freeze({
  id: 'dev-account-preview',
  email: 'preview@quantumchess.dev',
  user_metadata: { username: 'Preview Player' },
});

function initialLevel() {
  if (!import.meta.env.DEV) return DEV_ACCOUNT_LEVEL.ACTUAL;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return LEVELS.has(stored) ? stored : DEV_ACCOUNT_LEVEL.ACTUAL;
  } catch (_) {
    return DEV_ACCOUNT_LEVEL.ACTUAL;
  }
}

export function previewProfileFor(level) {
  const common = {
    id: PREVIEW_USER.id,
    rating: 1427,
    games_played: 38,
    unlocked_characters: [],
    ad_free_until: null,
  };
  if (level === DEV_ACCOUNT_LEVEL.FREE) {
    return {
      ...common,
      username: 'Free Preview',
      tier: 'free',
      avatar_url: '/avatars/free/human-01.png',
      tagline: '',
    };
  }
  if (level === DEV_ACCOUNT_LEVEL.PREMIUM) {
    return {
      ...common,
      rating: DEV_PREMIUM_RATING,
      games_played: DEV_PREMIUM_GAME_COUNT,
      username: 'Premium Preview',
      tier: 'paid',
      avatar_url: '/avatars/premium/quantum-fox.png',
      tagline: 'Sly in nine tails and nine timelines.',
    };
  }
  if (level === DEV_ACCOUNT_LEVEL.ADMIN) {
    // Admin UI chrome only — the stats dashboard's Supabase reads still
    // require a REAL signed-in admin, so its data shows the error state here.
    return {
      ...common,
      username: 'Admin Preview',
      tier: 'paid',
      is_admin: true,
      avatar_url: '/avatars/premium/quantum-fox.png',
      tagline: 'Sees all timelines at once.',
    };
  }
  return null;
}

export default function useDevAccountPreview(realAuth) {
  const [level, setLevelState] = useState(initialLevel);

  const setLevel = useCallback((nextLevel) => {
    const safeLevel = LEVELS.has(nextLevel) ? nextLevel : DEV_ACCOUNT_LEVEL.ACTUAL;
    setLevelState(safeLevel);
    try {
      localStorage.setItem(STORAGE_KEY, safeLevel);
    } catch (_) {
      // Persistence is only a convenience for local UI work.
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV && level !== DEV_ACCOUNT_LEVEL.ACTUAL) {
      setLevelState(DEV_ACCOUNT_LEVEL.ACTUAL);
    }
  }, [level]);

  const auth = useMemo(() => {
    if (!import.meta.env.DEV || level === DEV_ACCOUNT_LEVEL.ACTUAL) return realAuth;
    if (level === DEV_ACCOUNT_LEVEL.SIGNED_OUT) {
      return {
        ...realAuth,
        session: null,
        user: null,
        profile: null,
        authEnabled: true,
        isDevPreview: true,
        devPreviewLevel: level,
        refreshProfile: async () => null,
        signIn: async () => ({ error: { message: 'Account sign-in is disabled while a dev preview is active.' } }),
        signUp: async () => ({ error: { message: 'Account creation is disabled while a dev preview is active.' } }),
        resetPassword: async () => ({ error: { message: 'Password reset is disabled while a dev preview is active.' } }),
        updatePassword: async () => ({ error: { message: 'Password changes are disabled while a dev preview is active.' } }),
      };
    }

    const profile = previewProfileFor(level);
    return {
      ...realAuth,
      session: { user: PREVIEW_USER },
      user: PREVIEW_USER,
      profile,
      authEnabled: true,
      isDevPreview: true,
      devPreviewLevel: level,
      refreshProfile: async () => profile,
      signOut: async () => setLevel(DEV_ACCOUNT_LEVEL.SIGNED_OUT),
    };
  }, [level, realAuth, setLevel]);

  return {
    auth,
    level,
    setLevel,
    active: Boolean(import.meta.env.DEV && level !== DEV_ACCOUNT_LEVEL.ACTUAL),
  };
}
