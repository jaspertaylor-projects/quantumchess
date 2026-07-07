// frontend/src/settings/useIndicatorSettings.js
// Purpose: Manage visibility toggles for the board's visual reminders
// (decoherence gauge, recoherence dots, entanglement link, promotion
// chevrons, check glow, pulse rings), persisted to localStorage.
// Imports From: None
// Exported To: ../App.jsx, ./SettingsModal.jsx, ../chessboard/Board.jsx

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'qcIndicatorSettings';

export const DEFAULT_INDICATORS = {
  coherence: true, // center triangle gauge (measurement damage)
  recohere: true, // bottom dots counting toward regaining a possibility
  entangled: true, // chain link under entangled castle partners
  promoted: true, // bra-ket braces on already-promoted pieces
  checkGlow: false, // arrow from each checker to the checked king-holder (Amateur default)
  checkRing: true, // pulsing red ring around the checked piece
  pulseRings: true, // rings on pieces touched by the last move's pulse
  typeIcons: true, // type glyphs inside 3+ possibility trapezoids
};

export const INDICATOR_LABELS = {
  coherence: 'Decoherence gauge (center dots)',
  recohere: 'Recoherence dots (bottom)',
  entangled: 'Entanglement link',
  promoted: 'Promotion insignia',
  checkGlow: 'Check arrows',
  checkRing: 'Check target ring',
  pulseRings: 'Measurement pulse rings',
  typeIcons: 'Piece icons in superposed bands',
};

// Cumulative hint levels: each preset strips everything the one above it
// strips, plus more. "custom" is any hand-picked combination.
const ALL_ON = {
  coherence: true, recohere: true, entangled: true, promoted: true,
  checkGlow: true, checkRing: true, pulseRings: true, typeIcons: true,
};
export const INDICATOR_PRESETS = {
  total: { ...ALL_ON },
  amateur: { ...ALL_ON, checkGlow: false },
  master: { ...ALL_ON, checkGlow: false, checkRing: false, pulseRings: false },
  grandmaster: {
    ...ALL_ON,
    checkGlow: false, checkRing: false, pulseRings: false,
    coherence: false, recohere: false, entangled: false, promoted: false,
  },
  goat: {
    coherence: false, recohere: false, entangled: false, promoted: false,
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

function readStorage(fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...fallback };
    const out = { ...fallback };
    for (const key of Object.keys(fallback)) {
      if (typeof parsed[key] === 'boolean') out[key] = parsed[key];
    }
    return out;
  } catch {
    return { ...fallback };
  }
}

function writeStorage(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore storage errors
  }
}

export default function useIndicatorSettings() {
  const [indicators, setIndicatorsState] = useState(() => readStorage(DEFAULT_INDICATORS));

  const setIndicators = useCallback((partial) => {
    setIndicatorsState((prev) => {
      const next = { ...prev, ...partial };
      writeStorage(next);
      return next;
    });
  }, []);

  const resetIndicators = useCallback(() => {
    setIndicatorsState(() => {
      writeStorage(DEFAULT_INDICATORS);
      return { ...DEFAULT_INDICATORS };
    });
  }, []);

  return { indicators, setIndicators, resetIndicators };
}
