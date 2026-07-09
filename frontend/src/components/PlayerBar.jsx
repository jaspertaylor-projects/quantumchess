// frontend/src/components/PlayerBar.jsx
// Purpose: Display a player's info bar with name/rating, an optional chess clock, and a captured pieces area; captures render inline (right third of the bar) or, via capturedPosition, as a fixed-height strip above/below the bar (mobile).
// Imports From: ../theme.js, ../chessboard/RasterizedSvgImg.jsx
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useState } from 'react';
import theme from '../theme.js';
import StyledSvgImg from '../chessboard/StyledSvgImg.jsx';

// Bot avatar: uses /bots/<id>.png when the file exists (drop images into
// frontend/public/bots/), rendered as a plain square. Falls back to a neon
// initials tile in the bot's hue when no image is present.
function BotAvatar({ avatar, size = BAR_CONTENT_H }) {
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

// Captured icons are size-aware: they render as large as the captured area
// allows and only shrink when a row genuinely needs the room. Icons overlap
// (each after the first shows CAP_VISIBLE of its width) so long rows keep
// big pieces instead of shrinking everyone.
const CAP_ICON_MIN = 12;
const CAP_ICON_MAX = 44;
const CAP_ICON_GAP = 4; // used only between the two rows
const CAP_VISIBLE = 0.72;

// Which glyph a captured piece renders as (lowest-value possible type).
const CAP_DISPLAY_ORDER = ['p', 'n', 'b', 'r', 'q'];
function capDisplayType(piece) {
  const types = Array.isArray(piece.possibleTypes) ? piece.possibleTypes : [];
  return CAP_DISPLAY_ORDER.find((x) => types.includes(x)) || 'p';
}

// Display order for the non-pawn row: group identical glyphs, highest value
// first (queens, rooks, bishops, knights) — capture order stays within a group.
const CAP_TYPE_RANK = { q: 0, r: 1, b: 2, n: 3, p: 4 };

// When captured pieces render outside the bar (mobile), they form one
// fixed-height strip so the board doesn't re-fit on every capture.
const STRIP_H = 26;
const STRIP_ICON_MAX = 24;

// The avatar sets the bar's visual rhythm: the two text lines and the
// captured-pieces stack are all boxed to this height and centered with it.
const BAR_CONTENT_H = 46;

function useMeasuredRect() {
  const ref = React.useRef(null);
  const [rect, setRect] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setRect((prev) =>
          Math.floor(cr.width) !== prev.width || Math.floor(cr.height) !== prev.height
            ? { width: Math.floor(cr.width), height: Math.floor(cr.height) }
            : prev
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, rect];
}

function CapturedIcon({ piece, svgStyles, sizePx = 22 }) {
  const t = capDisplayType(piece);

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
      width: `${sizePx}px`,
      height: `${sizePx}px`,
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
        size={sizePx}
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
  speech = null, // transient saying shown as a speech bubble (string|null)
  // Attention mode for narration (the first-visit intro): the bubble may
  // wrap to two lines, wears a gold accent, and flashes softly on arrival.
  speechFlash = false,
  // 'inline' keeps captures in the bar's right third; 'above'/'below' moves
  // them to a full-width strip outside the bar so the text can use the width.
  capturedPosition = 'inline',
}) {
  const capturedOutside = capturedPosition === 'above' || capturedPosition === 'below';
  // The captured area owns the right third of the bar; icon size adapts to
  // the space and the longest row so pieces only shrink when they must.
  // An empty row cedes its height to the other, and overlap means a row of
  // n icons only needs 1 + (n-1) * CAP_VISIBLE icon-widths.
  const [capRef, capRect] = useMeasuredRect();
  const othersSorted = useMemo(
    () => [...capturedOthers].sort(
      (a, b) => (CAP_TYPE_RANK[capDisplayType(a)] ?? 9) - (CAP_TYPE_RANK[capDisplayType(b)] ?? 9)
    ),
    [capturedOthers]
  );
  const maxRowCount = Math.max(capturedPawns.length, capturedOthers.length, 1);
  const rowsUsed = Math.max((capturedPawns.length ? 1 : 0) + (capturedOthers.length ? 1 : 0), 1);
  const effectiveUnits = 1 + (maxRowCount - 1) * CAP_VISIBLE;
  const widthFit = capRect.width > 0 ? Math.floor(capRect.width / effectiveUnits) : CAP_ICON_MAX;
  const heightFit = capRect.height > 0
    ? Math.floor((capRect.height - (rowsUsed - 1) * CAP_ICON_GAP) / rowsUsed)
    : CAP_ICON_MAX;
  const capIconPx = Math.max(CAP_ICON_MIN, Math.min(CAP_ICON_MAX, widthFit, heightFit));
  const capOverlapPx = Math.round(capIconPx * (1 - CAP_VISIBLE));

  // Outside strip: pawns then others in a single row, same overlap trick.
  const pawnUnits = capturedPawns.length ? 1 + (capturedPawns.length - 1) * CAP_VISIBLE : 0;
  const otherUnits = capturedOthers.length ? 1 + (capturedOthers.length - 1) * CAP_VISIBLE : 0;
  const stripGroupGap = pawnUnits && otherUnits ? 10 : 0;
  const stripUnits = Math.max(pawnUnits + otherUnits, 1);
  const stripFit = capRect.width > 0
    ? Math.floor((capRect.width - stripGroupGap) / stripUnits)
    : STRIP_ICON_MAX;
  const stripIconPx = Math.max(CAP_ICON_MIN, Math.min(STRIP_ICON_MAX, stripFit));
  const stripOverlapPx = Math.round(stripIconPx * (1 - CAP_VISIBLE));

  const styles = {
    playerBar: {
      width: '100%',
      minHeight: 'clamp(48px, 7.5vh, 72px)',
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      padding: '0 12px',
      boxSizing: 'border-box',
      position: 'relative',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      backgroundColor: playerBarColors.background,
      boxShadow: `0 4px 12px ${theme.shadow}`,
      color: playerBarColors.text,
      userSelect: 'none',
    },
    playerInfo: {
      display: 'flex',
      flexDirection: 'column',
      // Two lines spread across the avatar's height; a lone name centers.
      justifyContent: (showClock || tagline || speech) ? 'space-between' : 'center',
      alignItems: 'flex-start',
      alignSelf: 'center',
      height: BAR_CONTENT_H,
      flex: '1 1 auto',
      padding: '2px 6px',
      boxSizing: 'border-box',
      minWidth: 0,
    },
    playerNameRow: {
      display: 'flex',
      alignItems: 'baseline',
      gap: '8px',
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
      alignItems: 'center',
      fontWeight: 600,
      letterSpacing: '0.03em',
      fontSize: 'clamp(0.85rem, 2vw, 1.05rem)',
      color: 'currentColor',
      opacity: 0.92,
      lineHeight: 1,
      gap: 8,
      minWidth: 0,
      maxWidth: '100%',
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
      flex: '0 0 33%',
      width: '33%',
      maxWidth: '33%',
      alignSelf: 'center',
      height: BAR_CONTENT_H,
      maxHeight: BAR_CONTENT_H,
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
    capturedRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      width: '100%',
      height: `${capIconPx}px`,
      minHeight: `${capIconPx}px`,
      maxHeight: `${capIconPx}px`,
      boxSizing: 'border-box',
      overflow: 'hidden',
      flex: '0 0 auto',
    },
    capturedStrip: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      width: '100%',
      height: STRIP_H,
      minHeight: STRIP_H,
      maxHeight: STRIP_H,
      padding: '0 6px',
      boxSizing: 'border-box',
      overflow: 'hidden',
      opacity: 0.9,
    },
  };

  const barEl = (
    <div
      className={`qc-player-bar qc-player-bar--${side}`}
      style={styles.playerBar}
      data-side={side}
      ref={capturedOutside ? null : barRef}
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
          {speech ? (
            // A saying briefly takes over the tagline's spot as a bubble.
            // Keyed by text so a new line replays its entrance (and flash).
            <span
              key={typeof speech === 'string' ? speech : 'speech'}
              className={`qc-player-speech qc-player-speech--${side}`}
              role="status"
              style={{
                ...styles.taglineText,
                fontStyle: 'italic',
                opacity: 1,
                color: '#fff',
                background: 'rgba(20, 24, 32, 0.96)',
                border: speechFlash ? '1px solid rgba(255, 200, 80, 0.6)' : '1px solid rgba(126, 231, 135, 0.55)',
                borderRadius: 10,
                borderBottomLeftRadius: 3,
                padding: '2px 10px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                animation: speechFlash
                  ? 'qc-speech-pop 180ms ease-out, qc-speech-flash 2.2s ease-in-out 0.2s infinite'
                  : 'qc-speech-pop 180ms ease-out',
                ...(speechFlash ? { whiteSpace: 'normal', lineHeight: 1.25 } : {}),
              }}
            >
              💬 {speech}
            </span>
          ) : tagline ? (
            <span className={`qc-player-tagline qc-player-tagline--${side}`} style={styles.taglineText}>
              {tagline}
            </span>
          ) : null}
        </div>
      </div>
      {!capturedOutside ? (
        <div
          className={`qc-captured-area qc-captured-area--${side}`}
          style={styles.capturedArea}
          aria-label={`${side[0].toUpperCase()}${side.slice(1)} captured pieces area`}
          ref={capRef}
        >
          {capturedPawns.length > 0 ? (
            <div className="qc-captured-row qc-captured-row--pawns" style={styles.capturedRow}>
              {capturedPawns.map((p, i) => (
                <div key={`capicon-${p.id}`} style={{ marginLeft: i > 0 ? -capOverlapPx : 0, flex: '0 0 auto' }}>
                  <CapturedIcon piece={p} svgStyles={svgStyles} sizePx={capIconPx} />
                </div>
              ))}
            </div>
          ) : null}
          {othersSorted.length > 0 ? (
            <div className="qc-captured-row qc-captured-row--others" style={styles.capturedRow}>
              {othersSorted.map((p, i) => (
                <div key={`capicon-${p.id}`} style={{ marginLeft: i > 0 ? -capOverlapPx : 0, flex: '0 0 auto' }}>
                  <CapturedIcon piece={p} svgStyles={svgStyles} sizePx={capIconPx} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!capturedOutside) return barEl;

  const capturedStrip = (
    <div
      className={`qc-captured-strip qc-captured-strip--${side}`}
      style={styles.capturedStrip}
      aria-label={`${side[0].toUpperCase()}${side.slice(1)} captured pieces area`}
      ref={capRef}
    >
      {capturedPawns.map((p, i) => (
        <div key={`capicon-${p.id}`} style={{ marginLeft: i > 0 ? -stripOverlapPx : 0, flex: '0 0 auto' }}>
          <CapturedIcon piece={p} svgStyles={svgStyles} sizePx={stripIconPx} />
        </div>
      ))}
      {othersSorted.map((p, i) => (
        <div
          key={`capicon-${p.id}`}
          style={{
            marginLeft: i > 0 ? -stripOverlapPx : capturedPawns.length ? stripGroupGap : 0,
            flex: '0 0 auto',
          }}
        >
          <CapturedIcon piece={p} svgStyles={svgStyles} sizePx={stripIconPx} />
        </div>
      ))}
    </div>
  );

  // The strip keeps a fixed height even when empty so the board doesn't
  // re-fit on the first capture. barRef wraps strip + bar so the board
  // measurement accounts for both.
  return (
    <div
      className={`qc-player-bar-stack qc-player-bar-stack--${side}`}
      ref={barRef}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, boxSizing: 'border-box' }}
    >
      {capturedPosition === 'above' ? capturedStrip : null}
      {barEl}
      {capturedPosition === 'below' ? capturedStrip : null}
    </div>
  );
}
