// frontend/src/tray/matchmakingClient.js
// Purpose: Minimal client for the backend matchmaking service. Persists a stable client ID in localStorage and provides helpers to join, leave, poll status, and fetch metrics.
// Imports From: None
// Exported To: ../App.jsx

export function getOrCreateClientId() {
  const KEY = 'qc_client_id';
  let id = null;
  try {
    id = window.localStorage.getItem(KEY);
  } catch (_) {
    id = null;
  }
  if (id && typeof id === 'string' && id.length >= 6) return id;

  const rand = () => {
    const arr = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };
  const newId = `qc_${Date.now().toString(36)}_${rand()}`;
  try {
    window.localStorage.setItem(KEY, newId);
  } catch (_) {
    // ignore; non-fatal if storage is unavailable
  }
  return newId;
}

export async function joinQueue({ clientId }) {
  const res = await fetch('/api/matchmaking/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) throw new Error(`joinQueue failed: ${res.status}`);
  return await res.json();
}

export async function leaveQueue(clientId) {
  const res = await fetch('/api/matchmaking/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) throw new Error(`leaveQueue failed: ${res.status}`);
  return await res.json();
}

export async function getStatus(clientId) {
  const res = await fetch(`/api/matchmaking/status/${encodeURIComponent(clientId)}`);
  if (!res.ok) throw new Error(`getStatus failed: ${res.status}`);
  return await res.json();
}

export async function sendHeartbeat(clientId) {
  const res = await fetch('/api/matchmaking/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  });
  // Heartbeat is best-effort; ignore non-2xx silently
  try {
    return await res.json();
  } catch (_) {
    return { status: 'ok' };
  }
}

export async function getMetrics() {
  const res = await fetch('/api/matchmaking/metrics');
  if (!res.ok) throw new Error(`getMetrics failed: ${res.status}`);
  return await res.json();
}

export async function waitForMatch(clientId, { intervalMs = 1200, timeoutMs = 60000, shouldStop = null } = {}) {
  const start = Date.now();
  // Immediate status check
  try {
    const first = await getStatus(clientId);
    if (first && first.status === 'matched') return first;
  } catch (_) {
    // ignore transient errors
  }

  while (Date.now() - start < timeoutMs) {
    if (typeof shouldStop === 'function' && shouldStop()) return null;
    await new Promise((r) => setTimeout(r, intervalMs));
    if (typeof shouldStop === 'function' && shouldStop()) return null;
    try {
      await sendHeartbeat(clientId);
      const s = await getStatus(clientId);
      if (s && s.status === 'matched') return s;
    } catch (_) {
      // ignore and continue polling
    }
  }
  return null;
}
