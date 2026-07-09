// frontend/src/account/botProgress.js
// Purpose: Read and write durable bot unlock/progression state for signed-in
// players. Supabase is the source of truth; old saved bot wins are treated as
// progress so existing players are not reset by the new table.
// Imports From: ./supabaseClient.js
// Exported To: ../App.jsx, ../ladder/BotLadderPanel.jsx

import { supabase } from './supabaseClient.js';

// Fired after a clear is recorded so any mounted ladder UI can refresh.
export const BOT_PROGRESS_EVENT = 'qcBotProgressUpdated';

export async function fetchBotProgress(user, botIds = []) {
  if (!supabase || !user) return [];
  const wanted = new Set(botIds.filter(Boolean));
  const progress = new Map();

  try {
    const { data } = await supabase
      .from('qc_bot_progress')
      .select('bot_id, cleared_at, unlocked_flavor_at')
      .eq('user_id', user.id);
    for (const row of data || []) {
      if (!wanted.size || wanted.has(row.bot_id)) progress.set(row.bot_id, row);
    }
  } catch (_) {
    // The migration may not be present in local/dev projects yet; fall back
    // to qc_games below.
  }

  try {
    const { data } = await supabase
      .from('qc_games')
      .select('opponent, created_at')
      .eq('user_id', user.id)
      .eq('result', 'win')
      .in('opponent', botIds.length ? botIds : ['__none__']);
    for (const row of data || []) {
      if (!row.opponent || progress.has(row.opponent)) continue;
      progress.set(row.opponent, {
        bot_id: row.opponent,
        cleared_at: row.created_at,
        unlocked_flavor_at: row.created_at,
      });
    }
  } catch (_) {
    // Saved games are a compatibility bonus; ignore failures.
  }

  return Array.from(progress.values());
}

export async function recordBotClear({ user, botId }) {
  if (!supabase || !user || !botId) return { saved: false };

  const { data: existing } = await supabase
    .from('qc_bot_progress')
    .select('bot_id')
    .eq('user_id', user.id)
    .eq('bot_id', botId)
    .maybeSingle();

  if (existing) return { saved: true, existed: true };

  const { error } = await supabase.from('qc_bot_progress').insert({
    user_id: user.id,
    bot_id: botId,
  });

  if (!error) {
    try { window.dispatchEvent(new CustomEvent(BOT_PROGRESS_EVENT)); } catch (_) {}
  }
  return { saved: !error, error: error || null };
}
