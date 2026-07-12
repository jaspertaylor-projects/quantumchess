// frontend/src/settings/useIndicatorSettings.js
// Purpose: Manage visibility toggles for the board's visual reminders
// (promotion chevrons, check arrows/rings, band glyphs), persisted to
// localStorage. Stale keys from retired mechanics are ignored on load.
// Imports From: ./usePersistentSetting.js
// Exported To: ../App.jsx, ./SettingsModal.jsx, ../chessboard/Board.jsx

import usePersistentSetting from './usePersistentSetting.js';

const STORAGE_KEY = 'qcIndicatorSettings';

export const DEFAULT_INDICATORS = {
  promoted: true, // bra-ket braces on already-promoted pieces
  checkGlow: false, // arrow from each checker to the revealed king (Amateur default)
  checkRing: true, // pulsing red ring around the checked king
  typeIcons: true, // type glyphs inside 3+ possibility trapezoids
};

export const INDICATOR_LABELS = {
  promoted: 'Promotion insignia',
  checkGlow: 'Check arrows',
  checkRing: 'Check target ring',
  typeIcons: 'Piece icons in superposed bands',
};

// Cumulative hint levels: each preset strips everything the one above it
// strips, plus more. "custom" is any hand-picked combination.
const ALL_ON = {
  promoted: true, checkGlow: true, checkRing: true, typeIcons: true,
};
export const INDICATOR_PRESETS = {
  total: { ...ALL_ON },
  amateur: { ...ALL_ON, checkGlow: false },
  master: { ...ALL_ON, checkGlow: false, checkRing: false },
  grandmaster: { promoted: false, checkGlow: false, checkRing: false, typeIcons: true },
  goat: { promoted: false, checkGlow: false, checkRing: false, typeIcons: false },
};

export const PRESET_LABELS = {
  total: 'Total',
  amateur: 'Amateur',
  master: 'Master',
  grandmaster: 'Grand Master',
  goat: 'GOAT',
};

export function matchIndicatorPreset(indicators) {
  if (!indicators) return null;
  for (const [name, preset] of Object.entries(INDICATOR_PRESETS)) {
    if (Object.keys(DEFAULT_INDICATORS).every((k) => Boolean(indicators[k]) === Boolean(preset[k]))) {
      return name;
    }
  }
  return null;
}

export default function useIndicatorSettings() {
  const [indicators, setIndicators, resetIndicators] = usePersistentSetting(STORAGE_KEY, DEFAULT_INDICATORS);

  return { indicators, setIndicators, resetIndicators };
}
