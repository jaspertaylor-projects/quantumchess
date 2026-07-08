// frontend/src/chessboard/svgStyler.js
// Purpose: Fetch SVG assets, inject CSS variables and unique ID prefixes, and return a pure SVG data URL. Caches results in-memory and in localStorage keyed by colors.
// Imports From: ../devlog.js
// Exported To: ./StyledSvgImg.jsx, ./QuantumPiece.jsx, ./rasterPrewarm.js

import { devLog } from '../devlog.js';

// In-memory caches to avoid duplicate work during a session
const dataUrlCache = new Map(); // key -> dataURL
const promiseCache = new Map(); // key -> Promise<string>

function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return '';
  }
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `${h}`;
}

function colorSignature(cssVarMap) {
  if (!cssVarMap || typeof cssVarMap !== 'object') return 'none';
  const entries = Object.entries(cssVarMap).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return hashString(safeJsonStringify(entries));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prefixSvgIds(svgText, prefix) {
  if (!svgText || !prefix) return svgText;
  const idRegex = /\sid="([^"]+)"/g;
  const ids = new Set();
  let m;
  while ((m = idRegex.exec(svgText)) !== null) ids.add(m[1]);
  if (ids.size === 0) return svgText;

  let out = svgText;
  const map = new Map();
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_\-]/g, '_');
  for (const oldId of ids) map.set(oldId, `${safePrefix}__${oldId}`);

  for (const [oldId, nu] of map.entries()) {
    out = out.replace(new RegExp(`(\\sid=")${escapeRegExp(oldId)}(")`, 'g'), `$1${nu}$2`);
  }
  for (const [oldId, nu] of map.entries()) {
    out = out.replace(new RegExp(`url\\(#${escapeRegExp(oldId)}\\)`, 'g'), `url(#${nu})`);
    out = out.replace(new RegExp(`([\\"\'])#${escapeRegExp(oldId)}([\\"\'])`, 'g'), `$1#${nu}$2`);
    out = out.replace(new RegExp(`#${escapeRegExp(oldId)}\\b`, 'g'), `#${nu}`);
  }
  return out;
}

function injectStyleIntoSvg(svgText, styleString) {
  if (!svgText || !styleString) return svgText;
  const hasStyle = /<svg[^>]*\sstyle=["'][^"']*["'][^>]*>/i.test(svgText);
  if (hasStyle) {
    return svgText.replace(
      /<svg([^>*]*\sstyle=["'])([^"']*)(["'][^>]*>)/i,
      (m, p1, p2, p3) => `<svg${p1}${p2} ${styleString}${p3}`
    );
  }
  return svgText.replace(/<svg([^>]*)>/i, `<svg$1 style="${styleString}">`);
}

function buildRootStyle(cssVarMap) {
  const entries = Object.entries(cssVarMap || {}).filter(([k]) => k.startsWith('--'));
  const cssVars = entries.map(([k, v]) => `${k}: ${v};`).join(' ');
  const sizeRules = 'width: 100%; height: 100%;';
  return `${cssVars} ${sizeRules}`.trim();
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota errors
  }
}

export function clearSvgCaches() {
  devLog('[SvgStyler] Clearing in-memory and persisted SVG caches');
  dataUrlCache.clear();
  promiseCache.clear();
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('qcSvgCacheV1:') || k.startsWith('qcPngCacheV1:') || k.startsWith('qcPngCacheV2:')) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

// Synchronous cache probe (memory first, then localStorage). Lets components
// render a cache hit on the very first paint instead of flashing empty for a
// frame while the async path resolves — the flash was visible whenever a
// piece's asset changed mid-game (promotion, collapse to a new composite).
export function getCachedSvgUrl({ srcUrl, cssVarMap }) {
  if (!srcUrl) return '';
  const sig = colorSignature(cssVarMap);
  const key = `v3|${srcUrl}|${sig}`;
  if (dataUrlCache.has(key)) return dataUrlCache.get(key);
  const storageKey = `qcSvgCacheV1:${hashString(key)}`;
  const persisted = storageGet(storageKey);
  if (persisted) {
    dataUrlCache.set(key, persisted);
    return persisted;
  }
  return '';
}

export async function getStyledSvgUrl({ srcUrl, cssVarMap, idPrefix }) {
  if (!srcUrl) return '';
  const sig = colorSignature(cssVarMap);
  const key = `v3|${srcUrl}|${sig}`;
  const storageKey = `qcSvgCacheV1:${hashString(key)}`;

  if (dataUrlCache.has(key)) return dataUrlCache.get(key);
  if (promiseCache.has(key)) return promiseCache.get(key);

  const persisted = storageGet(storageKey);
  if (persisted) {
    dataUrlCache.set(key, persisted);
    return persisted;
  }

  const promise = (async () => {
    try {
      const res = await fetch(srcUrl, { cache: 'force-cache' });
      const text = await res.text();
      const prefixed = prefixSvgIds(text, idPrefix || 'qsvg');
      const styled = injectStyleIntoSvg(prefixed, buildRootStyle(cssVarMap));

      // Encode as data URL
      const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(styled);
      if (dataUrl) {
        dataUrlCache.set(key, dataUrl);
        storageSet(storageKey, dataUrl);
        devLog(`[SvgStyler] Cached SVG -> key:${storageKey}`);
      } else {
        console.warn('[SvgStyler] Empty data URL generated for', { srcUrl });
      }
      return dataUrl;
    } catch (err) {
      console.error('[SvgStyler] Failed to style', srcUrl, err);
      return '';
    } finally {
      promiseCache.delete(key);
    }
  })();

  promiseCache.set(key, promise);
  return promise;
}

export default {
  getStyledSvgUrl,
  clearSvgCaches,
};
