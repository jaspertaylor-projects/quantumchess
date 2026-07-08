// frontend/src/chessboard/QuantumPiece.jsx
// Purpose: Visual renderer for a quantum chess piece sized to fit within its square using rasterized PNGs generated from SVGs; supports single, pair, and multi-type overlays. Colors propagate via CSS variables and trigger re-rasterization.
// Imports From: ../theme.js, ./RasterizedSvgImg.jsx
// Exported To: ./Board.jsx

import React, { useMemo } from 'react';
import theme from '../theme.js';
import StyledSvgImg from './StyledSvgImg.jsx';
import { DEFAULT_COHERENCE, RECOHERE_THRESHOLD } from './gameConstants.js';
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
  ['k|n', imgNK],
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
  sealed = false,
  indicators = DEFAULT_INDICATORS,
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
    pipCenter: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 0,
      height: 0,
      pointerEvents: 'none',
      zIndex: 20,
    },
    pip: (filled, inkHex) => {
      const d = Math.max(3, Math.round(size * 0.09));
      return {
        width: d,
        height: d,
        borderRadius: 999,
        backgroundColor: filled ? inkHex : 'rgba(255,255,255,0.28)',
        border: '1px solid rgba(0,0,0,0.4)',
        boxSizing: 'border-box',
      };
    },
    pipAtAngle: (angleDeg, filled, inkHex) => {
      const d = Math.max(3, Math.round(size * 0.09));
      const radius = Math.max(4, Math.round(size * 0.13));
      const rad = (angleDeg * Math.PI) / 180;
      return {
        ...baseStyles.pip(filled, inkHex),
        position: 'absolute',
        left: Math.round(Math.cos(rad) * radius) - d / 2,
        top: Math.round(Math.sin(rad) * radius) - d / 2,
      };
    },
  };

  // Every insignia and dot on a piece — coherence pips, recoherence row,
  // promo braces, castle link, sealed line — draws in ONE ink: the piece's
  // own border (band stroke) color, so the marks always read as part of the
  // piece and follow any custom piece colors automatically.
  const sideVars = (svgStyleBySide && svgStyleBySide[side]) || {};
  const ink = sideVars['--band-stroke'] || (side === 'white' ? '#111827' : '#f2f2f2');
  const effectiveCoherence = Number.isFinite(coherence) ? coherence : DEFAULT_COHERENCE;
  const TRIANGLE_ANGLES = [-90, 30, 150];

  // Promotion insignia: bra-ket braces in the owner's indicator color — the
  // same fill as its dots — wrapped around whichever dot cluster the piece
  // carries (bottom recoherence row, or the center triangle on 3+ pieces).
  const showPromoBraces = promoted && indicators.promoted;
  const brace = (open, h, key) => (
    <svg
      key={key}
      width={Math.max(4, Math.ceil(h * 0.55))}
      height={h}
      viewBox="0 0 6 10"
      style={{ display: 'block', flex: 'none', filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      aria-hidden="true"
    >
      <path
        d={open ? 'M5 1 L1.6 5 L5 9' : 'M1 1 L4.4 5 L1 9'}
        fill="none"
        stroke={ink}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const dotD = Math.max(3, Math.round(size * 0.09));
  const bottomBraceH = Math.max(6, Math.round(dotD * 1.9));

  const pips = tCount > 2 && (indicators.coherence || showPromoBraces) ? (
    <div className="qc-coherence-pips qc-coherence-pips--triangle" style={baseStyles.pipCenter} aria-hidden="true">
      {indicators.coherence
        ? TRIANGLE_ANGLES.map((angle, i) => (
            <span key={`pip-${i}`} style={baseStyles.pipAtAngle(angle, i < effectiveCoherence, ink)} />
          ))
        : null}
      {showPromoBraces ? (
        <>
          <div style={{ position: 'absolute', left: -Math.round(size * 0.26), top: -Math.round(size * 0.15) }}>
            {brace(true, Math.max(8, Math.round(size * 0.3)))}
          </div>
          <div style={{ position: 'absolute', left: Math.round(size * 0.26) - Math.ceil(Math.max(8, Math.round(size * 0.3)) * 0.55), top: -Math.round(size * 0.15) }}>
            {brace(false, Math.max(8, Math.round(size * 0.3)))}
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  // Recoherence progress on nearly-defined pieces: a bottom row of dots in the
  // OWNER's color counting toward regaining a possibility. Always shown on
  // <= 2 type pieces, empty until the clock starts (a fresh collapse sits at
  // zero for one full turn — recohere -1/0 both render as empty). Entangled
  // castle partners never recohere, so they carry a chain-link mark instead
  // of a clock that would never fill. A SEALED piece (conservation leaves it
  // nothing to regain — the position's piece set is final for it) shows a
  // solid line instead of a clock that would cycle forever.
  const regainProgress = Math.max(0, Math.min(RECOHERE_THRESHOLD, recohere || 0));
  const nearlyDefined = tCount >= 1 && tCount <= 2;
  const linkWidth = Math.max(10, Math.round(size * 0.22));
  const bottomDots = sealed ? (
    <span
      key="sealed-line"
      className="qc-sealed-line"
      style={{
        width: dotD * 3 + 4,
        height: Math.max(2, Math.round(dotD * 0.55)),
        borderRadius: 999,
        backgroundColor: ink,
        border: '1px solid rgba(0,0,0,0.4)',
        boxSizing: 'border-box',
      }}
    />
  ) : (
    Array.from({ length: RECOHERE_THRESHOLD }, (_, i) => (
      <span key={`regain-${i}`} style={baseStyles.pip(i < regainProgress, ink)} />
    ))
  );
  const regainPips = nearlyDefined && entangled && indicators.entangled ? (
    <div className="qc-entangled-mark" style={baseStyles.ringRow} aria-hidden="true">
      <svg
        width={linkWidth}
        height={Math.round(linkWidth * 0.5)}
        viewBox="0 0 24 12"
        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.7))' }}
      >
        <g fill="none" stroke={ink} strokeWidth="2.2">
          <rect x="1.4" y="2.6" width="11.6" height="6.8" rx="3.4" />
          <rect x="11" y="2.6" width="11.6" height="6.8" rx="3.4" />
        </g>
      </svg>
    </div>
  ) : nearlyDefined && !entangled && (indicators.recohere || showPromoBraces) ? (
    <div className="qc-recohere-pips" style={baseStyles.pipRow} aria-hidden="true">
      {showPromoBraces ? brace(true, bottomBraceH, 'brace-open') : null}
      {indicators.recohere ? bottomDots : null}
      {showPromoBraces ? brace(false, bottomBraceH, 'brace-close') : null}
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
        </div>
      );
    }
  }

  // 3+ types: overlay quantum rasterized PNGs. At the GOAT hint level the
  // type glyphs inside the trapezoids are hidden — only the bands remain.
  const overlayVars = indicators.typeIcons === false
    ? { ...sideVars, ['--icon-color']: 'rgba(0,0,0,0)' }
    : sideVars;
  const overlays = types.map((t, i) => {
    const src = quantumUrlMap[t];
    if (!src) return null;
    return (
      <StyledSvgImg
        key={`${id}-${t}`}
        srcSvgUrl={src}
        cssVarMap={overlayVars}
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
    </div>
  );
}
