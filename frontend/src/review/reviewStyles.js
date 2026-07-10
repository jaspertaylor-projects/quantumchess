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
  title: { margin: 0, fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 },
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
    fontSize: 11.5, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: '#7ee787', textShadow: '0 0 12px rgba(126,231,135,0.45)', marginBottom: 5,
  },
  hintBox: {
    border: '1px solid rgba(126,231,135,0.5)', borderRadius: 8, padding: '8px 10px',
    background: 'rgba(126,231,135,0.08)', fontSize: 12.5, lineHeight: 1.5,
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
  // Two move columns: number | white's move | black's move.
  moveList: {
    display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'center',
    alignContent: 'start', columnGap: 6, rowGap: 3, overflowY: 'auto', overflowX: 'hidden',
    flex: '1 1 0', minHeight: 160, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 6,
  },
  moveNo: { color: theme.textSecondary, fontSize: 12, minWidth: 22, textAlign: 'right' },
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
    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6,
    cursor: 'pointer', fontSize: 12.5, minWidth: 0,
    background: active ? 'rgba(79,195,247,0.15)' : 'transparent',
    border: `1px solid ${active ? 'rgba(79,195,247,0.5)' : 'transparent'}`,
  }),
  mark: (m) => ({
    fontWeight: 900, minWidth: 18, textAlign: 'center',
    color: m === '??' ? '#ff7b72' : m === '?' ? '#f6c445' : 'transparent',
  }),
};

export default reviewStyles;
