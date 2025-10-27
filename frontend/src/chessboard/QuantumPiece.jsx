// frontend/src/chessboard/QuantumPiece.jsx
// Purpose: Visual renderer for a quantum chess piece sized to fit within its square using rasterized PNGs generated from SVGs; supports single, pair, and multi-type overlays. Colors propagate via CSS variables and trigger re-rasterization.
// Imports From: ../theme.js, ./RasterizedSvgImg.jsx
// Exported To: ./Board.jsx

import React, { useMemo } from 'react';
import theme from '../theme.js';
import RasterizedSvgImg from './RasterizedSvgImg.jsx';

// Single-type assets
import imgP from '../assets/p.svg?url';
import imgN from '../assets/n.svg?url';
import imgB from '../assets/b.svg?url';
import imgR from '../assets/r.svg?url';
import imgQ from '../assets/q.svg?url';
import imgK from '../assets/k.svg?url';

// Two-type composite assets
import imgBK from '../assets/bk.svg?url';
import imgBQ from '../assets/bq.svg?url';
import imgBR from '../assets/br.svg?url';
import imgNB from '../assets/nb.svg?url';
import imgNK from '../assets/nk.svg?url';
import imgNQ from '../assets/nq.svg?url';
import imgNR from '../assets/nr.svg?url';
import imgPB from '../assets/pb.svg?url';
import imgPK from '../assets/pk.svg?url';
import imgPN from '../assets/pn.svg?url';
import imgPQ from '../assets/pq.svg?url';
import imgPR from '../assets/pr.svg?url';
import imgQK from '../assets/qk.svg?url';
import imgRK from '../assets/rk.svg?url';
import imgRQ from '../assets/rq.svg?url';

// Quantum overlay assets (per-type SVGs)
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

export default function QuantumPiece({
  id,
  side,
  possibleTypes,
  size = 64,
  isSelected = false,
  onClick,
  onPointerDown,
  ariaLabel,
  svgStyleBySide = { white: {}, black: {} },
  rotate180 = false,
}) {
  const types = Array.isArray(possibleTypes) ? possibleTypes.slice() : [];
  const tCount = types.length;

  const isSmall = size <= 56;
  const baseDropShadow = isSmall ? 'none' : `drop-shadow(0 1px 2px ${theme.shadow})`;

  // Visual scale relative to the square, padded slightly to avoid clipping
  const visualScalePercent = '97%';

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
      contain: 'layout paint size',
      backfaceVisibility: 'hidden',
      touchAction: 'none',
    },
    rasterImg: {
      width: visualScalePercent,
      height: visualScalePercent,
      objectFit: 'contain',
      display: 'block',
      pointerEvents: 'none',
      filter: baseDropShadow,
      imageRendering: isSmall ? 'pixelated' : 'auto',
      contain: 'layout paint size',
      backfaceVisibility: 'hidden',
    },
    overlayStack: {
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'grid',
      placeItems: 'center',
    },
    overlayImg: (z) => ({
      position: 'absolute',
      inset: '1%',
      margin: '0',
      pointerEvents: 'none',
      opacity: isSmall ? 1 : 0.95,
      filter: baseDropShadow,
      zIndex: z,
      imageRendering: isSmall ? 'pixelated' : 'auto',
      contain: 'layout paint size',
      backfaceVisibility: 'hidden',
      width: '98%',
      height: '98%',
    }),
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) onClick({ id, side, types });
  };

  const handlePointerDown = (e) => {
    e.stopPropagation();
    if (onPointerDown) onPointerDown(e);
  };

  const sideVars = side === 'white' ? (svgStyleBySide.white || {}) : (svgStyleBySide.black || {});
  const renderHint = isSmall ? 'crisp' : 'precision';

  const transformParts = [];
  if (isSelected) transformParts.push('translateY(-1px)');
  else transformParts.push('translateZ(0)');
  if (rotate180) transformParts.push('rotate(180deg)');
  const containerStyle = { ...baseStyles.container, transform: transformParts.join(' ') };

  // Single-type rendering as rasterized PNG
  if (tCount === 1) {
    const t = types[0];
    const src = singleMap[t];
    return (
      <div
        className="qc-quantum-piece qc-quantum-piece--single"
        style={containerStyle}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        role="img"
        aria-label={ariaLabel || `Piece ${t}`}
      >
        <RasterizedSvgImg
          srcSvgUrl={src}
          cssVarMap={sideVars}
          idPrefix={`${id}-single-${t}`}
          size={size}
          renderHint={renderHint}
          className="qc-quantum-raster-single"
          style={baseStyles.rasterImg}
          alt=""
        />
      </div>
    );
  }

  // Two-type composite rendering as rasterized PNG
  if (tCount === 2) {
    const [a, b] = types;
    const key = canonicalPairKey(a, b);
    const src = pairAssetMap.get(key);
    if (src) {
      return (
        <div
          className="qc-quantum-piece qc-quantum-piece--pair"
          style={containerStyle}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          role="img"
          aria-label={ariaLabel || `Piece ${a}/${b}`}
        >
          <RasterizedSvgImg
            srcSvgUrl={src}
            cssVarMap={sideVars}
            idPrefix={`${id}-pair-${a}-${b}`}
            size={size}
            renderHint={renderHint}
            className="qc-quantum-raster-pair"
            style={baseStyles.rasterImg}
            alt=""
          />
        </div>
      );
    }
  }

  // 3+ types: overlay quantum rasterized PNGs
  const overlays = types.map((t, i) => {
    const src = quantumUrlMap[t];
    if (!src) return null;
    return (
      <RasterizedSvgImg
        key={`${id}-${t}`}
        srcSvgUrl={src}
        cssVarMap={sideVars}
        idPrefix={`${id}-${t}`}
        size={size}
        renderHint={renderHint}
        className="qc-quantum-raster-overlay"
        style={baseStyles.overlayImg(i + 1)}
        alt=""
      />
    );
  });

  return (
    <div
      className="qc-quantum-piece qc-quantum-piece--overlay"
      style={containerStyle}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      role="img"
      aria-label={ariaLabel || `Quantum piece: ${types.join('/')}`}
    >
      <div className="qc-quantum-overlay-stack" style={baseStyles.overlayStack}>{overlays}</div>
    </div>
  );
}
