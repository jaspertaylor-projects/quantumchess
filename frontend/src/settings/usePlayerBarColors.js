// frontend/src/settings/usePlayerBarColors.js
// Purpose: Manage global player bar background and text colors with localStorage persistence and simple partial updates.
// Imports From: None
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'qc_playerBarColors_v1';

const DEFAULTS = {
  background: '#282c34',
  text: '#ffffff',
};

export default function usePlayerBarColors() {
  const [playerBarColors, setPlayerBarColorsState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      return {
        background: typeof parsed?.background === 'string' ? parsed.background : DEFAULTS.background,
        text: typeof parsed?.text === 'string' ? parsed.text : DEFAULTS.text,
      };
    } catch {
      return { ...DEFAULTS };
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
    setPlayerBarColorsState({ ...DEFAULTS });
  }, []);

  return useMemo(
    () => ({ playerBarColors, setPlayerBarColors, resetPlayerBarColors }),
    [playerBarColors, setPlayerBarColors, resetPlayerBarColors]
  );
}
