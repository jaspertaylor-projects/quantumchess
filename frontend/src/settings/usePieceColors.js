// frontend/src/settings/usePieceColors.js
// Purpose: Manage per-side inline-SVG theming colors (icon, band fill, band stroke), persist them to localStorage, and expose a reset-to-defaults action.
// Imports From: None
// Exported To: ../App.jsx, ./SettingsModal.jsx

import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEYS = {
  white: 'qcWhiteSvgColors',
  black: 'qcBlackSvgColors',
};

export const DEFAULT_WHITE = {
  icon: '#111827',
  bandFill: '#e5e7eb',
  bandStroke: '#111827',
};

export const DEFAULT_BLACK = {
  icon: '#ffffff',
  bandFill: '#1f2937',
  bandStroke: '#f2f2f2',
};

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      icon: typeof parsed.icon === 'string' ? parsed.icon : fallback.icon,
      bandFill: typeof parsed.bandFill === 'string' ? parsed.bandFill : fallback.bandFill,
      bandStroke: typeof parsed.bandStroke === 'string' ? parsed.bandStroke : fallback.bandStroke,
    };
  } catch {
    return fallback;
  }
}

function writeStorage(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

export default function usePieceColors() {
  const [whiteColors, setWhiteColorsState] = useState(() => readStorage(STORAGE_KEYS.white, DEFAULT_WHITE));
  const [blackColors, setBlackColorsState] = useState(() => readStorage(STORAGE_KEYS.black, DEFAULT_BLACK));

  const setWhiteColors = useCallback((partial) => {
    setWhiteColorsState((prev) => {
      const next = { ...prev, ...partial };
      writeStorage(STORAGE_KEYS.white, next);
      return next;
    });
  }, []);

  const setBlackColors = useCallback((partial) => {
    setBlackColorsState((prev) => {
      const next = { ...prev, ...partial };
      writeStorage(STORAGE_KEYS.black, next);
      return next;
    });
  }, []);

  const resetColors = useCallback(() => {
    setWhiteColorsState(() => {
      writeStorage(STORAGE_KEYS.white, DEFAULT_WHITE);
      return { ...DEFAULT_WHITE };
    });
    setBlackColorsState(() => {
      writeStorage(STORAGE_KEYS.black, DEFAULT_BLACK);
      return { ...DEFAULT_BLACK };
    });
  }, []);

  const svgStyles = useMemo(() => ({
    white: {
      ['--band-fill']: whiteColors.bandFill,
      ['--band-stroke']: whiteColors.bandStroke,
      ['--icon-color']: whiteColors.icon,
    },
    black: {
      ['--band-fill']: blackColors.bandFill,
      ['--band-stroke']: blackColors.bandStroke,
      ['--icon-color']: blackColors.icon,
    },
  }), [whiteColors, blackColors]);

  return {
    whiteColors,
    blackColors,
    setWhiteColors,
    setBlackColors,
    resetColors,
    svgStyles,
  };
}
