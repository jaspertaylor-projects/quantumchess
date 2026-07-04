// frontend/src/chessboard/QuantumPiece.jsx
// Purpose: Visual renderer for a quantum chess piece sized to fit within its square using rasterized PNGs generated from SVGs; supports single, pair, and multi-type overlays. Colors propagate via CSS variables and trigger re-rasterization.
// Imports From: ../theme.js, ./RasterizedSvgImg.jsx
// Exported To: ./Board.jsx

import React, { useMemo } from 'react';
import theme from '../theme.js';
import StyledSvgImg from './StyledSvgImg.jsx';
import { DEFAULT_COHERENCE, RECOHERE_THRESHOLD } from './gameConstants.js';
import { DEFAULT_MEASUREMENT_COLORS } from '../settings/useMeasurementColors.js';
import { DEFAULT_INDICATORS } from '../settings/useIndicatorSettings.js';

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
  coherence = DEFAULT_COHERENCE,
  recohere = 0,
  entangled = false,
  promoted = false,
  indicators = DEFAULT_INDICATORS,
  measurementColors = DEFAULT_MEASUREMENT_COLORS,
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
    pipRow: {
      position: 'absolute',
      bottom: '3%',
      left: 0,
      right: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      pointerEvents: 'none',
      zIndex: 20,
    },
    ringRow: {
      position: 'absolute',
      bottom: '0%',
      left: 0,
      right: 0,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 20,
    },
    promoBadge: {
      position: 'absolute',
      top: '3%',
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 21,
    },
    pipCenter: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 0,
      height: 0,
      pointerEvents: 'none',
      zIndex: 20,
    },
    pip: (filled, attackerHex) => {
      const d = Math.max(3, Math.round(size * 0.09));
      return {
        width: d,
        height: d,
        borderRadius: 999,
        backgroundColor: filled ? attackerHex : 'rgba(255,255,255,0.28)',
        border: '1px solid rgba(0,0,0,0.4)',
        boxSizing: 'border-box',
      };
    },
    pipAtAngle: (angleDeg, filled, attackerHex) => {
      const d = Math.max(3, Math.round(size * 0.09));
      const radius = Math.max(4, Math.round(size * 0.13));
      const rad = (angleDeg * Math.PI) / 180;
      return {
        ...baseStyles.pip(filled, attackerHex),
        position: 'absolute',
        left: Math.round(Math.cos(rad) * radius) - d / 2,
        top: Math.round(Math.sin(rad) * radius) - d / 2,
      };
    },
  };

  // Coherence pips, drawn in the attacking side's color (filled = remaining).
  // The triangle gauge lives in the center of measurable (3+ type) pieces
  // only — nearly-defined pieces carry the bottom recoherence row instead.
  const colors = measurementColors || DEFAULT_MEASUREMENT_COLORS;
  const attackerHex = colors[side === 'white' ? 'black' : 'white'] || '#ba55d1';
  const ownHex = colors[side] || '#4fc3f7';
  const effectiveCoherence = Number.isFinite(coherence) ? coherence : DEFAULT_COHERENCE;
  const TRIANGLE_ANGLES = [-90, 30, 150];
  const pips = indicators.coherence && tCount > 2 ? (
    <div className="qc-coherence-pips qc-coherence-pips--triangle" style={baseStyles.pipCenter} aria-hidden="true">
      {TRIANGLE_ANGLES.map((angle, i) => (
        <span key={`pip-${i}`} style={baseStyles.pipAtAngle(angle, i < effectiveCoherence, attackerHex)} />
      ))}
    </div>
  ) : null;

  // Recoherence progress on nearly-defined pieces: a bottom row of dots in the
  // OWNER's color counting toward regaining a possibility. Always shown on
  // <= 2 type pieces, empty until the clock starts (a fresh collapse sits at
  // zero for one full turn — recohere -1/0 both render as empty). Entangled
  // castle partners never recohere, so they carry a chain-link mark instead
  // of a clock that would never fill.
  const regainProgress = Math.max(0, Math.min(RECOHERE_THRESHOLD, recohere || 0));
  const nearlyDefined = tCount >= 1 && tCount <= 2;
  const linkWidth = Math.max(10, Math.round(size * 0.22));
  const regainPips = nearlyDefined && entangled && indicators.entangled ? (
    <div className="qc-entangled-mark" style={baseStyles.ringRow} aria-hidden="true">
      <svg
        width={linkWidth}
        height={Math.round(linkWidth * 0.5)}
        viewBox="0 0 24 12"
        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.7))' }}
      >
        <g fill="none" stroke={ownHex} strokeWidth="2.2">
          <rect x="1.4" y="2.6" width="11.6" height="6.8" rx="3.4" />
          <rect x="11" y="2.6" width="11.6" height="6.8" rx="3.4" />
        </g>
      </svg>
    </div>
  ) : nearlyDefined && !entangled && indicators.recohere ? (
    <div className="qc-recohere-pips" style={baseStyles.pipRow} aria-hidden="true">
      {Array.from({ length: RECOHERE_THRESHOLD }, (_, i) => (
        <span key={`regain-${i}`} style={baseStyles.pip(i < regainProgress, ownHex)} />
      ))}
    </div>
  ) : null;

  // Promotion badge: a piece that has already promoted wears chevrons in the
  // owner's indicator color, top-center — the slot where Pawn would have been
  // drawn in the overlay layout, which a promoted piece can never be again.
  const chevronSize = Math.max(8, Math.round(size * 0.2));
  const promoBadge = promoted && indicators.promoted ? (
    <div className="qc-promoted-badge" style={baseStyles.promoBadge} aria-hidden="true">
      <svg
        width={chevronSize}
        height={chevronSize}
        viewBox="0 0 10 10"
        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      >
        <g fill="none" stroke={ownHex} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4.6 L5 2 L8 4.6" />
          <path d="M2 8.2 L5 5.6 L8 8.2" />
        </g>
      </svg>
    </div>
  ) : null;

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
        <StyledSvgImg
          srcSvgUrl={src}
          cssVarMap={sideVars}
          idPrefix={`${id}-single-${t}`}
          size={size}
          renderHint={renderHint}
          className="qc-quantum-raster-single"
          style={baseStyles.rasterImg}
          alt=""
        />
        {regainPips}
        {promoBadge}
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
          <StyledSvgImg
            srcSvgUrl={src}
            cssVarMap={sideVars}
            idPrefix={`${id}-pair-${a}-${b}`}
            size={size}
            renderHint={renderHint}
            className="qc-quantum-raster-pair"
            style={baseStyles.rasterImg}
            alt=""
          />
          {regainPips}
          {promoBadge}
        </div>
      );
    }
  }

  // 3+ types: overlay quantum rasterized PNGs
  const overlays = types.map((t, i) => {
    const src = quantumUrlMap[t];
    if (!src) return null;
    return (
      <StyledSvgImg
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
      {pips}
      {promoBadge}
    </div>
  );
}
