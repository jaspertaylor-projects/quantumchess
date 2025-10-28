// frontend/src/components/AppHeader.jsx
// Purpose: Render the application header bar with animated title and showcase chess piece icons with PNG primary and SVG fallback.
// Imports From: ../theme.js, ../chessboard/RasterizedSvgImg.jsx
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import RasterizedSvgImg from '../chessboard/RasterizedSvgImg.jsx';

import imgP from '../assets/p.svg?url';
import imgN from '../assets/n.svg?url';
import imgB from '../assets/b.svg?url';
import imgR from '../assets/r.svg?url';
import imgQ from '../assets/q.svg?url';
import imgK from '../assets/k.svg?url';

const TYPE_TO_SVG = {
  p: imgP,
  n: imgN,
  b: imgB,
  r: imgR,
  q: imgQ,
  k: imgK,
};

const TYPE_TO_STYLISH_PNG = {
  p: '/src/public/stylish_pawn.png',
  n: '/src/public/stylish_knight.png',
  b: '/src/public/stylish_bishop.png',
  r: '/src/public/stylish_rook.png',
  q: '/src/public/stylish_queen.png',
  k: '/src/public/stylish_king.png',
};

function HeaderPieceIcon({ t, sideCssVars }) {
  const [useFallback, setUseFallback] = useState(false);
  const [pxSize, setPxSize] = useState(32);
  const wrapRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        const raw = Math.min(cr.width, cr.height);
        const snapped = Math.max(16, Math.floor(raw));
        if (snapped !== pxSize) setPxSize(snapped);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pxSize]);

  const srcSvg = TYPE_TO_SVG[t] || TYPE_TO_SVG.p;
  const pngSrc = TYPE_TO_STYLISH_PNG[t] || TYPE_TO_STYLISH_PNG.p;

  const sizeScale = useMemo(() => {
    if (t === 'q' || t === 'k') return 1.0;
    if (t === 'p') return 0.8;
    return 0.9;
  }, [t]);

  const innerStyle = useMemo(() => ({
    width: `${Math.round(sizeScale * 100)}%`,
    height: `${Math.round(sizeScale * 100)}%`,
    objectFit: 'contain',
    objectPosition: 'bottom center',
    display: 'block',
    alignSelf: 'flex-end',
  }), [sizeScale]);

  const renderSize = Math.max(16, Math.floor(pxSize * sizeScale));

  const styles = {
    titleIconWrap: {
      height: '100%',
      aspectRatio: '1 / 1',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      overflow: 'hidden',
      pointerEvents: 'none',
    },
  };

  return (
    <div ref={wrapRef} className="qc-title-icon-wrap" style={styles.titleIconWrap} aria-hidden>
      {!useFallback ? (
        <img
          className="qc-title-icon-img"
          src={pngSrc}
          alt=""
          decoding="async"
          fetchpriority="high"
          style={innerStyle}
          onError={() => setUseFallback(true)}
        />
      ) : (
        <RasterizedSvgImg
          srcSvgUrl={srcSvg}
          cssVarMap={sideCssVars}
          idPrefix={`hdr-${t}`}
          size={renderSize}
          renderHint={renderSize <= 32 ? 'crisp' : 'precision'}
          className="qc-title-icon-fallback"
          style={innerStyle}
          alt=""
        />
      )}
    </div>
  );
}

export default function AppHeader({ svgStyles }) {
  const TITLE_SIZE_CSS = 'clamp(1.6rem, 5vw, 3.2rem)';

  const styles = {
    appHeader: {
      backgroundColor: '#000',
      padding: '0 clamp(8px, 1.5vw, 16px)',
      borderRadius: 0,
      textAlign: 'center',
      width: '100%',
      boxSizing: 'border-box',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      ['--qc-title-size']: TITLE_SIZE_CSS,
      height: 'calc(var(--qc-title-size) * 1.5)',
      minHeight: 'calc(var(--qc-title-size) * 1.5)',
      maxHeight: 'calc(var(--qc-title-size) * 1.5)',
      flex: '0 0 auto',
    },
    appTitleWrap: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      padding: 0,
      flex: '1 1 auto',
      overflow: 'hidden',
    },
    appTitleRow: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
      alignItems: 'center',
      gap: 'clamp(8px, 1.2vw, 16px)',
      padding: 0,
      borderRadius: 0,
      backgroundColor: 'transparent',
      width: '100%',
      margin: 0,
      height: '100%',
    },
    appTitleCenterGroup: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'clamp(6px, 1vw, 10px)',
      flex: '0 1 auto',
      minWidth: 0,
      backgroundColor: 'transparent',
      padding: 0,
      borderRadius: 0,
      height: '100%',
    },
    titleStrip: (side) => ({
      display: 'flex',
      alignItems: 'center',
      justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
      gap: 'clamp(6px, 1vw, 12px)',
      width: '100%',
      minWidth: 0,
      height: '100%',
      overflow: 'hidden',
    }),
    appTitleText: {
      margin: 0,
      fontSize: 'var(--qc-title-size)',
      fontWeight: 1000,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      backgroundImage: 'linear-gradient(90deg, #00f5ff 0%, #b400ff 38%, #ff3b7f 64%, #00f5ff 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      textShadow: [
        '0 0 6px rgba(0,245,255,0.45)',
        '0 0 12px rgba(180,0,255,0.35)',
        '0 0 22px rgba(255,59,127,0.35)'
      ].join(', '),
      lineHeight: 1,
      display: 'inline-block',
      alignSelf: 'center',
      whiteSpace: 'nowrap',
    },
    appTitleUnderline: {
      marginTop: '4px',
      height: '3px',
      width: '100%',
      background: 'linear-gradient(90deg, rgba(0,245,255,0) 0%, rgba(0,245,255,0.8) 16%, rgba(180,0,255,0.95) 50%, rgba(255,59,127,0.8) 84%, rgba(255,59,127,0) 100%)',
      borderRadius: 3,
      boxShadow: '0 0 18px rgba(180,0,255,0.45), 0 0 28px rgba(0,245,255,0.25)',
      alignSelf: 'center',
      flex: '0 0 auto',
    },
  };

  return (
    <header className="qc-app-header" style={styles.appHeader}>
      <div className="qc-app-title-wrap" style={styles.appTitleWrap}>
        <div className="qc-app-title-row" style={styles.appTitleRow}>
          <div className="qc-title-strip qc-title-strip--left" style={styles.titleStrip('left')} aria-hidden>
            <HeaderPieceIcon t="q" sideCssVars={svgStyles.white || {}} />
            <HeaderPieceIcon t="b" sideCssVars={svgStyles.white || {}} />
            <HeaderPieceIcon t="n" sideCssVars={svgStyles.white || {}} />
          </div>
          <div className="qc-app-title-center-group" style={styles.appTitleCenterGroup}>
            <h1 className="qc-app-title-text" style={styles.appTitleText}>Quantum Chess</h1>
          </div>
          <div className="qc-title-strip qc-title-strip--right" style={styles.titleStrip('right')} aria-hidden>
            <HeaderPieceIcon t="p" sideCssVars={svgStyles.white || {}} />
            <HeaderPieceIcon t="r" sideCssVars={svgStyles.white || {}} />
            <HeaderPieceIcon t="k" sideCssVars={svgStyles.white || {}} />
          </div>
        </div>
      </div>
      <div className="qc-app-title-underline" style={styles.appTitleUnderline} />
    </header>
  );
}
