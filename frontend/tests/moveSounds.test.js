import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetMoveAudioForTests,
  committedMoveIsCapture,
  positionAddedCapture,
  playMoveSound,
  primeMoveAudio,
} from '../src/audio/moveSounds.js';

const fakeParam = () => ({
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

function installFakeAudioContext(initialState = 'running') {
  const instances = [];
  class FakeAudioContext {
    constructor() {
      this.state = initialState;
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = {};
      this.starts = 0;
      this.resume = vi.fn(async () => { this.state = 'running'; });
      instances.push(this);
    }

    createBuffer(_channels, frames) {
      const data = new Float32Array(frames);
      return { getChannelData: () => data };
    }

    createGain() {
      return { gain: fakeParam(), connect: vi.fn() };
    }

    createBiquadFilter() {
      return { type: '', frequency: fakeParam(), Q: fakeParam(), connect: vi.fn() };
    }

    createBufferSource() {
      return {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(() => { this.starts += 1; }),
        stop: vi.fn(),
      };
    }

    createOscillator() {
      return {
        type: '',
        frequency: fakeParam(),
        connect: vi.fn(),
        start: vi.fn(() => { this.starts += 1; }),
        stop: vi.fn(),
      };
    }
  }
  globalThis.window = { AudioContext: FakeAudioContext };
  return instances;
}

afterEach(() => {
  __resetMoveAudioForTests();
  delete globalThis.window;
});

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

  it('resumes an interrupted mobile audio context before scheduling sound', async () => {
    const instances = installFakeAudioContext('interrupted');
    expect(playMoveSound()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(instances).toHaveLength(1);
    expect(instances[0].resume).toHaveBeenCalledOnce();
    expect(instances[0].starts).toBeGreaterThan(0);
  });

  it('recreates a context that the browser permanently closed', () => {
    const instances = installFakeAudioContext('running');
    expect(playMoveSound()).toBe(true);
    instances[0].state = 'closed';
    expect(playMoveSound({ capture: true })).toBe(true);
    expect(instances).toHaveLength(2);
    expect(instances[1].starts).toBeGreaterThan(0);
  });

  it('re-primes an interrupted context on a later user gesture', async () => {
    const instances = installFakeAudioContext('interrupted');
    primeMoveAudio();
    await Promise.resolve();
    expect(instances[0].resume).toHaveBeenCalledOnce();
    expect(instances[0].state).toBe('running');
  });
});
