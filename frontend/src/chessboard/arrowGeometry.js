// frontend/src/chessboard/arrowGeometry.js
// Purpose: Shaft + arrowhead geometry for board arrows, with the short-arrow
// guard: adjacent squares leave less room than the default insets assume, so
// the start inset (and if needed the head) shrinks rather than letting the
// shaft run backwards. Shared by the live board's check rays and hint arrows
// and the tutorial MiniBoard.
// Imports From: None
// Exported To: ./Board.jsx, ../tutorial/MiniBoard.jsx

// `from`/`to` are square-center points ({ x, y }); insets are fractions of
// the cell size. Returns the shaft endpoints and the head polygon's points.
export function arrowGeometry(from, to, cell, {
  tipInset = 0.46,
  startInset = 0.5,
  headLen = 0.2,
  headHalf = 0.11,
  minStartInset = 0.1,
  minHeadLen = 0.12,
  headGap = 0.06,
} = {}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const tip = cell * tipInset;
  let start = cell * startInset;
  let head = cell * headLen;
  const half = cell * headHalf;
  if (len - tip - start < head) {
    start = Math.max(cell * minStartInset, len - tip - head - cell * headGap);
    head = Math.min(head, Math.max(cell * minHeadLen, len - tip - start));
  }
  const tipX = to.x - ux * tip;
  const tipY = to.y - uy * tip;
  const baseX = tipX - ux * head;
  const baseY = tipY - uy * head;
  const x1 = from.x + ux * start;
  const y1 = from.y + uy * start;
  const px = -uy;
  const py = ux;
  return {
    x1,
    y1,
    baseX,
    baseY,
    headPoints: `${tipX},${tipY} ${baseX + px * half},${baseY + py * half} ${baseX - px * half},${baseY - py * half}`,
  };
}
