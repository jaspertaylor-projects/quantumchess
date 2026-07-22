// frontend/src/account/gameSync.js
// Purpose: Persist client-owned finished games, apply Elo against rated bots,
// and read ordinary/canonical-ranked histories through a common replay API.
// Retention (last 10 free / 1000 paid) is enforced by a Postgres trigger.
// Imports From: ./supabaseClient.js
// Exported To: ../App.jsx

import { supabase } from './supabaseClient.js';

const K_FACTOR = 32;

export function eloUpdate(playerRating, opponentRating, score) {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(playerRating + K_FACTOR * (score - expected));
}

// Records a client-owned finished game. Rating only moves against rated bots;
// local hotseat and unranked online games save unrated. Ranked online games
// bypass this path and are finalized by the backend.
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

// Move list for one game, fetched on demand when a review opens (the list
// view above deliberately skips the moves column to keep it light).
export async function fetchGameMoves(user, gameId) {
  if (!supabase || !user) return null;
  const { data } = await supabase.rpc('qc_get_game_moves', { p_game_id: gameId });
  return Array.isArray(data) ? data : null;
}

// Sharing is opt-in per game. The server verifies ownership and returns an
// unguessable UUID capability; direct anonymous reads of qc_games stay
// blocked by RLS.
export async function shareSavedGame(user, gameId) {
  if (!supabase || !user || !gameId) return { token: null, error: 'Sign in to share a game.' };
  const { data, error } = await supabase.rpc('qc_share_game', { p_game_id: gameId });
  return { token: typeof data === 'string' ? data : null, error: error ? error.message : null };
}

export function buildSharedGameLink(token) {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/play?game=${encodeURIComponent(token)}`;
}

export function readSharedGameToken() {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('game');
  return value ? value.trim() : null;
}

export function isSharedGameToken(token) {
  return typeof token === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}

export async function fetchSharedGame(token) {
  if (!isSharedGameToken(token)) return { game: null, error: 'That shared game link is invalid.' };
  if (!supabase) return { game: null, error: 'Saved games are not configured in this build.' };
  const { data, error } = await supabase.rpc('qc_get_shared_game', { p_share_token: token });
  if (error) return { game: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { game: null, error: 'This shared game is unavailable.' };
  return { game: row, error: null };
}
