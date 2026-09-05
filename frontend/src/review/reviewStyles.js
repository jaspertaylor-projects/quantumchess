// frontend/src/review/reviewStyles.js
// Purpose: The review modal's inline style bundle. Extracted from
// ReviewModal.jsx.
// Imports From: ../theme.js
// Exported To: ./ReviewModal.jsx

import theme from '../theme.js';

const reviewStyles = {
  panel: {
    width: 'min(96vw, 1040px)', maxHeight: '92vh', overflowY: 'auto',
    borderRadius: 12, border: `1px solid ${theme.border}`, backgroundColor: theme.cardBackground,
    boxShadow: `0 12px 32px ${theme.shadow}`, color: theme.textPrimary, padding: 16,
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: {
    margin: 0, fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.04em',
    display: 'flex', alignItems: 'center', gap: 8, color: theme.textPrimary,
  },
  sub: { fontSize: 12, color: theme.textSecondary },
  // Two firm columns: board+bars left, hints/moves/graph right.
  content: { display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 400px)', gap: 14, alignItems: 'stretch' },
  boardCol: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  // The right column spans exactly the eval bar's extent: both start at
  // the top player bar and finish at the bottom player bar's baseline.
  sideCol: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, minHeight: 0 },
  // Vertical eval bar: hugs the board's left edge, spanning board + both
  // player bars. White's share fills from the bottom, like a thermometer.
  evalBarVertical: {
    width: 28, borderRadius: 8, overflow: 'hidden', border: `1px solid ${theme.border}`,
    background: '#20242c', position: 'relative', alignSelf: 'stretch', flexShrink: 0,
  },
  evalBarNumber: (whiteHigh) => ({
    position: 'absolute', top: 5, left: 0, right: 0, textAlign: 'center',
    fontSize: 9.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
    color: whiteHigh ? '#15181d' : '#e8e6e1', pointerEvents: 'none',
  }),
  hintHead: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 13, fontWeight: 900, letterSpacing: '0.11em', textTransform: 'uppercase',
    color: '#a6f3b3', marginBottom: 7,
  },
  hintBox: {
    border: '1px solid rgba(126,231,135,0.58)', borderRadius: 10, padding: 9,
    color: '#f1fff4', background: 'rgba(11,31,27,0.94)', fontSize: 13.5, lineHeight: 1.45,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 7px 20px rgba(0,0,0,0.16)',
  },
  // Move navigation: a pill group sitting directly under the move list.
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    alignSelf: 'stretch', padding: '5px 8px', borderRadius: 12,
    border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.04)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  navCounter: {
    fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
    color: theme.textSecondary, letterSpacing: '0.04em',
    padding: '0 10px', marginRight: 'auto', whiteSpace: 'nowrap',
  },
  replayActions: {
    position: 'relative', zIndex: 4,
  },
  replayActionsTrigger: (open) => ({
    width: '100%', minHeight: 42, display: 'flex', alignItems: 'center', gap: 9,
    padding: '7px 10px', borderRadius: 11, cursor: 'pointer',
    color: theme.textPrimary, fontSize: 12, fontWeight: 900, letterSpacing: '0.02em',
    border: `1px solid ${open ? 'rgba(79,195,247,0.72)' : 'rgba(79,195,247,0.34)'}`,
    background: open
      ? 'linear-gradient(135deg, rgba(79,195,247,0.22), rgba(199,146,234,0.14))'
      : 'rgba(255,255,255,0.045)',
    boxShadow: open
      ? '0 0 20px rgba(79,195,247,0.14), inset 0 1px 0 rgba(255,255,255,0.08)'
      : 'inset 0 1px 0 rgba(255,255,255,0.05)',
  }),
  replayMenu: {
    position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 8px)', zIndex: 20,
    padding: 10, borderRadius: 14, color: theme.textPrimary,
    border: '1px solid rgba(79,195,247,0.5)',
    background: 'rgba(10,14,24,0.985)',
    boxShadow: '0 18px 46px rgba(0,0,0,0.58), 0 0 30px rgba(79,195,247,0.1)',
  },
  replayMenuHeading: {
    display: 'grid', gap: 2, margin: '1px 2px 9px', fontSize: 12,
    color: theme.textSecondary, lineHeight: 1.35,
  },
  replayTools: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    alignItems: 'stretch', gap: 8, padding: 8, borderRadius: 13,
    border: '1px solid rgba(79,195,247,0.24)',
    background: 'linear-gradient(135deg, rgba(79,195,247,0.08), rgba(199,146,234,0.06))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 22px rgba(0,0,0,0.14)',
  },
  replayToolButton: (active, kind) => ({
    minHeight: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 900,
    letterSpacing: '0.015em',
    color: active ? '#07131c' : theme.textPrimary,
    background: active
      ? 'linear-gradient(135deg, #8ee7ff, #4fc3f7)'
      : kind === 'video'
        ? 'linear-gradient(135deg, rgba(199,146,234,0.2), rgba(79,195,247,0.1))'
        : kind === 'share'
          ? 'linear-gradient(135deg, rgba(126,231,135,0.16), rgba(79,195,247,0.08))'
        : 'linear-gradient(135deg, rgba(79,195,247,0.22), rgba(79,195,247,0.1))',
    border: `1px solid ${active
      ? '#8ee7ff'
      : kind === 'video'
        ? 'rgba(199,146,234,0.58)'
        : kind === 'share'
          ? 'rgba(126,231,135,0.48)'
        : 'rgba(79,195,247,0.58)'}`,
    boxShadow: active
      ? '0 0 18px rgba(79,195,247,0.28), inset 0 1px 0 rgba(255,255,255,0.35)'
      : 'inset 0 1px 0 rgba(255,255,255,0.08)',
    transition: 'border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease',
  }),
  replayToolIcon: {
    width: 25, height: 25, borderRadius: 8, display: 'grid', placeItems: 'center',
    background: 'rgba(0,0,0,0.18)', flexShrink: 0,
  },
  replaySpeedControl: {
    gridColumn: '1 / -1',
    minHeight: 42, display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px 5px 10px',
    borderRadius: 10, color: '#8ee7ff', background: 'rgba(6,12,22,0.62)',
    border: '1px solid rgba(79,195,247,0.34)',
  },
  replaySpeedLabel: {
    fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: theme.textSecondary,
  },
  replaySpeedSelect: {
    minWidth: 0, flex: 1, height: 30, padding: '0 26px 0 9px', borderRadius: 7,
    color: '#f4fbff', background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
    fontSize: 11.5, fontWeight: 800,
  },
  videoProgressTrack: {
    gridColumn: '1 / -1', height: 5, minWidth: 90, overflow: 'hidden', borderRadius: 999,
    background: 'rgba(255,255,255,0.09)', border: `1px solid ${theme.border}`,
  },
  videoProgressFill: (progress) => ({
    display: 'block', width: `${Math.max(0, Math.min(100, progress || 0))}%`, height: '100%',
    borderRadius: 'inherit', background: theme.primary, transition: 'width 120ms linear',
  }),
  videoStatus: (error) => ({
    gridColumn: '1 / -1', color: error ? '#ff8f8f' : theme.textSecondary, fontSize: 11.5,
  }),
  // Two move columns: number | white's move | black's move.
  moveList: {
    display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'center',
    alignContent: 'start', columnGap: 7, rowGap: 4, overflowY: 'auto', overflowX: 'hidden',
    flex: '1 1 0', minHeight: 160, border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 9, padding: 7, background: 'rgba(5,8,15,0.44)',
  },
  moveNo: { color: '#c8d2ec', fontSize: 12.5, fontWeight: 800, minWidth: 24, textAlign: 'right' },
  variationStrip: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5,
    border: '1px dashed rgba(79,195,247,0.55)', borderRadius: 8, padding: '6px 8px',
    background: 'rgba(79,195,247,0.07)',
  },
  variationLabel: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'rgba(79,195,247,0.95)', marginRight: 2,
  },
  variationChip: (active) => ({
    fontSize: 12, fontVariantNumeric: 'tabular-nums', padding: '2px 7px', borderRadius: 6,
    cursor: 'pointer', color: theme.textPrimary,
    background: active ? 'rgba(79,195,247,0.25)' : 'rgba(255,255,255,0.06)',
    border: `1px solid ${active ? 'rgba(79,195,247,0.7)' : 'rgba(255,255,255,0.18)'}`,
  }),
  // Icon-only "back to game", in its own slot at the strip's right edge so
  // the variation chips never crowd it.
  variationExit: {
    marginLeft: 'auto', flexShrink: 0, paddingLeft: 8,
    borderLeft: '1px dashed rgba(79,195,247,0.35)',
    display: 'flex', alignItems: 'center',
  },
  moveCell: (active) => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7,
    cursor: 'pointer', fontSize: 13, minWidth: 0,
    background: active ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.018)',
    border: `1px solid ${active ? 'rgba(112,220,255,0.72)' : 'transparent'}`,
    boxShadow: active ? 'inset 3px 0 0 #61dafb, 0 0 12px rgba(79,195,247,0.12)' : 'none',
  }),
  mark: (m) => ({
    fontWeight: 900, minWidth: 18, textAlign: 'center',
    color: m === '??' ? '#ff7b72' : m === '?' ? '#f6c445' : 'transparent',
  }),
};

export default reviewStyles;
