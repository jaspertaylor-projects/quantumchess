// Purpose: Pin the eighteen active-bot identities, their deliberately different
// strategic hooks, the wide-funnel beam schedule, promotion-over-rook
// valuation, and mate priority shared by every personality.

import { describe, expect, it } from 'vitest';

import { DEFAULT_WEIGHTS, evaluatePosition, searchBestMove } from '../src/ai/alphaBetaEngine.js';
import {
  ACTIVE_BOTS, FREE_BOTS, SUPPORTER_BOTS, PREMIUM_BOTS, SHELVED_BOTS, getBotById,
} from '../src/ai/bots.js';
import { configuredBeamWidth } from '../src/ai/fast/fastSearch2.js';
import { searchBestMoveV2 } from '../src/ai/fast/fastSearch2.js';
import {
  applyRootMovePolicy,
  isRecapture,
  rootPersonalityBias,
} from '../src/ai/botPersonality.js';
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

describe('active bot personalities', () => {
  it('gives all eighteen active bots a unique, explicit strategic identity', () => {
    expect(ACTIVE_BOTS).toHaveLength(18);
    expect(FREE_BOTS).toHaveLength(6);
    expect(SUPPORTER_BOTS).toHaveLength(6);
    expect(PREMIUM_BOTS).toHaveLength(6);
    expect(SHELVED_BOTS).toHaveLength(6);
    expect(new Set(ACTIVE_BOTS.map((bot) => bot.personality)).size).toBe(18);

    expect(getBotById('wolfgang-nimzowitsch').weights.knightIdentity).toBeGreaterThan(0);
    expect(getBotById('marie-lane').weights.enemyContact).toBeGreaterThan(0);
    expect(getBotById('enrico-capablanca').weights.friendlyContact).toBeGreaterThan(0);
    expect(getBotById('galileo-greco').weights.promoBank).toBeGreaterThan(DEFAULT_WEIGHTS.promoBank);
    expect(getBotById('rudolf-einstein').personality).toBe('complete-player');
    expect(getBotById('freeman-morphy').personality).toBe('early-castler');
    expect(getBotById('david-feynman').personality).toBe('counterpuncher');
  });

  it('honors Erwin Fischer\'s 176, 176, 2, 2 wide-funnel schedule', () => {
    const erwin = getBotById('erwin-fischer');
    expect(erwin.search.widths).toEqual([176, 176, 2, 2]);
    expect(erwin.search.adaptiveBeam).toBe(false);
    expect([0, 1, 2, 3, 4].map((ply) => configuredBeamWidth(erwin.search.widths, ply, 12)))
      .toEqual([176, 176, 2, 2, 2]);
  });
});

describe('root-move personality policies', () => {
  it('gives Freeman a meaningful early-castling preference that fades later', () => {
    const bot = getBotById('freeman-morphy');
    expect(rootPersonalityBias(bot, {
      isCastle: true,
      sideMoveCount: 4,
      hasCastled: false,
    })).toBeGreaterThan(2);
    expect(rootPersonalityBias(bot, {
      isCastle: true,
      sideMoveCount: 13,
      hasCastled: false,
    })).toBe(0);
    expect(rootPersonalityBias(bot, {
      isCastle: false,
      sideMoveCount: 4,
      hasCastled: false,
    })).toBe(0);
  });

  it('makes Freeman castle in both live bot engines when an early castle is sound', () => {
    const pieces = [
      piece('WK', 'white', 'e1', ['k', 'r'], { moveCount: 0 }),
      piece('WR', 'white', 'h1', ['k', 'r'], { moveCount: 0 }),
      piece('WP1', 'white', 'e2', ['p'], { moveCount: 0 }),
      piece('WP2', 'white', 'h2', ['p'], { moveCount: 0 }),
      piece('BK', 'black', 'e8', ['k', 'r'], { moveCount: 0 }),
      piece('BR', 'black', 'a8', ['k', 'r'], { moveCount: 0 }),
      piece('BP1', 'black', 'e7', ['p'], { moveCount: 0 }),
      piece('BP2', 'black', 'h7', ['p'], { moveCount: 0 }),
    ];
    const bot = {
      ...getBotById('freeman-morphy'),
      tier: 'easy',
      search: { maxDepth: 1, widths: [176], timeMs: 500, noise: 0 },
    };

    for (const engine of [searchBestMove, searchBestMoveV2]) {
      const result = engine({
        pieces,
        sideToMove: 'white',
        openingVariety: false,
        adaptiveDepth: false,
        bot,
      });
      expect(result.move?.type, engine.name).toBe('castle');
    }
  });

  it('lets David recapture but filters initiating captures when a quiet move exists', () => {
    const bot = getBotById('david-feynman');
    const entries = [
      { id: 'quiet', capture: false, to: 'a3' },
      { id: 'first-capture', capture: true, to: 'b4' },
      { id: 'recapture', capture: true, to: 'd5' },
    ];
    const lastMove = { to: 'd5', didCapture: true };
    const filtered = applyRootMovePolicy(entries, bot, (entry) => ({
      isCapture: entry.capture,
      isMate: false,
      to: entry.to,
      lastMove,
    }));

    expect(filtered.map((entry) => entry.id)).toEqual(['quiet', 'recapture']);
    expect(isRecapture({ isCapture: true, to: 'd5', lastMove })).toBe(true);
  });

  it('preserves mating captures and cannot return an empty move list', () => {
    const bot = getBotById('david-feynman');
    const mating = [{ id: 'mate', capture: true, isMate: true, to: 'h7' }];
    const forced = [{ id: 'forced', capture: true, isMate: false, to: 'a1' }];
    const facts = (entry) => ({
      isCapture: entry.capture,
      isMate: entry.isMate,
      to: entry.to,
      lastMove: null,
    });

    expect(applyRootMovePolicy(mating, bot, facts)).toEqual(mating);
    expect(applyRootMovePolicy(forced, bot, facts)).toEqual(forced);
  });

  it('keeps the strong-bot engine operational for ordinary and policy bots', () => {
    const pieces = [
      piece('WK', 'white', 'c1', ['k']),
      piece('WQ', 'white', 'd1', ['q']),
      piece('BK', 'black', 'a1', ['k']),
    ];

    for (const id of ['enrico-capablanca', 'freeman-morphy', 'david-feynman']) {
      const bot = getBotById(id);
      const result = searchBestMoveV2({
        pieces,
        sideToMove: 'white',
        openingVariety: false,
        bot: {
          ...bot,
          search: { maxDepth: 1, widths: [40], timeMs: 250, noise: 0 },
        },
      });
      expect(result.move, id).toBeTruthy();
      expect(`${result.move.from}>${result.move.to}`, id).toBe('d1>a4');
    }
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

    for (const bot of ACTIVE_BOTS) {
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
