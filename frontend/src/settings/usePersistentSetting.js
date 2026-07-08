// frontend/src/settings/usePersistentSetting.js
// Purpose: Shared localStorage-backed settings state — sanitized JSON read with
// per-field default fill, silent try/catch writes, a partial-update setter, and
// a reset that rewrites the defaults. Each settings hook wraps this with its own
// storage key, defaults, and (optionally) a per-field sanitizer.
// Imports From: None
// Exported To: ./useBoardColors.js, ./useIndicatorSettings.js, ./usePieceColors.js, ./usePlayerBarColors.js

import { useCallback, useState } from 'react';

// Default sanitizer: accept a stored field only when it has the same primitive
// type as its default (string for colors, boolean for toggles, ...).
function sameTypeAsDefault(value, key, defaults) {
  return typeof value === typeof defaults[key];
}

function readStorage(storageKey, defaults, sanitize) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...defaults };
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (sanitize(parsed[key], key, defaults)) out[key] = parsed[key];
    }
    return out;
  } catch {
    return { ...defaults };
  }
}

function writeStorage(storageKey, obj) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(obj));
  } catch {
    // ignore storage errors
  }
}

// Returns [value, setPartial, reset].
// - value: object with exactly the keys of `defaults`
// - setPartial(partial): merges into the current value and persists the result
// - reset(): restores and persists `{ ...defaults }`
// - sanitize(storedValue, key, defaults) -> boolean decides whether a stored
//   field is kept; unaccepted fields fall back to their default.
export default function usePersistentSetting(storageKey, defaults, sanitize = sameTypeAsDefault) {
  const [value, setValueState] = useState(() => readStorage(storageKey, defaults, sanitize));

  const setPartial = useCallback((partial) => {
    setValueState((prev) => {
      const next = { ...prev, ...partial };
      writeStorage(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const reset = useCallback(() => {
    setValueState(() => {
      writeStorage(storageKey, defaults);
      return { ...defaults };
    });
  }, [storageKey, defaults]);

  return [value, setPartial, reset];
}
