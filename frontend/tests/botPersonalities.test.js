// Purpose: Pin the twelve free-bot identities, their deliberately different
// strategic hooks, the wide-funnel beam schedule, promotion-over-rook
// valuation, and mate priority shared by every personality.

import { describe, expect, it } from 'vitest';

import { DEFAULT_WEIGHTS, evaluatePosition, searchBestMove } from '../src/ai/alphaBetaEngine.js';
import { FREE_BOTS, getBotById } from '../src/ai/bots.js';
import { configuredBeamWidth } from '../src/ai/fast/fastSearch2.js';
import { generateLegalReplies } from '../src/chessboard/quantumEngine.js';

function piece(id, side, square, possibleTypes, extra = {}) {
  return {
    id,
    side,
    square,
    possibleTypes,
    baseTypes: possibleTypes,
    promoTypes: [],
    captured: false,
    moveCount: 2,
    ...extra,
  };
}

describe('free bot personalities', () => {
  it('gives all twelve free bots a unique, explicit strategic identity', () => {
    expect(FREE_BOTS).toHaveLength(12);
    expect(new Set(FREE_BOTS.map((bot) => bot.personality)).size).toBe(12);

    expect(getBotById('wolfgang-nimzowitsch').weights.knightIdentity).toBeGreaterThan(0);
    expect(getBotById('marie-lane').weights.enemyContact).toBeGreaterThan(0);
    expect(getBotById('enrico-capablanca').weights.friendlyContact).toBeGreaterThan(0);
    expect(getBotById('galileo-greco').weights.promoBank).toBeGreaterThan(DEFAULT_WEIGHTS.promoBank);
    expect(getBotById('rudolf-einstein').personality).toBe('complete-player');
  });

  it('honors Erwin Fischer\'s 176, 176, 2, 2 wide-funnel schedule', () => {
    const erwin = getBotById('erwin-fischer');
    expect(erwin.search.widths).toEqual([176, 176, 2, 2]);
    expect(erwin.search.adaptiveBeam).toBe(false);
    expect([0, 1, 2, 3, 4].map((ply) => configuredBeamWidth(erwin.search.widths, ply, 12)))
      .toEqual([176, 176, 2, 2, 2]);
  });
});

describe('promotion priority', () => {
  it('values a realized promotion at eight pawns', () => {
    expect(DEFAULT_WEIGHTS.promoBank).toBe(8);
  });

  it('prefers promoting a pawn-rook on a7 over collapsing it to capture a rook', () => {
    // With the former 5-point promotion package, a7-d7 scored 5.539 while
    // a7-a8 scored 5.331. This is the exact shape seen in the bot replay:
    // the rook branch grabbed material and threw away the pawn branch.
    const pieces = [
      piece('WM', 'white', 'a7', ['p', 'r']),
      piece('WK', 'white', 'a1', ['k']),
      piece('BK', 'black', 'c1', ['k']),
      piece('BR', 'black', 'd7', ['r']),
    ];
    const moves = generateLegalReplies(pieces, 'white', 0);
    const promote = moves.find((move) => move.from === 'a7' && move.to === 'a8');
    const takeRook = moves.find((move) => move.from === 'a7' && move.to === 'd7');

    expect(promote).toBeTruthy();
    expect(takeRook).toBeTruthy();
    expect(evaluatePosition(promote.resultPieces)).toBeGreaterThan(evaluatePosition(takeRook.resultPieces));
  });
});

describe('shared tactical floor', () => {
  it('makes every free personality take mate in one, even with extreme noise', () => {
    const pieces = [
      piece('WK', 'white', 'c1', ['k']),
      piece('WQ', 'white', 'd1', ['q']),
      piece('BK', 'black', 'a1', ['k']),
    ];

    for (const bot of FREE_BOTS) {
      const result = searchBestMove({
        pieces,
        sideToMove: 'white',
        openingVariety: false,
        adaptiveDepth: false,
        bot: {
          ...bot,
          tier: 'easy',
          search: { maxDepth: 1, widths: [176], timeMs: 1000, noise: 20 },
        },
      });
      expect(`${result.move.from}>${result.move.to}`, bot.id).toBe('d1>a4');
      expect(result.score, bot.id).toBeGreaterThanOrEqual(999);
    }
  });
});
