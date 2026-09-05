// Purpose: Keep the dev Premium account's seeded history realistic and fully
// replayable through the same timeline used by saved games.

import { describe, expect, it } from 'vitest';
import engineFixtures from './fixtures/engine-games.json';
import minedGames from '../src/puzzle/minedGamesData.json';
import {
  buildDevSavedGames,
  DEV_PREMIUM_GAME_COUNT,
  DEV_PREMIUM_RATING,
  devMovesForGame,
} from '../src/dev/devSavedGames.js';
import { buildReviewTimeline } from '../src/review/replayCore.js';

describe('dev Premium saved games', () => {
  const games = buildDevSavedGames(engineFixtures, minedGames, Date.UTC(2026, 6, 23));

  it('provides fifteen varied, coherently-rated saved games', () => {
    expect(games).toHaveLength(15);
    expect(DEV_PREMIUM_GAME_COUNT).toBe(15);
    expect(new Set(games.map((game) => game.opponent)).size).toBe(15);
    expect(new Set(games.map((game) => game.result))).toEqual(new Set(['win', 'loss', 'draw']));
    expect(games[0].rating_after).toBe(DEV_PREMIUM_RATING);

    const chronological = [...games].reverse();
    for (let index = 1; index < chronological.length; index += 1) {
      expect(chronological[index].rating_before).toBe(chronological[index - 1].rating_after);
    }
  });

  it('uses full stored-move payloads for every seeded game', () => {
    for (const game of games) {
      const moves = devMovesForGame(game);
      expect(moves.length, game.id).toBeGreaterThan(40);
      expect(moves.every((move) => (
        typeof move.from === 'string'
        && typeof move.to === 'string'
        && (move.side === 'white' || move.side === 'black')
      )), game.id).toBe(true);
    }
  });

  it('rebuilds both additional checkmate games through Replay and Review', () => {
    // The first thirteen payloads are the engine replay fixture suite itself
    // (covered exhaustively by engineReplay.test.js). These final two are the
    // additional full games selected from the mined match archive.
    for (const game of games.slice(0, 2)) {
      const moves = devMovesForGame(game);
      const timeline = buildReviewTimeline(moves);
      expect(timeline.incomplete, game.id).toBe(false);
      expect(timeline.entries.length, game.id).toBeGreaterThan(40);
    }
  }, 10_000);
});
