// frontend/src/components/PlayerBar.jsx
// Purpose: Display a player's info bar with name/rating, a chess clock, and a compact captured pieces area; captured pieces render at a fixed pixel size to prevent bar growth.
// Imports From: ../theme.js, ../chessboard/RasterizedSvgImg.jsx
// Exported To: ../App.jsx

import React, { useMemo } from 'react';
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

// Fixed pixel size for captured icons to avoid layout shifts
const CAP_ICON_PX = 22;

function CapturedIcon({ piece, svgStyles }) {
  const types = Array.isArray(piece.possibleTypes) ? piece.possibleTypes : [];
  const order = ['p', 'n', 'b', 'r', 'q'];
  const pickType = order.find((x) => types.includes(x));
  const t = pickType || (types.includes('k') ? 'p' : 'p');

  const srcSvg = TYPE_TO_SVG[t] || TYPE_TO_SVG.p;
  const sideVars = piece.side === 'white' ? (svgStyles.white || {}) : (svgStyles.black || {});

  const capturedSideVars = useMemo(
    () => ({
      ...sideVars,
      ['--icon-color']: 'rgba(0,0,0,0)',
    }),
    [sideVars]
  );

  const styles = {
    capturedIconWrap: {
      width: `${CAP_ICON_PX}px`,
      height: `${CAP_ICON_PX}px`,
      display: 'grid',
      placeItems: 'center',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
      boxSizing: 'border-box',
      flex: '0 0 auto',
    },
  };

  return (
    <div
      className="qc-captured-icon-wrap"
      style={styles.capturedIconWrap}
      title={`Captured ${t}`}
      aria-label={`Captured ${t}`}
    >
      <RasterizedSvgImg
        srcSvgUrl={srcSvg}
        cssVarMap={capturedSideVars}
        idPrefix={`cap-${piece.id}-${t}`}
        size={CAP_ICON_PX}
        renderHint={'crisp'}
        className="qc-captured-icon-img"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        alt={`Captured ${t}`}
      />
    </div>
  );
}

export default function PlayerBar({
  side = 'white',
  playerName = 'Player',
  rating = '????',
  playerBarColors = { background: '#000', text: '#fff' },
  clockText = '—:—',
  clockActive = false,
  clockLow = false,
  capturedPawns = [],
  capturedOthers = [],
  svgStyles = { white: {}, black: {} },
  barRef = null,
}) {
  const styles = {
    playerBar: {
      width: '100%',
      minHeight: 'clamp(48px, 7.5vh, 72px)',
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      padding: '0 12px',
      boxSizing: 'border-box',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      backgroundColor: playerBarColors.background,
      boxShadow: `0 4px 12px ${theme.shadow}`,
      color: playerBarColors.text,
      userSelect: 'none',
    },
    playerInfo: {
      display: 'grid',
      gridTemplateRows: '1fr 1fr',
      alignItems: 'stretch',
      justifyItems: 'start',
      height: '100%',
      flex: '1 1 auto',
      padding: '4px 6px',
      boxSizing: 'border-box',
      minWidth: 0,
    },
    playerNameRow: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '8px',
      height: '100%',
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontSize: 'clamp(0.9rem, 2.2vw, 1.1rem)',
      color: 'currentColor',
      lineHeight: 1,
    },
    playerRatingText: {
      fontWeight: 600,
      letterSpacing: '0.03em',
      fontSize: 'clamp(0.72rem, 1.8vw, 0.95rem)',
      color: 'currentColor',
      opacity: 0.82,
      lineHeight: 1,
      paddingBottom: '1px',
      textTransform: 'none',
    },
    playerRatingRow: {
      display: 'flex',
      alignItems: 'flex-start',
      height: '100%',
      fontWeight: 600,
      letterSpacing: '0.03em',
      fontSize: 'clamp(0.85rem, 2vw, 1.05rem)',
      color: 'currentColor',
      opacity: 0.92,
      lineHeight: 1,
      gap: 8,
    },
    clockPill: {
      padding: '2px 8px',
      borderRadius: 8,
      background: clockActive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
      border: clockActive ? `1px solid ${theme.border}` : `1px dashed ${theme.border}`,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontWeight: 800,
      letterSpacing: '0.04em',
      color: clockLow ? '#ff6b6b' : 'currentColor',
      boxShadow: clockActive ? '0 1px 6px rgba(0,0,0,0.25) inset' : 'none',
      transition: 'background 0.15s ease, color 0.15s ease, border 0.15s ease',
    },
    capturedArea: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 2,
      opacity: 0.9,
      fontSize: '0.9rem',
      flex: '0 1 auto',
      height: '100%',
      maxHeight: '100%',
      overflow: 'hidden',
    },
    capturedRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
      width: '100%',
      height: `${CAP_ICON_PX}px`,
      minHeight: `${CAP_ICON_PX}px`,
      maxHeight: `${CAP_ICON_PX}px`,
      boxSizing: 'border-box',
      overflow: 'hidden',
      flex: '0 0 auto',
    },
  };

  return (
    <div
      className={`qc-player-bar qc-player-bar--${side}`}
      style={styles.playerBar}
      data-side={side}
      ref={barRef}
    >
      <div className={`qc-player-info qc-player-info--${side}`} style={styles.playerInfo}>
        <div className={`qc-player-name-row qc-player-name-row--${side}`} style={styles.playerNameRow}>
          <span className={`qc-player-name-text qc-player-name-text--${side}`}>{playerName}</span>
          <span
            className={`qc-player-rating-text qc-player-rating-text--${side}`}
            style={styles.playerRatingText}
          >
            ({rating})
          </span>
        </div>
        <div className={`qc-player-rating-row qc-player-rating-row--${side}`} style={styles.playerRatingRow}>
          <span
            className={`qc-player-clock-text qc-player-clock-text--${side}`}
            style={styles.clockPill}
            aria-label={`${side} remaining time`}
          >
            {clockText}
          </span>
        </div>
      </div>
      <div
        className={`qc-captured-area qc-captured-area--${side}`}
        style={styles.capturedArea}
        aria-label={`${side[0].toUpperCase()}${side.slice(1)} captured pieces area`}
      >
        <div className="qc-captured-row qc-captured-row--pawns" style={styles.capturedRow}>
          {capturedPawns.map((p) => (
            <CapturedIcon key={`capicon-${p.id}`} piece={p} svgStyles={svgStyles} />
          ))}
        </div>
        <div className="qc-captured-row qc-captured-row--others" style={styles.capturedRow}>
          {capturedOthers.map((p) => (
            <CapturedIcon key={`capicon-${p.id}`} piece={p} svgStyles={svgStyles} />
          ))}
        </div>
      </div>
    </div>
  );
}
