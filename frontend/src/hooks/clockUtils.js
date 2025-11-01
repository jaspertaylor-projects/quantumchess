// frontend/src/hooks/clockUtils.js
// Purpose: Shared chess clock utilities for parsing time controls, clamping ms, and formatting text; used by local and server-driven clocks.
// Imports From: None
// Exported To: ./useChessClock.js, ../App.jsx

export function parseTimeControlString(tc) {
  if (typeof tc !== 'string') return { baseMinutes: 5, incrementSeconds: 0 };
  const cleaned = tc.replace(/\s+/g, '');
  const m = cleaned.match(/^(\d+)([+:|](\d+))?$/);
  if (!m) return { baseMinutes: 5, incrementSeconds: 0 };
  const base = parseInt(m[1], 10);
  const inc = m[3] ? parseInt(m[3], 10) : 0;
  const baseMinutes = Number.isFinite(base) ? Math.max(0, base) : 5;
  const incrementSeconds = Number.isFinite(inc) ? Math.max(0, inc) : 0;
  return { baseMinutes, incrementSeconds };
}

export function clampMs(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.floor(x));
}

export function formatClock(ms) {
  const clamped = clampMs(ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const under20s = clamped < 20000;
  if (under20s) {
    const tenths = Math.floor((clamped % 1000) / 100);
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
    const ss = String(seconds).padStart(2, '0');
    if (hours > 0) {
      return `${hours}:${mm}:${ss}.${tenths}`;
    }
    return `${mm}:${ss}.${tenths}`;
  }

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}
