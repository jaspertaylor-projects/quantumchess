// frontend/src/chessboard/svgRasterizer.js
// Purpose: Fetch SVG assets, inject CSS variables and unique ID prefixes, rasterize to PNG via Canvas, and cache results in-memory and in localStorage keyed by colors, size, and render hints. Also exposes cache invalidation helpers.
// Imports From: None
// Exported To: ./RasterizedSvgImg.jsx, ./QuantumPiece.jsx, ./rasterPrewarm.js

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
    // Match url(#oldId) exactly; both parentheses must be escaped in the regex source string
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

function injectInternalCss(svgText, cssText) {
  if (!svgText || !cssText) return svgText;
  const styleTag = `<style>${cssText}</style>`;
  return svgText.replace(/<svg[^>]*>/i, (m) => `${m}${styleTag}`);
}

function setExplicitDimensions(svgText, width, height) {
  if (!svgText) return svgText;
  const match = svgText.match(/<svg[^>]*>/i);
  if (!match) return svgText;
  const open = match[0];
  let updated = open;

  const hasWidth = /\swidth=/.test(open);
  const hasHeight = /\sheight=/.test(open);

  if (hasWidth) {
    updated = updated.replace(/(\swidth=["'])[^"]+(["'])/i, `$1${width}$2`);
  } else {
    updated = updated.replace(/>$/, ` width="${width}">`);
  }

  if (hasHeight) {
    updated = updated.replace(/(\sheight=["'])[^"]+(["'])/i, `$1${height}$2`);
  } else {
    updated = updated.replace(/>$/, ` height="${height}">`);
  }

  return svgText.replace(open, updated);
}

function buildRootStyle(cssVarMap, renderHint) {
  const entries = Object.entries(cssVarMap || {}).filter(([k]) => k.startsWith('--'));
  const cssVars = entries.map(([k, v]) => `${k}: ${v};`).join(' ');
  const sizeRules = 'width: 100%; height: 100%;';
  const hint = renderHint === 'crisp'
    ? 'shape-rendering: crispEdges; text-rendering: geometricPrecision;'
    : 'shape-rendering: geometricPrecision; text-rendering: optimizeLegibility;';
  return `${cssVars} ${sizeRules} ${hint}`.trim();
}

function buildInternalCss(renderHint) {
  if (renderHint !== 'crisp') return '';
  return `* { vector-effect: non-scaling-stroke; }\npath, line, polyline, polygon { shape-rendering: crispEdges; }\ng, use, symbol { shape-rendering: crispEdges; }`;
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

export function clearRasterCaches() {
  console.log('[Rasterizer] Clearing in-memory and persisted PNG caches');
  dataUrlCache.clear();
  promiseCache.clear();
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('qcPngCacheV1:')) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

async function rasterizeSvgToDataUrl(svgText, size, renderHint) {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    const p = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
    });
    img.src = url;
    await p;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = renderHint !== 'crisp';
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/png');
      return dataUrl;
    }
    return '';
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function getRasterizedPng({ srcUrl, cssVarMap, idPrefix, size, renderHint = 'precision' }) {
  if (!srcUrl || !size) return '';
  const sig = colorSignature(cssVarMap);
  const key = `v1|${srcUrl}|${size}|${renderHint}|${sig}`;
  const storageKey = `qcPngCacheV1:${hashString(key)}`;

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
      const styled = injectStyleIntoSvg(prefixed, buildRootStyle(cssVarMap, renderHint));
      const internalCss = buildInternalCss(renderHint);
      const withCss = internalCss ? injectInternalCss(styled, internalCss) : styled;
      const sized = setExplicitDimensions(withCss, `${size}px`, `${size}px`);

      const dataUrl = await rasterizeSvgToDataUrl(sized, size, renderHint);
      if (dataUrl) {
        dataUrlCache.set(key, dataUrl);
        storageSet(storageKey, dataUrl);
        console.log(`[Rasterizer] Cached PNG -> key:${storageKey} size:${size} hint:${renderHint}`);
      } else {
        console.warn('[Rasterizer] Empty data URL generated for', { srcUrl });
      }
      return dataUrl;
    } catch (err) {
      console.error('[Rasterizer] Failed to rasterize', srcUrl, err);
      return '';
    } finally {
      promiseCache.delete(key);
    }
  })();

  promiseCache.set(key, promise);
  return promise;
}

export default {
  getRasterizedPng,
  clearRasterCaches,
};
