import { describe, expect, it } from 'vitest';
import {
  committedMoveIsCapture,
  positionAddedCapture,
  playMoveSound,
} from '../src/audio/moveSounds.js';

describe('move sound selection', () => {
  it('uses the rustle for an ordinary move or castle', () => {
    expect(committedMoveIsCapture({ records: [{ from: 'e2', to: 'e4', capture: false }] })).toBe(false);
    expect(committedMoveIsCapture({ records: [
      { from: 'e1', to: 'g1', castle: true },
      { from: 'h1', to: 'f1', castle: true },
    ] })).toBe(false);
  });

  it('uses the forceful variant when any committed record captured', () => {
    expect(committedMoveIsCapture({ records: [{ from: 'e4', to: 'd5', capture: true }] })).toBe(true);
  });

  it('does no audio work while disabled', () => {
    expect(playMoveSound({ capture: true, enabled: false })).toBe(false);
  });

  it('detects a newly captured piece between puzzle positions', () => {
    const before = [{ id: 'a', captured: false }, { id: 'b', captured: false }];
    expect(positionAddedCapture(before, [{ id: 'a', captured: false }, { id: 'b', captured: true }])).toBe(true);
    expect(positionAddedCapture(before, before)).toBe(false);
  });
});
