import { describe, expect, it, vi } from 'vitest';
import {
  REPLAY_PLY_INTERVAL_MS,
  replayVideoFilename,
  selectReplayVideoFormat,
} from '../src/review/socialReplayVideo.js';

describe('social replay video', () => {
  it('plays exactly two plies per second', () => {
    expect(REPLAY_PLY_INTERVAL_MS).toBe(500);
  });

  it('prefers a supported high-quality WebM format', () => {
    const recorder = { isTypeSupported: vi.fn((mime) => mime.includes('vp8')) };
    expect(selectReplayVideoFormat(recorder)).toEqual({
      mimeType: 'video/webm;codecs=vp8',
      extension: 'webm',
    });
  });

  it('prefers social-friendly MP4 when the browser can record it', () => {
    const recorder = { isTypeSupported: vi.fn(() => true) };
    expect(selectReplayVideoFormat(recorder)).toEqual({
      mimeType: 'video/mp4;codecs=avc1.42E01E',
      extension: 'mp4',
    });
  });

  it('creates a safe, recognizable download name', () => {
    expect(replayVideoFilename({ opponent: 'Ernest Smyslov!' }, 'mp4'))
      .toBe('quantum-chess-vs-ernest-smyslov.mp4');
  });
});
