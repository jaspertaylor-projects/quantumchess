// frontend/src/components/PlayerBar.jsx
// Purpose: Display a player's info bar with name/rating, an optional chess clock, and a compact captured pieces area; captured pieces render at a fixed pixel size to prevent bar growth.
// Imports From: ../theme.js, ../chessboard/RasterizedSvgImg.jsx
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useState } from 'react';
import theme from '../theme.js';
import StyledSvgImg from '../chessboard/StyledSvgImg.jsx';

// Bot avatar: uses /bots/<id>.png when the file exists (drop images into
// frontend/public/bots/), rendered as a plain square. Falls back to a neon
// initials tile in the bot's hue when no image is present.
function BotAvatar({ avatar, size = 46 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const imageUrl = avatar ? avatar.imageUrl : null;
  // The bars stay mounted across identity changes (Stranger -> bot, etc.), so
  // a missing image for one identity must not latch the fallback for the next.
  useEffect(() => { setImgFailed(false); }, [imageUrl]);
  if (!avatar) return null;
  const hue = avatar.hue ?? 200;
  const ring = `hsl(${hue}, 95%, 62%)`;
  const bg = `hsl(${hue}, 55%, 16%)`;
  const showImage = Boolean(avatar.imageUrl) && !imgFailed;
  const styles = {
    wrap: {
      width: size,
      height: size,
      borderRadius: 6,
      flex: '0 0 auto',
      alignSelf: 'center',
      marginRight: 10,
      position: 'relative',
      display: 'grid',
      placeItems: 'center',
      background: showImage ? 'transparent' : bg,
      border: showImage ? 'none' : `2px solid ${ring}`,
      overflow: 'hidden',
    },
    img: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
    },
    initials: {
      fontWeight: 900,
      fontSize: Math.round(size * 0.38),
      letterSpacing: '0.02em',
      color: ring,
      textShadow: `0 0 8px ${ring}88`,
      userSelect: 'none',
    },
  };
  return (
    <div
      className="qc-bot-avatar"
      style={{ ...styles.wrap, overflow: avatar.hoverNote ? 'visible' : styles.wrap.overflow }}
      aria-label={`Avatar of ${avatar.name || 'bot'}`}
      onMouseEnter={avatar.hoverNote ? () => setHovered(true) : undefined}
      onMouseLeave={avatar.hoverNote ? () => setHovered(false) : undefined}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: 6, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        {showImage ? (
          <img src={avatar.imageUrl} alt={avatar.name || 'bot avatar'} style={styles.img} onError={() => setImgFailed(true)} />
        ) : (
          <span style={styles.initials}>{avatar.initials || '?'}</span>
        )}
      </div>
      {avatar.hoverNote && hovered ? (
        <div
          className="qc-avatar-hover-note"
          style={{
            position: 'absolute',
            bottom: '115%',
            left: 0,
            whiteSpace: 'nowrap',
            background: theme.cardBackground,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            boxShadow: `0 8px 20px ${theme.shadow}`,
            padding: '7px 11px',
            fontSize: 12,
            color: theme.textSecondary,
            zIndex: 60,
          }}
        >
          {avatar.hoverNote.text}{' '}
          <a href={avatar.hoverNote.href} style={{ color: theme.primary, textDecoration: 'none', fontWeight: 700 }}>
            {avatar.hoverNote.linkText}
          </a>
        </div>
      ) : null}
    </div>
  );
}

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
      <StyledSvgImg
        srcSvgUrl={srcSvg}
        cssVarMap={capturedSideVars}
        idPrefix={`cap-${piece.id}-${t}`}
        size={CAP_ICON_PX}
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
  onRatingClick = null,
  playerBarColors = { background: '#000', text: '#fff' },
  clockText = '—:—',
  clockActive = false,
  clockLow = false,
  capturedPawns = [],
  capturedOthers = [],
  svgStyles = { white: {}, black: {} },
  barRef = null,
  showClock = true,
  avatar = null,
  tagline = null,
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
    taglineText: {
      fontStyle: 'italic',
      fontWeight: 500,
      fontSize: 'clamp(0.7rem, 1.6vw, 0.85rem)',
      opacity: 0.68,
      textTransform: 'none',
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minWidth: 0,
      lineHeight: 1.2,
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
      {avatar ? <BotAvatar avatar={avatar} /> : null}
      <div className={`qc-player-info qc-player-info--${side}`} style={styles.playerInfo}>
        <div className={`qc-player-name-row qc-player-name-row--${side}`} style={styles.playerNameRow}>
          <span className={`qc-player-name-text qc-player-name-text--${side}`}>{playerName}</span>
          {onRatingClick ? (
            <button
              type="button"
              className={`qc-player-rating-text qc-player-rating-text--${side} qc-player-rating-cta`}
              style={{
                ...styles.playerRatingText,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline dotted',
                textUnderlineOffset: 3,
              }}
              onClick={onRatingClick}
              title="Get a rating — create a free account"
              aria-label="Get a rating by creating a free account"
            >
              ({rating})
            </button>
          ) : (
            <span
              className={`qc-player-rating-text qc-player-rating-text--${side}`}
              style={styles.playerRatingText}
            >
              ({rating})
            </span>
          )}
        </div>
        <div className={`qc-player-rating-row qc-player-rating-row--${side}`} style={styles.playerRatingRow}>
          {showClock && (
            <span
              className={`qc-player-clock-text qc-player-clock-text--${side}`}
              style={styles.clockPill}
              aria-label={`${side} remaining time`}
            >
              {clockText}
            </span>
          )}
          {tagline ? (
            <span className={`qc-player-tagline qc-player-tagline--${side}`} style={styles.taglineText}>
              {tagline}
            </span>
          ) : null}
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
