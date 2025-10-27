// frontend/src/settings/usePlayerBarColors.js
// Purpose: Manage global player bar background and text colors with localStorage persistence and simple partial updates.
// Imports From: None
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'qc_playerBarColors_v1';

export const DEFAULT_PLAYER_BAR_COLORS = {
  background: '#000000',
  text: '#ffffff',
};

export default function usePlayerBarColors() {
  const [playerBarColors, setPlayerBarColorsState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PLAYER_BAR_COLORS };
      const parsed = JSON.parse(raw);
      return {
        background: typeof parsed?.background === 'string' ? parsed.background : DEFAULT_PLAYER_BAR_COLORS.background,
        text: typeof parsed?.text === 'string' ? parsed.text : DEFAULT_PLAYER_BAR_COLORS.text,
      };
    } catch {
      return { ...DEFAULT_PLAYER_BAR_COLORS };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(playerBarColors));
    } catch {
      // no-op
    }
  }, [playerBarColors]);

  const setPlayerBarColors = useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return;
    setPlayerBarColorsState((prev) => {
      const next = { ...prev, ...patch };
      return next;
    });
  }, []);

  const resetPlayerBarColors = useCallback(() => {
    setPlayerBarColorsState({ ...DEFAULT_PLAYER_BAR_COLORS });
  }, []);

  return useMemo(
    () => ({ playerBarColors, setPlayerBarColors, resetPlayerBarColors }),
    [playerBarColors, setPlayerBarColors, resetPlayerBarColors]
  );
}
