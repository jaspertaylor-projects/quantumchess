// Purpose: Keep the previous-move trail identical anywhere a chess position
// is rendered. Full boards use `square`; tutorial/puzzle MiniBoards use `sq`.

export const LAST_MOVE_FROM_COLOR = 'rgba(79, 195, 247, 0.55)';
export const LAST_MOVE_TO_COLOR = 'rgba(246, 196, 69, 0.55)';

function hasMoveTrail(move) {
  return Boolean(move && typeof move.from === 'string' && typeof move.to === 'string');
}

export function lastMoveHighlights(move) {
  if (!hasMoveTrail(move)) return [];
  return [
    { square: move.from, color: LAST_MOVE_FROM_COLOR },
    { square: move.to, color: LAST_MOVE_TO_COLOR },
  ];
}

export function miniBoardLastMoveHighlights(move) {
  return lastMoveHighlights(move).map(({ square, color }) => ({ sq: square, color }));
}
