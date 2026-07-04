// frontend/src/settings/useMeasurementColors.js
// Purpose: Manage per-side targeting (soft measurement) colors, persist them to localStorage,
// and provide setters, reset, and a hex-to-rgb helper for translucent overlays.
// Imports From: None
// Exported To: ../App.jsx, ./SettingsModal.jsx, ../chessboard/QuantumPiece.jsx, ../tray/QuantumStatusPanel.jsx

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'qcMeasurementColors';

export const DEFAULT_MEASUREMENT_COLORS = {
  white: '#4fc3f7',
  black: '#000000',
};

export function hexToRgbString(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '186, 85, 211';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function readStorage(fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      white: typeof parsed.white === 'string' ? parsed.white : fallback.white,
      black: typeof parsed.black === 'string' ? parsed.black : fallback.black,
    };
  } catch {
    return fallback;
  }
}

function writeStorage(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore storage errors
  }
}

export default function useMeasurementColors() {
  const [measurementColors, setMeasurementColorsState] = useState(() => readStorage(DEFAULT_MEASUREMENT_COLORS));

  const setMeasurementColors = useCallback((partial) => {
    setMeasurementColorsState((prev) => {
      const next = { ...prev, ...partial };
      writeStorage(next);
      return next;
    });
  }, []);

  const resetMeasurementColors = useCallback(() => {
    setMeasurementColorsState(() => {
      writeStorage(DEFAULT_MEASUREMENT_COLORS);
      return { ...DEFAULT_MEASUREMENT_COLORS };
    });
  }, []);

  return {
    measurementColors,
    setMeasurementColors,
    resetMeasurementColors,
  };
}
