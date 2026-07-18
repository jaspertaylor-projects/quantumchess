import { describe, expect, it } from 'vitest';
import { bucketSnapshots, aggregateGamesPerDay, summarizeStats, DAY_MS } from '../src/admin/statsData.js';

const NOW = Date.parse('2026-07-18T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

describe('bucketSnapshots', () => {
  it('fills the whole range with zeros when there are no rows', () => {
    const series = bucketSnapshots([], { now: NOW, rangeMs: DAY_MS, buckets: 4 });
    expect(series).toHaveLength(4);
    expect(series.every((b) => b.playersOnline === 0 && b.activeGames === 0)).toBe(true);
    expect(series[0].t).toBeLessThan(series[3].t);
  });

  it('keeps the max per bucket so short peaks survive downsampling', () => {
    const rows = [
      { at: iso(NOW - 1000), players_online: 2, active_games: 1 },
      { at: iso(NOW - 2000), players_online: 6, active_games: 3 },
      { at: iso(NOW - 3000), players_online: 4, active_games: 2 },
    ];
    const series = bucketSnapshots(rows, { now: NOW, rangeMs: DAY_MS, buckets: 4 });
    const last = series[series.length - 1];
    expect(last.playersOnline).toBe(6);
    expect(last.activeGames).toBe(3);
  });

  it('ignores rows outside the range', () => {
    const rows = [{ at: iso(NOW - 2 * DAY_MS), players_online: 9, active_games: 9 }];
    const series = bucketSnapshots(rows, { now: NOW, rangeMs: DAY_MS, buckets: 4 });
    expect(series.every((b) => b.playersOnline === 0)).toBe(true);
  });
});

describe('aggregateGamesPerDay', () => {
  it('produces one row per day, oldest first, with bot/online split', () => {
    const rows = [
      { at: iso(NOW), mode: 'bot', result: 'win' },
      { at: iso(NOW - 1000), mode: 'bot', result: 'loss' },
      { at: iso(NOW), mode: 'online', result: 'white' },
      { at: iso(NOW - DAY_MS), mode: 'bot', result: 'draw' },
    ];
    const perDay = aggregateGamesPerDay(rows, { now: NOW, days: 3 });
    expect(perDay).toHaveLength(3);
    expect(perDay[2]).toEqual({ day: '2026-07-18', bot: 2, online: 1 });
    expect(perDay[1]).toEqual({ day: '2026-07-17', bot: 1, online: 0 });
    expect(perDay[0]).toEqual({ day: '2026-07-16', bot: 0, online: 0 });
  });

  it('excludes void online games (nobody ever moved)', () => {
    const rows = [
      { at: iso(NOW), mode: 'online', result: 'void' },
      { at: iso(NOW), mode: 'online', result: 'draw' },
    ];
    const perDay = aggregateGamesPerDay(rows, { now: NOW, days: 1 });
    expect(perDay[0].online).toBe(1);
  });
});

describe('summarizeStats', () => {
  it('reports today, range totals, and snapshot peaks', () => {
    const games = [
      { at: iso(NOW), mode: 'bot', result: 'win' },
      { at: iso(NOW - DAY_MS), mode: 'online', result: 'black' },
      { at: iso(NOW), mode: 'online', result: 'void' },
    ];
    const snapshots = [
      { at: iso(NOW - 1000), players_online: 3, active_games: 1 },
      { at: iso(NOW - 2000), players_online: 8, active_games: 4 },
    ];
    const summary = summarizeStats({ games, snapshots, now: NOW });
    expect(summary.gamesToday).toBe(1);
    expect(summary.gamesTodayBot).toBe(1);
    expect(summary.gamesTodayOnline).toBe(0);
    expect(summary.gamesInRange).toBe(2);
    expect(summary.peakPlayers).toBe(8);
    expect(summary.peakActive).toBe(4);
  });
});
