// frontend/src/account/gameSync.js
// Purpose: Persist finished games for signed-in players and apply Elo
// rating updates for games against rated bots. Retention (last 10 free /
// 1000 paid) is enforced server-side by a Postgres trigger.
// Imports From: ./supabaseClient.js
// Exported To: ../App.jsx

import { supabase } from './supabaseClient.js';

const K_FACTOR = 32;

export function eloUpdate(playerRating, opponentRating, score) {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(playerRating + K_FACTOR * (score - expected));
}

// Records a finished game. Rating only moves for games against rated bots;
// local hotseat and (for now) online games save unrated.
export async function recordFinishedGame({ user, profile, opponent, opponentRating, userSide, result, moves }) {
  if (!supabase || !user) return { saved: false };

  const rated = Number.isFinite(opponentRating) && (result === 'win' || result === 'loss' || result === 'draw');
  const before = profile && Number.isFinite(profile.rating) ? profile.rating : 1200;
  const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const after = rated ? eloUpdate(before, opponentRating, score) : before;

  const { error: gameError } = await supabase.from('qc_games').insert({
    user_id: user.id,
    opponent: opponent || 'unknown',
    opponent_rating: Number.isFinite(opponentRating) ? opponentRating : null,
    user_side: userSide,
    result,
    rating_before: rated ? before : null,
    rating_after: rated ? after : null,
    moves: Array.isArray(moves) ? moves : [],
  });

  if (rated && !gameError) {
    await supabase
      .from('qc_profiles')
      .update({ rating: after, games_played: ((profile && profile.games_played) || 0) + 1 })
      .eq('id', user.id);
  }

  return { saved: !gameError, ratingBefore: before, ratingAfter: after, rated, error: gameError || null };
}

export async function fetchMyGames(user, limit = 1000) {
  if (!supabase || !user) return [];
  const { data } = await supabase
    .from('qc_games')
    .select('id, opponent, opponent_rating, user_side, result, rating_before, rating_after, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}
