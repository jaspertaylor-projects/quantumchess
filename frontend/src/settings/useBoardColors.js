// frontend/src/settings/useBoardColors.js
// Purpose: Manage board square colors (light and dark), persist them to localStorage, and provide setters and reset.
// Imports From: None
// Exported To: ../App.jsx, ./SettingsModal.jsx

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'qcBoardSquareColors';

export const DEFAULT_BOARD = {
  light: '#f0d9b5',
  dark: '#b58863',
};

function readStorage(fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      light: typeof parsed.light === 'string' ? parsed.light : fallback.light,
      dark: typeof parsed.dark === 'string' ? parsed.dark : fallback.dark,
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

export default function useBoardColors() {
  const [boardColors, setBoardColorsState] = useState(() => readStorage(DEFAULT_BOARD));

  const setBoardColors = useCallback((partial) => {
    setBoardColorsState((prev) => {
      const next = { ...prev, ...partial };
      writeStorage(next);
      return next;
    });
  }, []);

  const resetBoardColors = useCallback(() => {
    setBoardColorsState(() => {
      writeStorage(DEFAULT_BOARD);
      return { ...DEFAULT_BOARD };
      });
  }, []);

  return {
    boardColors,
    setBoardColors,
    resetBoardColors,
  };
}
