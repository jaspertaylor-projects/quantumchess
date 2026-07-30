// frontend/src/review/replaySpeed.js
// Purpose: User-facing replay speed options and timing.
// Exported To: ./ReviewModal.jsx, ../../tests/replaySpeed.test.js

export const REPLAY_SPEED_OPTIONS = Object.freeze([1, 2, 3, 4]);
export const DEFAULT_REPLAY_MOVES_PER_SECOND = 2;

export function replayIntervalMs(movesPerSecond) {
  const requested = Number(movesPerSecond);
  const speed = REPLAY_SPEED_OPTIONS.includes(requested)
    ? requested
    : DEFAULT_REPLAY_MOVES_PER_SECOND;
  return 1000 / speed;
}
