// frontend/src/settings/useMeasurementColors.js
// Purpose: Color helpers left over from the removed "Targeting Colors"
// setting. Insignia/dot/ring inks now derive from each side's piece border
// (band stroke) color — see QuantumPiece.jsx and App.jsx measuredMarks — so
// the hook, storage, and defaults are gone. hexToRgbString stays (used for
// translucent overlays); DEFAULT_MEASUREMENT_COLORS remains only for the
// unmounted QuantumStatusPanel.
// Imports From: None
// Exported To: ../App.jsx, ../chessboard/Board.jsx, ../tray/QuantumStatusPanel.jsx

export const DEFAULT_MEASUREMENT_COLORS = {
  white: '#111827',
  black: '#f2f2f2',
};

export function hexToRgbString(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '186, 85, 211';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
