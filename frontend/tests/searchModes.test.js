// Purpose: Pin the opt-in until-timeout bot mode and the hard-bot random
// opening safety rule without changing the legacy capped bot behavior.

import { describe, expect, it } from 'vitest';

import {
  analyzeRootMoves,
  BOT_TIME_MODES,
  isHardRandomOpeningMoveSafe,
  isPawnCaptureTarget,
  searchBestMove,
} from '../src/ai/alphaBetaEngine.js';
import { searchBestMoveFast } from '../src/ai/fast/fastSearch.js';
import { createStartingPieces } from '../src/chessboard/gameConstants.js';
import { buildReviewTimeline } from '../src/review/replayCore.js';

function piece(id, side, square, possibleTypes) {
  return { id, side, square, possibleTypes, baseTypes: possibleTypes, promoTypes: [], captured: false };
}

describe('hard random-opening safety', () => {
  it('recognizes attacks from opposing pawn-capable pieces', () => {
    const pieces = [
      piece('mover', 'white', 'd4', ['n']),
      piece('attacker', 'black', 'c5', ['p', 'q']),
    ];
    expect(isPawnCaptureTarget(pieces, 'd4', 'black')).toBe(true);
    expect(isPawnCaptureTarget(pieces, 'b4', 'black')).toBe(true);
    expect(isPawnCaptureTarget(pieces, 'e4', 'black')).toBe(false);
    expect(isPawnCaptureTarget(pieces, 'c4', 'black')).toBe(false);
  });

  it('rejects a pawnless landing but permits a pawn-capable landing', () => {
    const pawnless = [
      piece('mover', 'white', 'd4', ['n']),
      piece('attacker', 'black', 'c5', ['p', 'q']),
    ];
    const pawnCapable = [
      piece('mover', 'white', 'd4', ['p', 'n']),
      piece('attacker', 'black', 'c5', ['p', 'q']),
    ];
    expect(isHardRandomOpeningMoveSafe([], 'white', { type: 'move', to: 'd4', resultPieces: pawnless })).toBe(false);
    expect(isHardRandomOpeningMoveSafe([], 'white', { type: 'move', to: 'd4', resultPieces: pawnCapable })).toBe(true);
  });

  it('filters unsafe random candidates identically in both engines', () => {
    const { snapshots } = buildReviewTimeline([
      { from: 'a2', to: 'a3', side: 'white', enPassant: false },
      { from: 'c7', to: 'c5', side: 'black', enPassant: false },
    ]);
    const pos = snapshots[2]; // White's second move; c5 pawnness attacks b4/d4.
    const originalRandom = Math.random;
    try {
      for (let i = 0; i < 20; i++) {
        const random = () => i / 20;
        const opts = {
          pieces: pos.pieces,
          sideToMove: 'white',
          lastMove: pos.lastMove,
          bot: { tier: 'hard', search: { maxDepth: 1, widths: [2], timeMs: 100, noise: 0 } },
        };
        Math.random = random;
        const ref = searchBestMove(opts);
        Math.random = random;
        const fast = searchBestMoveFast(opts);
        expect(`${fast.move.from}>${fast.move.to}`).toBe(`${ref.move.from}>${ref.move.to}`);
        expect(isHardRandomOpeningMoveSafe(pos.pieces, 'white', ref.move)).toBe(true);
      }
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('review root beam', () => {
  it('adds the played continuation without removing the normal beam prefix', () => {
    const pieces = createStartingPieces();
    const analysis = analyzeRootMoves({
      pieces,
      sideToMove: 'white',
      depth: 1,
      widths: [1],
      timeMs: Infinity,
    });
    const played = analysis.moves[analysis.moves.length - 1].move;
    const preferredMove = {
      from: played.from,
      to: played.to,
      enPassant: played.type === 'enpassant' || Boolean(played.enPassant),
      castle: played.type === 'castle',
    };
    const opts = {
      pieces,
      sideToMove: 'white',
      openingVariety: false,
      adaptiveDepth: false,
      bot: { search: { maxDepth: 2, widths: [1, 1], timeMs: 10000, noise: 0 } },
    };
    const baselineRef = searchBestMove(opts);
    const baselineFast = searchBestMoveFast(opts);
    const preferredRef = searchBestMove({ ...opts, preferredMove });
    const preferredFast = searchBestMoveFast({ ...opts, preferredMove });

    expect(preferredRef.nodes).toBeGreaterThan(baselineRef.nodes);
    expect(preferredFast.nodes).toBeGreaterThan(baselineFast.nodes);
    expect(preferredFast.nodes).toBe(preferredRef.nodes);
    expect(preferredFast.score).toBe(preferredRef.score);
  });
});

describe('bot time modes', () => {
  it('keeps capped as the default and accepts until-timeout in both engines', () => {
    const pieces = createStartingPieces();
    const capped = {
      pieces,
      sideToMove: 'white',
      openingVariety: false,
      adaptiveDepth: false,
      bot: { tier: 'hard', search: { maxDepth: 1, widths: [2, 1], timeMs: 100, noise: 0 } },
    };
    expect(searchBestMove(capped).depth).toBe(1);
    expect(searchBestMoveFast(capped).depth).toBe(1);

    const fill = {
      ...capped,
      bot: { ...capped.bot, search: { ...capped.bot.search, timeMs: 250, timeMode: BOT_TIME_MODES.UNTIL_TIMEOUT } },
    };
    const refDepths = [];
    const fastDepths = [];
    const refStarted = performance.now();
    const ref = searchBestMove({ ...fill, onDepthComplete: (result) => refDepths.push(result.depth) });
    const refElapsed = performance.now() - refStarted;
    const fastStarted = performance.now();
    const fast = searchBestMoveFast({ ...fill, onDepthComplete: (result) => fastDepths.push(result.depth) });
    const fastElapsed = performance.now() - fastStarted;
    expect(ref.depth).toBeGreaterThan(1);
    expect(fast.depth).toBeGreaterThan(1);
    expect(refElapsed).toBeGreaterThanOrEqual(240);
    expect(fastElapsed).toBeGreaterThanOrEqual(240);
    expect(refDepths).toEqual(Array.from({ length: ref.depth }, (_, i) => i + 1));
    expect(fastDepths).toEqual(Array.from({ length: fast.depth }, (_, i) => i + 1));
  }, 3000);
});
