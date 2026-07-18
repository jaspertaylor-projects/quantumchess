// frontend/src/admin/adminStatsApi.js
// Purpose: Data access for the admin stats dashboard. History and account
// counts come straight from Supabase (RLS: admin-only reads); live concurrency
// comes from the backend's public matchmaking metrics endpoint.
// Imports From: ../account/supabaseClient.js, ../tray/matchmakingClient.js
// Exported To: ./AdminStatsModal.jsx

import { supabase } from '../account/supabaseClient.js';
import { getMetrics } from '../tray/matchmakingClient.js';

export { getMetrics };

// Snapshot rows can pile up during busy stretches; 5000 rows ≈ 3.5 days of
// continuous minute-writes, far beyond current traffic. bucketSnapshots
// downsamples whatever comes back anyway.
const SNAPSHOT_ROW_CAP = 5000;
const GAMES_ROW_CAP = 10000;

export async function fetchSnapshots(sinceIso) {
  const { data, error } = await supabase
    .from('qc_stat_snapshots')
    .select('at, queued, active_games, players_online')
    .gte('at', sinceIso)
    .order('at', { ascending: true })
    .limit(SNAPSHOT_ROW_CAP);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchFinishedGames(sinceIso) {
  const { data, error } = await supabase
    .from('qc_finished_games')
    .select('at, mode, result, move_count')
    .gte('at', sinceIso)
    .order('at', { ascending: true })
    .limit(GAMES_ROW_CAP);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchAccountCounts() {
  const [total, paid, admins] = await Promise.all([
    supabase.from('qc_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('qc_profiles').select('id', { count: 'exact', head: true }).eq('tier', 'paid'),
    supabase.from('qc_profiles').select('id', { count: 'exact', head: true }).eq('is_admin', true),
  ]);
  const firstError = total.error || paid.error || admins.error;
  if (firstError) throw new Error(firstError.message);
  return {
    total: total.count || 0,
    paid: paid.count || 0,
    admins: admins.count || 0,
  };
}
