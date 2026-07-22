// frontend/src/tray/matchmakingClient.js
// Purpose: Robust client for the backend matchmaking service and realtime WS play. Uses relative API routes for proxying, stable client ID, keepalive pings, and clean teardown.
// Imports From: None
// Exported To: ../App.jsx

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const newId = `qc_${Date.now().toString(36)}_${rand()}`;
  try {
    window.localStorage.setItem(KEY, newId);
  } catch (_) {
    // ignore; non-fatal if storage is unavailable
  }
  return newId;
}

export async function joinQueue({ clientId, ranked = false, accessToken = null }) {
  const headers = { ...JSON_HEADERS };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch('/api/matchmaking/join', {
    method: 'POST',
    headers,
    body: JSON.stringify({ clientId, ranked: Boolean(ranked) }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.detail || ''; } catch (_) { /* ignore */ }
    throw new Error(detail || `joinQueue failed: ${res.status}`);
  }
  return await res.json();
}

export async function leaveQueue(clientId, ticket = null) {
  const res = await fetch('/api/matchmaking/leave', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ clientId, ...(ticket ? { ticket } : {}) }),
  });
  if (!res.ok) throw new Error(`leaveQueue failed: ${res.status}`);
  return await res.json();
}

export async function getStatus(clientId, ticket = null) {
  const query = ticket ? `?ticket=${encodeURIComponent(ticket)}` : '';
  const res = await fetch(`/api/matchmaking/status/${encodeURIComponent(clientId)}${query}`);
  if (!res.ok) throw new Error(`getStatus failed: ${res.status}`);
  return await res.json();
}

export async function sendHeartbeat(clientId, ticket = null) {
  const res = await fetch('/api/matchmaking/heartbeat', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ clientId, ...(ticket ? { ticket } : {}) }),
  });
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

// --- Challenge a friend (private rooms) -----------------------------------

// Opens a private room; the response carries the invite `code` to share.
// Friend challenges intentionally use a fixed creator-White contract, so the
// general AI-side preference is not submitted by this setup path.
export async function createPrivateRoom({ clientId }) {
  const res = await fetch('/api/matchmaking/create-private', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) throw new Error(`createPrivateRoom failed: ${res.status}`);
  return await res.json();
}

// Seats this client (black) into the room behind an invite code.
// status: 'matched' | 'not_found' | 'room_full' | 'error'.
export async function joinPrivateRoom({ clientId, code }) {
  const res = await fetch('/api/matchmaking/join-private', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ clientId, code }),
  });
  if (!res.ok) throw new Error(`joinPrivateRoom failed: ${res.status}`);
  return await res.json();
}

// The shareable link is /?join=CODE. Reads and strips the param on load
// (same pattern as the ?premium= checkout return marker).
export function buildInviteLink(code) {
  return `${window.location.origin}/?join=${encodeURIComponent(code)}`;
}

// Pure read — safe in a useState initializer (StrictMode double-invokes
// initializers, so the read and the URL mutation must be separate).
export function readJoinCode() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join');
  return code ? (code.trim().toUpperCase() || null) : null;
}

export function stripJoinCode() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('join')) return;
  params.delete('join');
  const rest = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
}

export async function waitForMatch(
  clientId,
  { intervalMs = 1200, timeoutMs = 60000, shouldStop = null, ticket = null } = {}
) {
  const start = Date.now();

  try {
    const first = await getStatus(clientId, ticket);
    if (first && first.status === 'matched') return first;
  } catch (_) {
    // ignore transient errors
  }

  while (Date.now() - start < timeoutMs) {
    if (typeof shouldStop === 'function' && shouldStop()) return null;

    try {
      const hb = await sendHeartbeat(clientId, ticket);
      if (hb && hb.roomId) {
        try {
          const now = await getStatus(clientId, ticket);
          if (now && now.status === 'matched') return now;
        } catch (_) {
          if (hb.side === 'white' || hb.side === 'black') {
            return {
              status: 'matched',
              roomId: hb.roomId,
              side: hb.side,
              opponentPresent: Boolean(hb.opponentPresent),
              ranked: Boolean(hb.ranked),
              ticket: hb.ticket || ticket,
              opponentRating: hb.opponentRating,
              opponentName: hb.opponentName,
            };
          }
        }
      }
    } catch (_) {
      // ignore heartbeat errors
    }

    if (typeof shouldStop === 'function' && shouldStop()) return null;

    try {
      const s = await getStatus(clientId, ticket);
      if (s && s.status === 'matched') return s;
    } catch (_) {
      // ignore and continue polling
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

// Internal helper to build a proxy-friendly WS URL under the /api prefix
function buildWsUrl(pathWithLeadingSlash) {
  const isHttps = window.location.protocol === 'https:';
  const proto = isHttps ? 'wss' : 'ws';
  const host = window.location.host;
  return `${proto}://${host}${pathWithLeadingSlash}`;
}

export function connectToRoomWs({
  roomId,
  clientId,
  ticket = null,
  onMessage = () => {},
  onOpen = () => {},
  onClose = () => {},
  onError = () => {},
  keepAliveMs = 25000,
}) {
  const params = new URLSearchParams({ clientId });
  if (ticket) params.set('ticket', ticket);
  const url = buildWsUrl(`/api/matchmaking/ws/${encodeURIComponent(roomId)}?${params.toString()}`);
  const ws = new WebSocket(url);

  let pingTimer = null;

  const startKeepAlive = () => {
    if (keepAliveMs > 0 && !pingTimer) {
      pingTimer = setInterval(() => {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
          }
        } catch (_) {
          // ignore send failures
        }
      }, keepAliveMs);
    }
  };

  const stopKeepAlive = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  const api = {
    ws,
    send(obj) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(obj));
        }
      } catch (_) {
        // ignore
      }
    },
    close() {
      try { stopKeepAlive(); ws.close(); } catch (_) { /* ignore */ }
    },
  };

  ws.addEventListener('open', () => {
    startKeepAlive();
    onOpen();
  });

  ws.addEventListener('close', () => {
    stopKeepAlive();
    onClose();
  });

  ws.addEventListener('error', () => {
    stopKeepAlive();
    onError();
    onClose();
  });

  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data && data.type === 'pong') return;
      onMessage(data);
    } catch (_) {
      // ignore invalid data
    }
  });

  // Cleanly close on page unload to avoid server-side ghost sockets
  try {
    const onUnload = () => { try { api.close(); } catch (_) {} };
    window.addEventListener('beforeunload', onUnload, { once: true });
  } catch (_) {
    // ignore
  }

  return api;
}

export function sendMoveWs(api, { roomId, clientId, from, to, side, enPassant = false, measureTargetId = null }) {
  if (!api || !api.ws || api.ws.readyState !== WebSocket.OPEN) return;
  api.send({ type: 'move', roomId, clientId, from, to, side, enPassant: Boolean(enPassant), measureTargetId: measureTargetId || null });
}

export function sendCastleWs(api, { roomId, clientId, side, plan, measureTargetId = null }) {
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
    measureTargetId: measureTargetId || null,
  });
}

// Report a rules-based game end (checkmate, stalemate, draw) so the server
// stops the clocks and informs both players.
export function sendGameOverWs(api, { roomId, clientId, winner = null, reason = 'rules' }) {
  if (!api || !api.ws || api.ws.readyState !== WebSocket.OPEN) return;
  api.send({ type: 'game_over', roomId, clientId, winner, reason });
}

// Persistent, turn-independent draw negotiation. The server owns the pending
// offer and broadcasts every transition to both seats.
export function sendDrawOfferWs(api, { roomId, clientId, action }) {
  if (!api || !api.ws || api.ws.readyState !== WebSocket.OPEN) return;
  if (!['offer', 'retract', 'accept', 'decline'].includes(action)) return;
  api.send({ type: 'draw_offer', roomId, clientId, action });
}
