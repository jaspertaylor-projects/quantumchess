// frontend/src/chessboard/QuantumPiece.jsx
// Purpose: Visual renderer for a quantum chess piece sized to fit within its square, supporting single, pair, and multi-type overlays with inline-SVG, CSS-variable theming, and unique ID prefixing.
// Imports From: ../theme.js
// Exported To: ./Board.jsx

import React, { useEffect, useMemo, useState } from 'react';
import theme from '../theme.js';

// Single-type assets
import imgP from '../assets/p.svg';
import imgN from '../assets/n.svg';
import imgB from '../assets/b.svg';
import imgR from '../assets/r.svg';
import imgQ from '../assets/q.svg';
import imgK from '../assets/k.svg';

// Two-type composite assets
import imgBK from '../assets/bk.svg';
import imgBQ from '../assets/bq.svg';
import imgBR from '../assets/br.svg';
import imgNB from '../assets/nb.svg';
import imgNK from '../assets/nk.svg';
import imgNQ from '../assets/nq.svg';
import imgNR from '../assets/nr.svg';
import imgPB from '../assets/pb.svg';
import imgPK from '../assets/pk.svg';
import imgPN from '../assets/pn.svg';
import imgPQ from '../assets/pq.svg';
import imgPR from '../assets/pr.svg';
import imgQK from '../assets/qk.svg';
import imgRK from '../assets/rk.svg';
import imgRQ from '../assets/rq.svg';

// Quantum overlay assets as URL strings to inline and prefix IDs at runtime
import qUrlP from '../assets/quantum_p.svg?url';
import qUrlN from '../assets/quantum_n.svg?url';
import qUrlB from '../assets/quantum_b.svg?url';
import qUrlR from '../assets/quantum_r.svg?url';
import qUrlQ from '../assets/quantum_q.svg?url';
import qUrlK from '../assets/quantum_k.svg?url';

const singleMap = {
  p: imgP,
  n: imgN,
  b: imgB,
  r: imgR,
  q: imgQ,
  k: imgK,
};

// Keys are canonicalized two-type sets in alphabetical order joined with '|'
// Values are actual provided composite asset images.
const pairAssetMap = new Map([
  ['b|k', imgBK],
  ['b|q', imgBQ],
  ['b|r', imgBR],
  ['b|n', imgNB],
  ['n|k', imgNK],
  ['n|q', imgNQ],
  ['n|r', imgNR],
  ['b|p', imgPB],
  ['k|p', imgPK],
  ['n|p', imgPN],
  ['p|q', imgPQ],
  ['p|r', imgPR],
  ['k|q', imgQK],
  ['k|r', imgRK],
  ['q|r', imgRQ],
]);

const quantumUrlMap = {
  p: qUrlP,
  n: qUrlN,
  b: qUrlB,
  r: qUrlR,
  q: qUrlQ,
  k: qUrlK,
};

function canonicalPairKey(a, b) {
  const [x, y] = [a, b].sort();
  return `${x}|${y}`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Prefix all IDs within an SVG and update internal references to avoid collisions when overlaying multiple SVGs.
function prefixSvgIds(svgText, prefix) {
  if (!svgText || !prefix) return svgText;

  const idRegex = /\sid="([^"]+)"/g;
  const ids = new Set();
  let m;
  while ((m = idRegex.exec(svgText)) !== null) {
    ids.add(m[1]);
  }
  if (ids.size === 0) return svgText;

  let out = svgText;
  const map = new Map();
  for (const oldId of ids) {
    const safePrefix = prefix.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const nu = `${safePrefix}__${oldId}`;
    map.set(oldId, nu);
  }

  // Replace id attributes first
  for (const [oldId, nu] of map.entries()) {
    out = out.replace(new RegExp(`(\\sid=")${escapeRegExp(oldId)}(\")`, 'g'), `$1${nu}$2`);
  }

  // Common reference patterns: url(#id), href="#id", xlink:href="#id", begin="id."
  for (const [oldId, nu] of map.entries()) {
    out = out.replace(new RegExp(`url\\(#${escapeRegExp(oldId)}\\)`, 'g'), `url(#${nu})`);
    out = out.replace(new RegExp(`([\\"\\'])#${escapeRegExp(oldId)}([\\"\\'])`, 'g'), `$1#${nu}$2`);
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

// InlineSvgFromUrl: fetches an external SVG URL and inlines it into the DOM while injecting CSS variables and unique ID prefixes onto the root <svg>.
function InlineSvgFromUrl({ src, wrapperStyle, cssVarMap, className, idPrefix, renderHint = 'precision' }) {
  const [svgHtml, setSvgHtml] = useState('');

  const hintRootStyle = useMemo(() => {
    if (renderHint === 'crisp') {
      return 'shape-rendering: crispEdges; text-rendering: geometricPrecision;';
    }
    return 'shape-rendering: geometricPrecision; text-rendering: optimizeLegibility;';
  }, [renderHint]);

  const internalCss = useMemo(() => {
    if (renderHint !== 'crisp') return '';
    return `* { vector-effect: non-scaling-stroke; }
            path, line, polyline, polygon { shape-rendering: crispEdges; }
            g, use, symbol { shape-rendering: crispEdges; }`;
  }, [renderHint]);

  const varStyleString = useMemo(() => {
    const entries = Object.entries(cssVarMap || {}).filter(([k]) => k.startsWith('--'));
    const cssVars = entries.map(([k, v]) => `${k}: ${v};`).join(' ');
    const sizeRules = 'width: 100%; height: 100%;';
    return `${cssVars} ${sizeRules} ${hintRootStyle}`.trim();
  }, [cssVarMap, hintRootStyle]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(src, { cache: 'force-cache' });
        const text = await res.text();
        if (cancelled) return;
        const prefixed = prefixSvgIds(text, idPrefix || 'qsvg');
        const injectedStyle = injectStyleIntoSvg(prefixed, varStyleString);
        const injectedCss = internalCss ? injectInternalCss(injectedStyle, internalCss) : injectedStyle;
        setSvgHtml(injectedCss);
      } catch {
        setSvgHtml('');
      }
    }

    if (src) load();

    return () => {
      cancelled = true;
    };
  }, [src, varStyleString, idPrefix, internalCss]);

  return (
    <div
      className={className || 'qc-inline-svg-wrapper'}
      style={wrapperStyle}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}

export default function QuantumPiece({
  id,
  side,
  possibleTypes,
  size = 64,
  isSelected = false,
  onClick,
  ariaLabel,
  svgStyleBySide = { white: {}, black: {} },
}) {
  const types = Array.isArray(possibleTypes) ? possibleTypes.slice() : [];
  const tCount = types.length;

  const isSmall = size <= 48;
  const baseDropShadow = isSmall ? 'none' : `drop-shadow(0 1px 2px ${theme.shadow})`;

  // 95% visual scale relative to the square
  const visualScalePercent = '90%';

  const baseStyles = {
    container: {
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      userSelect: 'none',
      filter: isSelected ? 'drop-shadow(0 0 8px rgba(97,218,251,0.55))' : 'none',
      transition: 'filter 120ms ease-in-out, transform 80ms ease-in-out',
      transform: isSelected ? 'translateY(-1px)' : 'translateZ(0)',
      contain: 'layout paint size',
      backfaceVisibility: 'hidden',
    },
    image: {
      width: visualScalePercent,
      height: visualScalePercent,
      objectFit: 'contain',
      display: 'block',
      pointerEvents: 'none',
      filter: baseDropShadow,
      imageRendering: isSmall ? 'crisp-edges' : 'auto',
    },
    inlineSvg: {
      position: 'relative',
      width: visualScalePercent,
      height: visualScalePercent,
      objectFit: 'contain',
      pointerEvents: 'none',
      filter: baseDropShadow,
      imageRendering: isSmall ? 'crisp-edges' : 'auto',
      contain: 'layout paint size',
      backfaceVisibility: 'hidden',
      display: 'block',
    },
    overlayStack: {
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'grid',
      placeItems: 'center',
    },
    overlaySvg: (z) => ({
      position: 'absolute',
      inset: '2.5%',
      margin: '0',
      pointerEvents: 'none',
      opacity: isSmall ? 1 : 0.95,
      filter: baseDropShadow,
      zIndex: z,
      imageRendering: isSmall ? 'crisp-edges' : 'auto',
      contain: 'layout paint size',
      backfaceVisibility: 'hidden',
    }),
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) onClick({ id, side, types });
  };

  // Determine side variables once for all render paths
  const sideVars = side === 'white' ? (svgStyleBySide.white || {}) : (svgStyleBySide.black || {});
  const renderHint = isSmall ? 'crisp' : 'precision';

  // Single-type rendering (inline SVG so CSS variables apply)
  if (tCount === 1) {
    const t = types[0];
    const src = singleMap[t];
    return (
      <div
        className="qc-quantum-piece qc-quantum-piece--single"
        style={baseStyles.container}
        onClick={handleClick}
        role="img"
        aria-label={ariaLabel || `Piece ${t}`}
      >
        <InlineSvgFromUrl
          src={src}
          wrapperStyle={baseStyles.inlineSvg}
          cssVarMap={sideVars}
          className="qc-quantum-inline-single"
          idPrefix={`${id}-single-${t}`}
          renderHint={renderHint}
        />
      </div>
    );
  }

  // Two-type composite rendering (inline SVG so CSS variables apply)
  if (tCount === 2) {
    const [a, b] = types;
    const key = canonicalPairKey(a, b);
    const src = pairAssetMap.get(key);
    if (src) {
      return (
        <div
          className="qc-quantum-piece qc-quantum-piece--pair"
          style={baseStyles.container}
          onClick={handleClick}
          role="img"
          aria-label={ariaLabel || `Piece ${a}/${b}`}
        >
          <InlineSvgFromUrl
            src={src}
            wrapperStyle={baseStyles.inlineSvg}
            cssVarMap={sideVars}
            className="qc-quantum-inline-pair"
            idPrefix={`${id}-pair-${a}-${b}`}
            renderHint={renderHint}
          />
        </div>
      );
    }
  }

  // 3+ types: overlay quantum inline SVGs with per-side CSS variables
  const splitOverlayStyles = (z) => {
    const layout = baseStyles.overlaySvg(z);
    const cssVars = sideVars;
    return { layout, cssVars };
  };

  const overlays = types.map((t, i) => {
    const src = quantumUrlMap[t];
    if (!src) return null;
    const { layout, cssVars } = splitOverlayStyles(i + 1);
    return (
      <InlineSvgFromUrl
        key={`${id}-${t}`}
        src={src}
        wrapperStyle={layout}
        cssVarMap={cssVars}
        className="qc-quantum-overlay-inline"
        idPrefix={`${id}-${t}`}
        renderHint={renderHint}
      />
    );
  });

  return (
    <div
      className="qc-quantum-piece qc-quantum-piece--overlay"
      style={baseStyles.container}
      onClick={handleClick}
      role="img"
      aria-label={ariaLabel || `Quantum piece: ${types.join('/')}`}
    >
      <div className="qc-quantum-overlay-stack" style={baseStyles.overlayStack}>{overlays}</div>
    </div>
  );
}
