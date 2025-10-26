// frontend/src/chessboard/QuantumPiece.jsx
// Purpose: Visual renderer for a quantum chess piece; renders single, pair, or multi-type overlays and supports SVGR-based inline SVG overlays with safe fallbacks.
// Imports From: ../theme.js
// Exported To: ./Board.jsx

import React from 'react';
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

// Quantum overlay assets imported as React components via SVGR
// Note: Requires vite-plugin-svgr. If the plugin is unavailable, these imports will resolve to URL strings.
import QSvgP from '../assets/quantum_p.svg?react';
import QSvgN from '../assets/quantum_n.svg?react';
import QSvgB from '../assets/quantum_b.svg?react';
import QSvgR from '../assets/quantum_r.svg?react';
import QSvgQ from '../assets/quantum_q.svg?react';
import QSvgK from '../assets/quantum_k.svg?react';

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

const quantumComponentMap = {
  p: QSvgP,
  n: QSvgN,
  b: QSvgB,
  r: QSvgR,
  q: QSvgQ,
  k: QSvgK,
};

function canonicalPairKey(a, b) {
  const [x, y] = [a, b].sort();
  return `${x}|${y}`;
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

  const baseDropShadow = `drop-shadow(0 1px 2px ${theme.shadow})`;

  const baseStyles = {
    container: {
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      userSelect: 'none',
      filter: isSelected ? 'drop-shadow(0 0 8px rgba(97,218,251,0.55))' : 'none',
      transition: 'filter 120ms ease-in-out, transform 80ms ease-in-out',
      transform: isSelected ? 'translateY(-1px)' : 'none',
    },
    image: {
      width: '88%',
      height: '88%',
      objectFit: 'contain',
      display: 'block',
      pointerEvents: 'none',
      filter: baseDropShadow,
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
      inset: 0,
      margin: 'auto',
      width: '88%',
      height: '88%',
      objectFit: 'contain',
      pointerEvents: 'none',
      opacity: 0.95,
      filter: baseDropShadow,
      zIndex: z,
    }),
    sideTint: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: side === 'white' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)',
      border: `1px solid ${side === 'white' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)'}`,
      pointerEvents: 'none',
    },
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) onClick({ id, side, types });
  };

  // Single-type rendering
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
        <img src={src} alt={t} style={baseStyles.image} />
        <span style={baseStyles.sideTint} />
      </div>
    );
  }

  // Two-type composite rendering
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
          <img src={src} alt={`${a}${b}`} style={baseStyles.image} />
          <span style={baseStyles.sideTint} />
        </div>
      );
    }
  }

  // 3+ types: overlay quantum inline SVGs with per-side CSS variables
  const sideVars = side === 'white' ? (svgStyleBySide.white || {}) : (svgStyleBySide.black || {});

  // If vite-plugin-svgr is not active, the imports above may resolve to URL strings.
  // Provide a safe runtime fallback by rendering <img> elements to avoid crashes.
  const overlays = types.map((t, i) => {
    const Imported = quantumComponentMap[t];
    if (!Imported) return null;

    const style = { ...baseStyles.overlaySvg(i + 1), ...sideVars };

    // SVGR active: Imported is a function/component
    if (typeof Imported === 'function') {
      return <Imported key={`${id}-${t}`} style={style} />;
    }

    // Fallback: Imported is a URL string; variables won't apply inside the SVG, but avoid runtime errors
    return <img key={`${id}-${t}`} src={Imported} alt={t} style={style} />;
  });

  return (
    <div
      className="qc-quantum-piece qc-quantum-piece--overlay"
      style={baseStyles.container}
      onClick={handleClick}
      role="img"
      aria-label={ariaLabel || `Quantum piece: ${types.join('/')}`}
    >
      <div style={baseStyles.overlayStack}>{overlays}</div>
      <span style={baseStyles.sideTint} />
    </div>
  );
}
