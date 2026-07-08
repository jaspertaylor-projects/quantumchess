// frontend/src/settings/usePlayerBarColors.js
// Purpose: Manage global player bar background and text colors with localStorage persistence and simple partial updates.
// Imports From: ./usePersistentSetting.js
// Exported To: ../App.jsx

import { useCallback, useMemo } from 'react';
import usePersistentSetting from './usePersistentSetting.js';

const STORAGE_KEY = 'qc_playerBarColors_v1';

export const DEFAULT_PLAYER_BAR_COLORS = {
  background: '#000000',
  text: '#ffffff',
};

export default function usePlayerBarColors() {
  const [playerBarColors, setColors, resetPlayerBarColors] = usePersistentSetting(
    STORAGE_KEY,
    DEFAULT_PLAYER_BAR_COLORS
  );

  const setPlayerBarColors = useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return;
    setColors(patch);
  }, [setColors]);

  return useMemo(
    () => ({ playerBarColors, setPlayerBarColors, resetPlayerBarColors }),
    [playerBarColors, setPlayerBarColors, resetPlayerBarColors]
  );
}
