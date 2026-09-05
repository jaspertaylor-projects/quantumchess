import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPLAY_MOVES_PER_SECOND,
  REPLAY_SPEED_OPTIONS,
  replayIntervalMs,
} from '../src/review/replaySpeed.js';

describe('replay speed', () => {
  it('offers every whole-number speed from one through four moves per second', () => {
    expect(REPLAY_SPEED_OPTIONS).toEqual([1, 2, 3, 4]);
    expect(DEFAULT_REPLAY_MOVES_PER_SECOND).toBe(2);
  });

  it('converts the selected speed to the correct delay', () => {
    expect(replayIntervalMs(1)).toBe(1000);
    expect(replayIntervalMs(2)).toBe(500);
    expect(replayIntervalMs(4)).toBe(250);
  });

  it('falls back safely when a speed is invalid', () => {
    expect(replayIntervalMs(0)).toBe(500);
    expect(replayIntervalMs('fast')).toBe(500);
  });
});
