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
  promoted: true, // chevrons on already-promoted pieces
  checkGlow: true, // arrow from each checker to the checked king-holder
  checkRing: true, // pulsing red ring around the checked piece
  pulseRings: true, // rings on pieces touched by the last move's pulse
};

export const INDICATOR_LABELS = {
  coherence: 'Decoherence gauge (center dots)',
  recohere: 'Recoherence dots (bottom)',
  entangled: 'Entanglement link',
  promoted: 'Promotion chevrons',
  checkGlow: 'Check arrows',
  checkRing: 'Check target ring',
  pulseRings: 'Measurement pulse rings',
};

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
