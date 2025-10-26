// frontend/src/settings/usePieceColors.js
// Purpose: Manage per-side piece color presets and compute CSS filters to tint SVG assets; persists selection to localStorage.
// Imports From: None
// Exported To: ../App.jsx, ./SettingsModal.jsx

import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEYS = {
  white: 'qcWhiteColorPreset',
  black: 'qcBlackColorPreset',
};

const COLOR_PRESETS = [
  { key: 'teal', label: 'Teal', filter: 'invert(52%) sepia(10%) saturate(1348%) hue-rotate(132deg) brightness(92%) contrast(85%)' },
  { key: 'orange', label: 'Orange', filter: 'invert(59%) sepia(71%) saturate(4597%) hue-rotate(2deg) brightness(100%) contrast(104%)' },
  { key: 'purple', label: 'Purple', filter: 'invert(27%) sepia(89%) saturate(2234%) hue-rotate(246deg) brightness(86%) contrast(95%)' },
  { key: 'blue', label: 'Blue', filter: 'invert(42%) sepia(62%) saturate(2025%) hue-rotate(169deg) brightness(93%) contrast(92%)' },
  { key: 'green', label: 'Green', filter: 'invert(56%) sepia(15%) saturate(1434%) hue-rotate(75deg) brightness(95%) contrast(86%)' },
  { key: 'red', label: 'Red', filter: 'invert(19%) sepia(86%) saturate(6479%) hue-rotate(353deg) brightness(93%) contrast(118%)' },
  { key: 'gold', label: 'Gold', filter: 'invert(77%) sepia(42%) saturate(1318%) hue-rotate(8deg) brightness(104%) contrast(102%)' },
  { key: 'pink', label: 'Pink', filter: 'invert(58%) sepia(43%) saturate(5365%) hue-rotate(309deg) brightness(102%) contrast(106%)' },
  { key: 'gray', label: 'Gray', filter: 'invert(8%) sepia(8%) saturate(12%) hue-rotate(314deg) brightness(97%) contrast(88%)' },
];

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return raw;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export default function usePieceColors() {
  const [whiteKey, setWhiteKeyState] = useState(() => readStorage(STORAGE_KEYS.white, 'teal'));
  const [blackKey, setBlackKeyState] = useState(() => readStorage(STORAGE_KEYS.black, 'orange'));

  const setWhiteKey = useCallback((key) => {
    setWhiteKeyState(key);
    writeStorage(STORAGE_KEYS.white, key);
  }, []);

  const setBlackKey = useCallback((key) => {
    setBlackKeyState(key);
    writeStorage(STORAGE_KEYS.black, key);
  }, []);

  const filterByKey = useCallback((key) => {
    const preset = COLOR_PRESETS.find((p) => p.key === key);
    return preset ? preset.filter : 'none';
  }, []);

  const colorFilters = useMemo(() => ({
    white: filterByKey(whiteKey),
    black: filterByKey(blackKey),
  }), [whiteKey, blackKey, filterByKey]);

  return {
    presets: COLOR_PRESETS,
    whiteKey,
    blackKey,
    setWhiteKey,
    setBlackKey,
    colorFilters,
  };
}
