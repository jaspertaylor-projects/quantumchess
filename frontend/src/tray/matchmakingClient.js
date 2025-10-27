// frontend/src/tray/matchmakingClient.js
// Purpose: Minimal client for the backend matchmaking service and realtime WS play. Persists a stable client ID and provides helpers to join, leave, poll status, metrics, and connect to the game WebSocket.
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

export function connectToRoomWs({ roomId, clientId, onMessage = () => {}, onOpen = () => {}, onClose = () => {} }) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${window.location.host}/api/matchmaking/ws/${encodeURIComponent(roomId)}?clientId=${encodeURIComponent(clientId)}`;
  const ws = new WebSocket(url);

  const api = {
    ws,
    send(obj) {
      try {
        ws.send(JSON.stringify(obj));
      } catch (_) {
        // ignore
      }
    },
    close() {
      try { ws.close(); } catch (_) { /* ignore */ }
    }
  };

  ws.addEventListener('open', () => onOpen());
  ws.addEventListener('close', () => onClose());
  ws.addEventListener('error', () => onClose());
  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      onMessage(data);
    } catch (_) {
      // ignore invalid data
    }
  });

  return api;
}

export function sendMoveWs(api, { roomId, clientId, from, to, side }) {
  if (!api || !api.ws || api.ws.readyState !== WebSocket.OPEN) return;
  api.send({ type: 'move', roomId, clientId, from, to, side });
}

export function sendCastleWs(api, { roomId, clientId, side, plan }) {
  if (!api || !api.ws || api.ws.readyState !== WebSocket.OPEN) return;
  api.send({
    type: 'castle',
    roomId,
    clientId,
    side,
    piece1_from: plan.piece1_from,
    piece1_to: plan.piece1_to,
    piece2_from: plan.piece2_from,
    piece2_to: plan.piece2_to,
  });
}
