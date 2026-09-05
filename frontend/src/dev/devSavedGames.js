// Purpose: A realistic, development-only saved-game history for the Premium
// account preview. The move payloads come from games played through the real
// rules engine, so Replay and Premium Review exercise the production timeline
// instead of rendering decorative rows.
// Imports From: ../ai/bots.js
// Exported To: ../account/AccountModal.jsx, ../hooks/useMonetization.js,
//   ./useDevAccountPreview.js, ../../tests/devSavedGames.test.js

import { getBotById } from '../ai/bots.js';

const STARTING_RATING = 1392;
const K_FACTOR = 32;

// Oldest to newest. Opponents span the ladder so the profile feels like an
// account that has actually been exploring the Premium roster.
const GAME_PLAN = Object.freeze([
  { opponent: 'isaac-steinitz', userSide: 'white', result: 'win' },
  { opponent: 'emmy-menchik', userSide: 'black', result: 'win' },
  { opponent: 'galileo-greco', userSide: 'white', result: 'draw' },
  { opponent: 'wolfgang-nimzowitsch', userSide: 'black', result: 'loss' },
  { opponent: 'boris-bohr', userSide: 'white', result: 'win' },
  { opponent: 'marie-lane', userSide: 'black', result: 'loss' },
  { opponent: 'enrico-capablanca', userSide: 'white', result: 'draw' },
  { opponent: 'freeman-morphy', userSide: 'black', result: 'win' },
  { opponent: 'erwin-fischer', userSide: 'white', result: 'loss' },
  { opponent: 'david-feynman', userSide: 'black', result: 'draw' },
  { opponent: 'edith-franklin', userSide: 'white', result: 'win' },
  { opponent: 'werner-lasker', userSide: 'black', result: 'loss' },
  { opponent: 'savielly-dirac', userSide: 'white', result: 'draw' },
  { opponent: 'nikola-tal', userSide: 'black', result: 'loss' },
  { opponent: 'stephen-reti', userSide: 'white', result: 'win' },
]);

function eloUpdate(playerRating, opponentRating, result) {
  const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(playerRating + K_FACTOR * (score - expected));
}

function fixtureSources(engineFixtures, minedGames) {
  const fixtures = Array.isArray(engineFixtures) ? engineFixtures : [];
  const mined = Array.isArray(minedGames?.games) ? minedGames.games : [];
  // These two mined games replay cleanly through the current engine and end
  // in actual checkmates; the thirteen engine fixtures cover long games,
  // castling, and en passant.
  const extra = [mined[5], mined[12]].filter(Boolean);
  return [
    ...fixtures.slice(0, 13).map((fixture) => ({ moves: fixture.moves })),
    ...extra.map((game) => ({ moves: game.moves })),
  ];
}

export function buildDevSavedGames(engineFixtures, minedGames, now = Date.now()) {
  const sources = fixtureSources(engineFixtures, minedGames);
  if (sources.length < GAME_PLAN.length) return [];

  let rating = STARTING_RATING;
  const chronological = GAME_PLAN.map((plan, index) => {
    const bot = getBotById(plan.opponent);
    const opponentRating = bot?.rating || 1200;
    const ratingBefore = rating;
    rating = eloUpdate(ratingBefore, opponentRating, plan.result);
    return {
      id: `dev-premium-game-${String(index + 1).padStart(2, '0')}`,
      opponent: plan.opponent,
      opponent_rating: opponentRating,
      user_side: plan.userSide,
      result: plan.result,
      rating_before: ratingBefore,
      rating_after: rating,
      created_at: new Date(now - (GAME_PLAN.length - 1 - index) * 24 * 60 * 60 * 1000).toISOString(),
      moves: sources[index].moves,
      isDevPreviewGame: true,
    };
  });

  return chronological.reverse();
}

export const DEV_PREMIUM_GAME_COUNT = GAME_PLAN.length;

// Kept independent of the dynamically-loaded move files so the dev account
// switcher can show the matching summary immediately.
export const DEV_PREMIUM_RATING = GAME_PLAN.reduce((rating, plan) => {
  const opponentRating = getBotById(plan.opponent)?.rating || 1200;
  return eloUpdate(rating, opponentRating, plan.result);
}, STARTING_RATING);

let cachedGames = null;

export async function loadDevSavedGames() {
  if (!import.meta.env.DEV) return [];
  if (cachedGames) return cachedGames;
  const [{ default: engineFixtures }, { default: minedGames }] = await Promise.all([
    import('../../tests/fixtures/engine-games.json'),
    import('../puzzle/minedGamesData.json'),
  ]);
  cachedGames = buildDevSavedGames(engineFixtures, minedGames);
  return cachedGames;
}

export function devMovesForGame(game) {
  return game?.isDevPreviewGame && Array.isArray(game.moves) ? game.moves : null;
}
