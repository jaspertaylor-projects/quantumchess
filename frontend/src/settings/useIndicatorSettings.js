// frontend/src/settings/useIndicatorSettings.js
// Purpose: Manage visibility toggles for the board's visual reminders
// (decoherence gauge, recoherence dots, promotion chevrons, check glow,
// pulse rings), persisted to localStorage.
// Imports From: ./usePersistentSetting.js
// Exported To: ../App.jsx, ./SettingsModal.jsx, ../chessboard/Board.jsx

import usePersistentSetting from './usePersistentSetting.js';

const STORAGE_KEY = 'qcIndicatorSettings';

export const DEFAULT_INDICATORS = {
  coherence: true, // center triangle gauge (measurement damage)
  recohere: true, // bottom dots counting toward regaining a possibility
  promoted: true, // bra-ket braces on already-promoted pieces
  checkGlow: false, // arrow from each checker to the checked king-holder (Amateur default)
  checkRing: true, // pulsing red ring around the checked piece
  pulseRings: true, // rings on pieces touched by the last move's pulse
  typeIcons: true, // type glyphs inside 3+ possibility trapezoids
};

export const INDICATOR_LABELS = {
  coherence: 'Decoherence gauge (center dots)',
  recohere: 'Recoherence dots (bottom)',
  promoted: 'Promotion insignia',
  checkGlow: 'Check arrows',
  checkRing: 'Check target ring',
  pulseRings: 'Measurement pulse rings',
  typeIcons: 'Piece icons in superposed bands',
};

// Cumulative hint levels: each preset strips everything the one above it
// strips, plus more. "custom" is any hand-picked combination.
const ALL_ON = {
  coherence: true, recohere: true, promoted: true,
  checkGlow: true, checkRing: true, pulseRings: true, typeIcons: true,
};
export const INDICATOR_PRESETS = {
  total: { ...ALL_ON },
  amateur: { ...ALL_ON, checkGlow: false },
  master: { ...ALL_ON, checkGlow: false, checkRing: false, pulseRings: false },
  grandmaster: {
    ...ALL_ON,
    checkGlow: false, checkRing: false, pulseRings: false,
    coherence: false, recohere: false, promoted: false,
  },
  goat: {
    coherence: false, recohere: false, promoted: false,
    checkGlow: false, checkRing: false, pulseRings: false, typeIcons: false,
  },
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
