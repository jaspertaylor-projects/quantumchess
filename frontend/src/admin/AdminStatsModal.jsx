// frontend/src/admin/AdminStatsModal.jsx
// Purpose: The admin-only stats dashboard — live concurrency tiles (polled
// from the backend metrics endpoint) plus historical charts and account
// counts read from Supabase under the admin RLS policies.
// Imports From: ../components/ModalShell.jsx, ../components/ModalCloseButton.jsx,
//   ./adminStatsApi.js, ./statsData.js
// Exported To: ../components/AppModals.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ModalShell from '../components/ModalShell.jsx';
import ModalCloseButton from '../components/ModalCloseButton.jsx';
import { getMetrics, fetchSnapshots, fetchFinishedGames, fetchAccountCounts } from './adminStatsApi.js';
import { bucketSnapshots, aggregateGamesPerDay, summarizeStats, DAY_MS } from './statsData.js';
import './AdminStats.css';

const RANGES = [
  { key: '24h', label: '24 h', ms: DAY_MS, days: 1 },
  { key: '7d', label: '7 days', ms: 7 * DAY_MS, days: 7 },
  { key: '30d', label: '30 days', ms: 30 * DAY_MS, days: 30 },
];

const LIVE_POLL_MS = 10000;

const timeLabel = (ms, rangeKey) => {
  const d = new Date(ms);
  if (rangeKey === '24h') {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
};

const dayLabel = (isoDay) => {
  const d = new Date(`${isoDay}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
};

// ---------------------------------------------------------------- line chart
// Players online + games in progress over the selected range. Max-per-bucket
// series from sparse snapshots; hover shows the nearest bucket.
function ConcurrencyChart({ series, rangeKey }) {
  const [hover, setHover] = useState(null); // bucket index
  const bodyRef = useRef(null);

  const W = 640;
  const H = 180;
  const PAD = { left: 30, right: 10, top: 10, bottom: 22 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const yMax = Math.max(2, ...series.map((b) => Math.max(b.playersOnline, b.activeGames)));
  const x = (i) => PAD.left + (plotW * (i + 0.5)) / series.length;
  const y = (v) => PAD.top + plotH - (plotH * v) / yMax;
  const path = (pick) => series.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pick(b)).toFixed(1)}`).join('');

  const yTicks = yMax <= 4
    ? Array.from({ length: yMax + 1 }, (_, i) => i)
    : [0, Math.round(yMax / 2), yMax];
  const xTickIdx = [0, Math.floor(series.length / 2), series.length - 1];

  const onMove = (e) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((frac - PAD.left) / plotW) * series.length - 0.5);
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  const hovered = hover == null ? null : series[hover];

  return (
    <div className="qc-admin-chart">
      <div className="qc-admin-chart-head">
        <span className="qc-admin-chart-title">Concurrency</span>
        <span className="qc-admin-legend">
          <span><span className="qc-admin-legend-chip" style={{ background: 'var(--qc-viz-players)' }} />Players online</span>
          <span><span className="qc-admin-legend-chip" style={{ background: 'var(--qc-viz-games)' }} />Games in progress</span>
        </span>
      </div>
      <div className="qc-admin-chart-body" ref={bodyRef} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Players online and games in progress over time">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--qc-viz-grid)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--qc-viz-muted)">{t}</text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--qc-viz-axis)" strokeWidth="1" />
          {xTickIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--qc-viz-muted)">
              {timeLabel(series[i].t, rangeKey)}
            </text>
          ))}
          <path d={path((b) => b.playersOnline)} fill="none" stroke="var(--qc-viz-players)" strokeWidth="2" strokeLinejoin="round" />
          <path d={path((b) => b.activeGames)} fill="none" stroke="var(--qc-viz-games)" strokeWidth="2" strokeLinejoin="round" />
          {hovered && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--qc-viz-axis)" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(hovered.playersOnline)} r="3.5" fill="var(--qc-viz-players)" stroke="var(--qc-viz-surface)" strokeWidth="2" />
              <circle cx={x(hover)} cy={y(hovered.activeGames)} r="3.5" fill="var(--qc-viz-games)" stroke="var(--qc-viz-surface)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hovered && (
          <div className="qc-admin-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}>
            {timeLabel(hovered.t, rangeKey)}<br />
            Players: <b>{hovered.playersOnline}</b> · Games: <b>{hovered.activeGames}</b>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- bar chart
// Finished games per day, bot and online stacked with a 2px surface gap.
function GamesPerDayChart({ perDay }) {
  const [hover, setHover] = useState(null); // day index

  const W = 640;
  const H = 170;
  const PAD = { left: 30, right: 10, top: 10, bottom: 22 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const yMax = Math.max(4, ...perDay.map((d) => d.bot + d.online));
  const slot = plotW / perDay.length;
  const barW = Math.min(34, Math.max(4, slot - 2));
  const x = (i) => PAD.left + slot * i + (slot - barW) / 2;
  const hFor = (v) => (plotH * v) / yMax;
  const yTicks = [0, Math.round(yMax / 2), yMax];
  const labelEvery = Math.max(1, Math.ceil(perDay.length / 8));
  const hovered = hover == null ? null : perDay[hover];

  return (
    <div className="qc-admin-chart">
      <div className="qc-admin-chart-head">
        <span className="qc-admin-chart-title">Games per day</span>
        <span className="qc-admin-legend">
          <span><span className="qc-admin-legend-chip" style={{ background: 'var(--qc-viz-bot)' }} />vs bots</span>
          <span><span className="qc-admin-legend-chip" style={{ background: 'var(--qc-viz-online)' }} />online 1v1</span>
        </span>
      </div>
      <div className="qc-admin-chart-body" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Finished games per day, bot and online">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH - hFor(t)} y2={PAD.top + plotH - hFor(t)} stroke="var(--qc-viz-grid)" strokeWidth="1" />
              <text x={PAD.left - 6} y={PAD.top + plotH - hFor(t) + 3} textAnchor="end" fontSize="10" fill="var(--qc-viz-muted)">{t}</text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--qc-viz-axis)" strokeWidth="1" />
          {perDay.map((d, i) => {
            const botH = hFor(d.bot);
            const onlineH = hFor(d.online);
            const base = PAD.top + plotH;
            return (
              <g key={d.day} onPointerEnter={() => setHover(i)}>
                {/* oversized hit target so thin bars are hoverable */}
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                {d.bot > 0 && (
                  <rect x={x(i)} y={base - botH} width={barW} height={botH} rx={onlineH > 0 ? 0 : 4} fill="var(--qc-viz-bot)" />
                )}
                {d.online > 0 && (
                  <rect x={x(i)} y={base - botH - onlineH - (d.bot > 0 ? 2 : 0)} width={barW} height={onlineH} rx="4" fill="var(--qc-viz-online)" />
                )}
                {i % labelEvery === 0 && (
                  <text x={PAD.left + slot * i + slot / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--qc-viz-muted)">
                    {dayLabel(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="qc-admin-tooltip" style={{ left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%`, top: 0 }}>
            {dayLabel(hovered.day)}<br />
            Bots: <b>{hovered.bot}</b> · Online: <b>{hovered.online}</b> · Total: <b>{hovered.bot + hovered.online}</b>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- modal
export default function AdminStatsModal({ open = false, onClose = () => {}, auth }) {
  const [rangeKey, setRangeKey] = useState('7d');
  const [live, setLive] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [games, setGames] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState('');
  const [showTable, setShowTable] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[1];
  const isAdmin = Boolean(auth?.profile?.is_admin);

  // Live metrics: poll while open.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const poll = () => getMetrics().then((m) => { if (!cancelled) setLive(m); }).catch(() => {});
    poll();
    const timer = setInterval(poll, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [open]);

  // History + account counts: refetch when the modal opens or range changes.
  useEffect(() => {
    if (!open || !isAdmin) return undefined;
    let cancelled = false;
    setError('');
    setHistoryLoaded(false);
    const sinceIso = new Date(Date.now() - range.ms).toISOString();
    Promise.all([fetchSnapshots(sinceIso), fetchFinishedGames(sinceIso), fetchAccountCounts()])
      .then(([snaps, finished, counts]) => {
        if (cancelled) return;
        setSnapshots(snaps);
        setGames(finished);
        setAccounts(counts);
        setHistoryLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(`Couldn't load history from Supabase: ${err.message}. `
          + (auth?.isDevPreview ? 'Dev preview has no real admin session — sign in with a real admin account for data.' : ''));
        setHistoryLoaded(true);
      });
    return () => { cancelled = true; };
  }, [open, isAdmin, rangeKey]);

  const now = Date.now();
  const series = useMemo(
    () => bucketSnapshots(snapshots, { now, rangeMs: range.ms }),
    [snapshots, rangeKey, historyLoaded],
  );
  const perDay = useMemo(
    () => aggregateGamesPerDay(games, { now, days: range.days }),
    [games, rangeKey, historyLoaded],
  );
  const summary = useMemo(
    () => summarizeStats({ games, snapshots, now }),
    [games, snapshots, historyLoaded],
  );

  if (!open) return null;

  const anyHistory = snapshots.length > 0 || games.length > 0;

  return (
    <ModalShell open onClose={onClose} closeOnBackdrop zIndex={1002} ariaLabel="Admin stats dashboard" panelClassName="qc-admin-panel">
      <ModalCloseButton onClick={onClose} style={{ position: 'absolute', top: 12, right: 12 }} />
      <h2>Site stats</h2>
      <p className="qc-admin-sub">Admin only. Live numbers refresh every {LIVE_POLL_MS / 1000}s; history reads the stats tables.</p>

      {!isAdmin && <p className="qc-admin-error">This account is not an admin.</p>}
      {error && <p className="qc-admin-error">{error}</p>}

      <div className="qc-admin-tiles">
        <div className="qc-admin-tile qc-admin-tile--live">
          <div className="qc-admin-tile-label">Players online</div>
          <div className="qc-admin-tile-value">{live ? live.playersOnline : '—'}</div>
          <div className="qc-admin-tile-detail">{live ? `${live.queued} queued` : 'loading…'}</div>
        </div>
        <div className="qc-admin-tile qc-admin-tile--live">
          <div className="qc-admin-tile-label">Games in progress</div>
          <div className="qc-admin-tile-value">{live ? live.activeGames : '—'}</div>
          <div className="qc-admin-tile-detail">{live ? `peak since deploy ${live.peakActiveGames}` : 'loading…'}</div>
        </div>
        <div className="qc-admin-tile">
          <div className="qc-admin-tile-label">Games today</div>
          <div className="qc-admin-tile-value">{summary.gamesToday}</div>
          <div className="qc-admin-tile-detail">{summary.gamesTodayBot} bot · {summary.gamesTodayOnline} online</div>
        </div>
        <div className="qc-admin-tile">
          <div className="qc-admin-tile-label">Peak players · {range.label}</div>
          <div className="qc-admin-tile-value">{summary.peakPlayers}</div>
          <div className="qc-admin-tile-detail">peak games {summary.peakActive}</div>
        </div>
        <div className="qc-admin-tile">
          <div className="qc-admin-tile-label">Accounts</div>
          <div className="qc-admin-tile-value">{accounts ? accounts.total : '—'}</div>
          <div className="qc-admin-tile-detail">{accounts ? `${accounts.paid} premium` : ' '}</div>
        </div>
      </div>

      <div className="qc-admin-controls">
        <div className="qc-admin-range" role="group" aria-label="History range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={r.key === rangeKey ? 'is-active' : ''} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className={`qc-admin-table-toggle${showTable ? ' is-active' : ''}`} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Charts' : 'Table'}
        </button>
      </div>

      {!anyHistory && historyLoaded && !error ? (
        <p className="qc-admin-empty">No recorded activity in this range yet — snapshots and finished games will appear here as people play.</p>
      ) : showTable ? (
        <table className="qc-admin-table">
          <thead>
            <tr><th>Day</th><th>Bot games</th><th>Online games</th><th>Total</th></tr>
          </thead>
          <tbody>
            {[...perDay].reverse().map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.bot}</td>
                <td>{d.online}</td>
                <td>{d.bot + d.online}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <ConcurrencyChart series={series} rangeKey={rangeKey} />
          <GamesPerDayChart perDay={perDay} />
        </>
      )}

      <p className="qc-admin-foot">
        {summary.gamesInRange} finished games in range · online concurrency covers 1v1 only (bot games run in the browser) ·
        bot counts are best-effort client pings · GA has funnels and consented visitor detail.
      </p>
    </ModalShell>
  );
}
