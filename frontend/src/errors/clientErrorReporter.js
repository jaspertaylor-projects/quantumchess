// frontend/src/clientErrorReporter.js
// Purpose: Capture browser runtime errors and unhandled promise rejections, then POST them to /api/client-error with dedupe and keepalive so the backend appends to logs/frontend-error.log.
// Imports From: (none)
// Exported To: Loaded by vite.config.js transformIndexHtml injection.

const RECENT_TTL_MS = 5000;
const recent = new Map();

function now() {
  return Date.now();
}

function gc() {
  const t = now();
  for (const [k, exp] of recent.entries()) {
    if (exp <= t) recent.delete(k);
  }
}

function sig(obj) {
  const m = String(obj.message || '');
  const s = String(obj.stack || '');
  const src = String(obj.source || '');
  const ln = Number.isFinite(obj.line) ? obj.line : 0;
  const col = Number.isFinite(obj.col) ? obj.col : 0;
  return `${m}|${s}|${src}|${ln}|${col}`;
}

function post(payload) {
  try {
    // keepalive lets the browser send during unload too
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  } catch {
    // ignore
  }
}

function send(entry) {
  gc();
  const key = sig(entry);
  const exp = recent.get(key);
  if (exp && exp > now()) return;
  recent.set(key, now() + RECENT_TTL_MS);

  post({
    severity: entry.severity || 'error',
    message: entry.message || '',
    stack: entry.stack || '',
    source: entry.source || '',
    line: Number.isFinite(entry.line) ? entry.line : 0,
    col: Number.isFinite(entry.col) ? entry.col : 0,
    url: String(location.href || ''),
    userAgent: navigator.userAgent || '',
    componentStack: entry.componentStack || '',
  });
}

function onWindowError(event) {
  try {
    const e = event?.error;
    const payload = {
      severity: 'error',
      message: (e && e.message) || event?.message || 'Uncaught error',
      stack: (e && e.stack) || '',
      source: event?.filename || '',
      line: Number.isFinite(event?.lineno) ? event.lineno : 0,
      col: Number.isFinite(event?.colno) ? event.colno : 0,
    };
    send(payload);
  } catch {
    // ignore
  }
}

function onUnhandledRejection(event) {
  try {
    const r = event?.reason;
    const isErr = r && typeof r === 'object' && ('message' in r || 'stack' in r);
    const payload = {
      severity: 'error',
      message: isErr ? String(r.message || 'Unhandled rejection') : String(r || 'Unhandled rejection'),
      stack: isErr ? String(r.stack || '') : '',
      source: '',
      line: 0,
      col: 0,
    };
    send(payload);
  } catch {
    // ignore
  }
}

(function init() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', onWindowError, true);
  window.addEventListener('unhandledrejection', onUnhandledRejection, true);
})();
