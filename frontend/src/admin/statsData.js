// frontend/src/admin/statsData.js
// Purpose: Pure shaping of admin-stats rows (qc_stat_snapshots and
// qc_finished_games) into chart-ready series and headline numbers. No I/O so
// the aggregation contract is pinned by tests.
// Imports From: None
// Exported To: ./AdminStatsModal.jsx, ../../tests/adminStatsData.test.js

export const DAY_MS = 24 * 60 * 60 * 1000;

// Snapshots arrive sparse (the sampler skips all-zero minutes), so charting
// raw rows would draw a line that never returns to zero. Downsample into
// fixed buckets, taking each bucket's max (peaks must survive), and fill
// empty buckets with zero.
export function bucketSnapshots(rows, { now, rangeMs, buckets = 96 }) {
  const start = now - rangeMs;
  const step = rangeMs / buckets;
  const out = Array.from({ length: buckets }, (_, i) => ({
    t: start + (i + 0.5) * step,
    playersOnline: 0,
    activeGames: 0,
  }));
  for (const row of rows || []) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || at < start || at > now) continue;
    const idx = Math.min(buckets - 1, Math.floor((at - start) / step));
    out[idx].playersOnline = Math.max(out[idx].playersOnline, Number(row.players_online) || 0);
    out[idx].activeGames = Math.max(out[idx].activeGames, Number(row.active_games) || 0);
  }
  return out;
}

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// One row per calendar day (UTC) covering the whole range, oldest first:
// { day: 'YYYY-MM-DD', bot: n, online: n }. Void online games (nobody moved)
// are excluded — they were never really played.
export function aggregateGamesPerDay(rows, { now, days }) {
  const byDay = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS);
    byDay.set(key, { day: key, bot: 0, online: 0 });
  }
  for (const row of rows || []) {
    if (row.mode === 'online' && row.result === 'void') continue;
    const at = Date.parse(row.at);
    if (!Number.isFinite(at)) continue;
    const entry = byDay.get(dayKey(at));
    if (!entry) continue;
    if (row.mode === 'bot') entry.bot += 1;
    else if (row.mode === 'online') entry.online += 1;
  }
  return Array.from(byDay.values());
}

// Headline numbers for the tiles.
export function summarizeStats({ games, snapshots, now }) {
  const perDay = aggregateGamesPerDay(games, { now, days: 1 });
  const today = perDay[perDay.length - 1] || { bot: 0, online: 0 };
  let total = 0;
  for (const row of games || []) {
    if (!(row.mode === 'online' && row.result === 'void')) total += 1;
  }
  let peakPlayers = 0;
  let peakActive = 0;
  for (const row of snapshots || []) {
    peakPlayers = Math.max(peakPlayers, Number(row.players_online) || 0);
    peakActive = Math.max(peakActive, Number(row.active_games) || 0);
  }
  return {
    gamesToday: today.bot + today.online,
    gamesTodayBot: today.bot,
    gamesTodayOnline: today.online,
    gamesInRange: total,
    peakPlayers,
    peakActive,
  };
}
