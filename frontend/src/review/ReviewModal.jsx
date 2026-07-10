// frontend/src/review/ReviewModal.jsx
// Purpose: Premium game review — replay a saved game move by move with an
// engine eval bar, move-quality marks, and a best-move suggestion computed
// in a web worker for the position being viewed.
// Imports From: ../theme.js, ../components/IconButton.jsx, ../components/ModalShell.jsx,
//   ../chessboard/Board.jsx, ../ai/alphaBetaEngine.js, ./replayCore.js
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import ModalShell from '../components/ModalShell.jsx';
import {
  X as XIcon, ChevronLeft, ChevronRight, SkipBack, SkipForward, Microscope, Sparkles,
} from 'lucide-react';
import Board from '../chessboard/Board.jsx';
import PlayerBar from '../components/PlayerBar.jsx';
import { getBotById, getBotAvatarUrl } from '../ai/bots.js';
import { buildReviewTimeline } from './replayCore.js';

const HIGHLIGHT_FROM = 'rgba(79, 195, 247, 0.55)';
const HIGHLIGHT_TO = 'rgba(246, 196, 69, 0.55)';

// Mover-perspective eval drop (in pawns) that earns a mark in the move list.
const MISTAKE_DROP = 1.5;
const BLUNDER_DROP = 3;

function formatEval(v) {
  // Mate scores are ply-adjusted (1000 = mate on the board). Show the
  // distance while it's coming — M1, M2 — and '#' once it's delivered, so a
  // game ends "... M1, #" instead of "#, +23.1".
  if (Math.abs(v) >= 999.5) return v > 0 ? '#' : '-#';
  if (Math.abs(v) >= 900) {
    const movesLeft = Math.max(1, Math.ceil((1000 - Math.abs(v)) / 2));
    return `${v > 0 ? '' : '-'}M${movesLeft}`;
  }
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

function describeHintMove(mv) {
  if (!mv) return '';
  if (mv.castle) return `castle ${mv.from}+…`;
  return `${mv.from} → ${mv.to}${mv.enPassant ? ' (en passant)' : ''}`;
}

function capturedOf(pieces, side, pawns) {
  return (pieces || [])
    .filter((p) => p.captured && p.side === side && Array.isArray(p.possibleTypes)
      && (pawns ? p.possibleTypes[0] === 'p' : p.possibleTypes[0] !== 'p'))
    .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
}

// Dev/mined-game strip: the full game's eval story as a clickable seek
// graph. Values are computed CLIENT-SIDE, progressively, at parity-matched
// depths (white-to-move depth 2, black-to-move depth 1 — every lookahead
// ends after a Black move), because a fixed depth flips who-moved-last
// every ply and saws the curve: the mover always looks a tempo better.
// Only rendered when showEvalGraph is set — live premium reviews are
// untouched.
function EvalTraceGraph({ trace, count, idx, onSeek, pendingCount, deepening, lineTier }) {
  const W = 560;
  const H = 96;
  const PAD = 8;
  const maxPly = Math.max(1, count - 1);
  const x = (ply) => PAD + (ply / maxPly) * (W - 2 * PAD);
  const y = (v) => H / 2 - (Math.max(-8, Math.min(8, v)) / 8) * (H / 2 - 10);
  const sorted = [...trace].sort((a, b) => a.ply - b.ply);
  // The whole curve draws from ONE tier (chosen by the modal — the deepest
  // one complete at every point). Mixed-tier neighbors draw phantom swings.
  const pts = sorted
    .map((p) => ({ ply: p.ply, side: p.side, eval: p.vals[lineTier] }))
    .filter((p) => p.eval !== undefined);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ply).toFixed(1)} ${y(p.eval).toFixed(1)}`).join(' ');
  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(count - 1, Math.round(fx * maxPly))));
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', cursor: 'pointer' }}
      onClick={seek}
      role="img"
      aria-label="Game evaluation graph; click to jump to a move"
    >
      <rect x="0" y="0" width={W} height={H} rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" />
      {/* balance band ±1 */}
      <rect x={PAD} y={y(1)} width={W - 2 * PAD} height={y(-1) - y(1)} fill="rgba(126,231,135,0.07)" />
      <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke="rgba(128,128,128,0.5)" strokeWidth="1" />
      <path d={path} fill="none" stroke="#39e6ff" strokeWidth="1.6" />
      {pts.map((p) => (lineTier === 'fast' ? (
        <circle
          key={`pt-${p.ply}`} cx={x(p.ply)} cy={y(p.eval)} r={2.2}
          fill="none" stroke="rgba(57,230,255,0.7)" strokeWidth="1"
        />
      ) : (
        <circle
          key={`pt-${p.ply}`} cx={x(p.ply)} cy={y(p.eval)} r={lineTier === 'deep' ? 2.4 : 1.9}
          fill={lineTier === 'deep' ? '#39e6ff' : 'rgba(57,230,255,0.7)'}
        />
      )))}
      <line x1={x(idx)} y1={6} x2={x(idx)} y2={H - 6} stroke="#ffd166" strokeWidth="1.5" />
      <text x={PAD + 2} y={12} fontSize="9" fill="rgba(255,255,255,0.5)">+8</text>
      <text x={W / 2} y={12} fontSize="9" textAnchor="middle" fill="rgba(255,255,255,0.45)">
        {`curve: ${lineTier === 'deep' ? 'd6/d5' : lineTier === 'mid' ? 'd4/d3' : 'd2/d1'}`}
      </text>
      <text x={PAD + 2} y={H - 5} fontSize="9" fill="rgba(255,255,255,0.5)">-8</text>
      {pendingCount > 0 ? (
        <text x={W - PAD} y={12} fontSize="9" textAnchor="end" fill="rgba(255,255,255,0.5)">
          {deepening ? `deepening (${deepening})… ${pendingCount} left` : `scanning… ${pendingCount} left`}
        </text>
      ) : null}
    </svg>
  );
}

export default function ReviewModal({
  open = false,
  onClose = () => {},
  game = null, // { id, opponent, opponent_rating, user_side, result, created_at, headline? }
  moves = null, // stored qc_games.moves array
  showEvalGraph = false, // dev/mined only: compute + show the whole-game eval graph strip
  pieceSvgStyles,
  indicators,
  squareColors,
}) {
  const timeline = useMemo(
    () => (open && Array.isArray(moves) ? buildReviewTimeline(moves) : null),
    [open, moves],
  );
  const snapshots = timeline ? timeline.snapshots : [];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (open) setIdx(snapshots.length > 0 ? snapshots.length - 1 : 0);
  }, [open, snapshots.length]);

  // Whole-game eval graph (dev/mined): one worker walks the snapshots in
  // coarse-to-fine stride passes so a rough curve appears in seconds, then a
  // second pass re-resolves every point DEEP — the modal never waits on it.
  // Depth pairs are parity-matched (white-to-move even, black-to-move odd:
  // every lookahead ends after a Black move) because a fixed depth flips
  // who-moved-last each ply and saws the curve. Ladder: (2,1) fast, then
  // (6,5) replacing values as they land; deep timeouts keep the fast value.
  const [graphTrace, setGraphTrace] = useState([]);
  const [graphPending, setGraphPending] = useState(0);
  const [graphDeepening, setGraphDeepening] = useState(false); // false | 'd4/d3' | 'd6/d5'
  useEffect(() => {
    if (!open || !showEvalGraph || !timeline || timeline.snapshots.length <= 1) return undefined;
    const snaps = timeline.snapshots;
    setGraphTrace([]);
    setGraphDeepening(false);
    let stopped = false;
    // EVERY ply gets a value: an unsampled ply would fall back to a
    // different ruler (static eval), and mixed rulers saw the move list —
    // material counted before the search's discounting made White's moves
    // look like they improved the eval.
    const step = 1;
    const jobs = [];
    let nextId = 0;
    // Root beams are FULL WIDTH on the deep passes: a pruned root move is
    // exactly how a false "eval jumped after the move" seam gets drawn.
    // Root width 128 = never truncate: these midgames reach 60-80 legal
    // moves, and a root-pruned move is a phantom seam in the curve (found
    // the hard way: d1->d7 pruned at root width 40 drew 0.8 where the true
    // matched-tier value was 3.45).
    const PHASES = {
      fast: { tier: 'fast', depthW: 2, depthB: 1, widths: [176, 8, 6], timeMs: 8000, deep: false },
      mid: { tier: 'mid', depthW: 4, depthB: 3, widths: [176, 12, 8, 6], timeMs: 20000, deep: true },
      deep: { tier: 'deep', depthW: 6, depthB: 5, widths: [176, 12, 8, 6, 5, 4], timeMs: 45000, deep: true },
    };
    for (const phase of [PHASES.fast, PHASES.mid, PHASES.deep]) {
      const seen = new Set();
      for (const stride of [8, 4, 2, 1]) {
        for (let k = 0; k < snaps.length; k += stride) {
          if (!seen.has(k)) { seen.add(k); jobs.push({ id: nextId++, k, ...phase }); }
        }
      }
    }
    setGraphPending(jobs.length);
    // A small pool: graph evals are embarrassingly parallel and the browser
    // has cores to spare even with the hint worker running.
    const POOL = 2; // leave headroom for the hint worker — arrows must feel instant
    const workers = [];
    const takeJob = (worker, state) => {
      if (stopped) return;
      const job = jobs.shift();
      if (!job) { worker.terminate(); return; }
      state.job = job;
      setGraphDeepening(job.deep ? (job.tier === 'deep' ? 'd6/d5' : 'd4/d3') : false);
      const snap = snaps[job.k];
      if (!snap || snap.gameOver) {
        setGraphPending((n) => Math.max(0, n - 1));
        takeJob(worker, state);
        return;
      }
      worker.postMessage({
        type: 'analyze',
        id: job.id,
        payload: {
          pieces: snap.pieces,
          sideToMove: snap.sideToMove,
          lastMove: snap.lastMove || null,
          depth: snap.sideToMove === 'white' ? job.depthW : job.depthB,
          widths: job.widths,
          timeMs: job.timeMs,
        },
      });
    };
    for (let w = 0; w < POOL; w++) {
      const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
      const state = { job: null };
      worker.onmessage = (e) => {
        const d = e.data || {};
        if (d.type !== 'analysis' || !state.job || d.id !== state.job.id) return;
        const job = state.job;
        if (d.moves && d.moves.length) {
          const side = snaps[job.k].sideToMove;
          const v = Number((side === 'white' ? d.moves[0].score : -d.moves[0].score).toFixed(2));
          setGraphTrace((t) => {
            const prev = t.find((p) => p.ply === job.k);
            const point = { ply: job.k, side, vals: { ...(prev ? prev.vals : {}), [job.tier]: v } };
            return [...t.filter((p) => p.ply !== job.k), point];
          });
        }
        // Timeouts keep the previous tier's value: the ladder runs the full
        // mid pass before deep, so the curve is uniformly d4/d3 quickly and
        // d6/d5 upgrades land wherever the budget allows.
        setGraphPending((n) => Math.max(0, n - 1));
        takeJob(worker, state);
      };
      worker.onerror = () => { setGraphPending((n) => Math.max(0, n - 1)); takeJob(worker, state); };
      workers.push(worker);
      takeJob(worker, state);
    }
    return () => { stopped = true; workers.forEach((w) => w.terminate()); };
  }, [open, showEvalGraph, timeline]);

  // One tier rules everywhere: the deepest tier complete at every graphed
  // point. The move list, eval bar, and mistake marks all read these values
  // (falling back to the static eval for plies the graph hasn't reached),
  // so the numbers beside the moves always agree with the curve.
  const lineTier = useMemo(
    () => ['deep', 'mid', 'fast'].find((t) => graphTrace.length && graphTrace.every((p) => p.vals[t] !== undefined)) || 'fast',
    [graphTrace],
  );
  const graphVals = useMemo(() => {
    const m = new Map();
    for (const p of graphTrace) if (p.vals[lineTier] !== undefined) m.set(p.ply, p.vals[lineTier]);
    return m;
  }, [graphTrace, lineTier]);
  // One ruler only: a ply shows its parity-matched search value or nothing
  // ('…' while the scanner gets there). Terminal snapshots pin to the mate
  // score. The bar borrows the nearest known value so it never jumps rulers.
  const evalAt = (k) => {
    const s2 = snapshots[k];
    if (s2 && s2.gameOver) {
      if (s2.winner === 'white') return 1000;
      if (s2.winner === 'black') return -1000;
      return 0; // stalemate/draw endings
    }
    return graphVals.has(k) ? graphVals.get(k) : null;
  };
  const nearestEval = (k) => {
    for (let d = 0; d < snapshots.length; d++) {
      const lo = evalAt(k - d);
      if (lo !== null && lo !== undefined) return lo;
      const hi = evalAt(k + d);
      if (hi !== null && hi !== undefined) return hi;
    }
    return 0;
  };

  const bounded = Math.max(0, Math.min(idx, snapshots.length - 1));
  const snap = snapshots[bounded] || null;

  // Engine suggestions for the viewed position, computed off-thread: the
  // THREE strongest moves drawn as layered green arrows — the best one
  // boldest. Two stages in one worker so arrows appear in ~a second (full
  // root, depth 2) and then refine at depth 4. Stale replies are ignored.
  const [hints, setHints] = useState(null); // [{ from, to, enPassant, castle, score }] best-first
  const reqIdRef = useRef(0);
  useEffect(() => {
    setHints(null);
    if (!open || !snap || snap.gameOver) return undefined;
    const reqId = ++reqIdRef.current;
    const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
    const post = (stage, depth, widths, timeMs) => worker.postMessage({
      type: 'analyze',
      id: `${reqId}:${stage}`,
      payload: {
        pieces: snap.pieces,
        sideToMove: snap.sideToMove,
        lastMove: snap.lastMove || null,
        depth,
        widths,
        timeMs,
      },
    });
    worker.addEventListener('message', (e) => {
      const data = e.data || {};
      if (reqId !== reqIdRef.current || data.type !== 'analysis') return;
      if (data.moves) setHints(data.moves.slice(0, 3));
      if (data.id === `${reqId}:quick`) post('deep', 4, [128, 12, 8, 6], 25000);
    });
    post('quick', 2, [128, 10, 8], 8000);
    return () => { worker.terminate(); };
  }, [open, snap]);

  // Keyboard navigation while the modal is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setIdx((i) => Math.min(snapshots.length - 1, i + 1)); }
      else if (e.key === 'Home') { e.preventDefault(); setIdx(0); }
      else if (e.key === 'End') { e.preventDefault(); setIdx(snapshots.length - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, snapshots.length, onClose]);

  if (!open) return null;

  const styles = {
    panel: {
      width: 'min(96vw, 1040px)', maxHeight: '92vh', overflowY: 'auto',
      borderRadius: 12, border: `1px solid ${theme.border}`, backgroundColor: theme.cardBackground,
      boxShadow: `0 12px 32px ${theme.shadow}`, color: theme.textPrimary, padding: 16,
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10,
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { margin: 0, fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 },
    sub: { fontSize: 12, color: theme.textSecondary },
    // Two firm columns: board+bars left, hints/moves/graph right.
    content: { display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 400px)', gap: 14, alignItems: 'stretch' },
    boardCol: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
    // The right column spans exactly the eval bar's extent: both start at
    // the top player bar and finish at the bottom player bar's baseline.
    sideCol: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, minHeight: 0 },
    // Vertical eval bar: hugs the board's left edge, spanning board + both
    // player bars. White's share fills from the bottom, like a thermometer.
    evalBarVertical: {
      width: 28, borderRadius: 8, overflow: 'hidden', border: `1px solid ${theme.border}`,
      background: '#20242c', position: 'relative', alignSelf: 'stretch', flexShrink: 0,
    },
    evalBarNumber: (whiteHigh) => ({
      position: 'absolute', top: 5, left: 0, right: 0, textAlign: 'center',
      fontSize: 9.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
      color: whiteHigh ? '#15181d' : '#e8e6e1', pointerEvents: 'none',
    }),
    hintHead: {
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11.5, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: '#7ee787', textShadow: '0 0 12px rgba(126,231,135,0.45)', marginBottom: 5,
    },
    hintBox: {
      border: '1px solid rgba(126,231,135,0.5)', borderRadius: 8, padding: '8px 10px',
      background: 'rgba(126,231,135,0.08)', fontSize: 12.5, lineHeight: 1.5,
    },
    nav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
    // Two move columns: number | white's move | black's move.
    moveList: {
      display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'center',
      alignContent: 'start', columnGap: 6, rowGap: 3, overflowY: 'auto', overflowX: 'hidden',
      flex: '1 1 0', minHeight: 160, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 6,
    },
    moveNo: { color: theme.textSecondary, fontSize: 12, minWidth: 22, textAlign: 'right' },
    moveCell: (active) => ({
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6,
      cursor: 'pointer', fontSize: 12.5, minWidth: 0,
      background: active ? 'rgba(79,195,247,0.15)' : 'transparent',
      border: `1px solid ${active ? 'rgba(79,195,247,0.5)' : 'transparent'}`,
    }),
    mark: (m) => ({
      fontWeight: 900, minWidth: 18, textAlign: 'center',
      color: m === '??' ? '#ff7b72' : m === '?' ? '#f6c445' : 'transparent',
    }),
  };

  // Move rows: snapshots[k] is reached by entries[k-1].
  const rowsToPairs = (rws) => {
    const pairs = [];
    for (const r of rws) {
      if (r.mover === 'white' || !pairs.length || pairs[pairs.length - 1].black) {
        pairs.push({ moveNo: pairs.length + 1, white: r.mover === 'white' ? r : null, black: r.mover === 'black' ? r : null });
      } else {
        pairs[pairs.length - 1].black = r;
      }
    }
    return pairs;
  };
  const rows = snapshots.slice(1).map((s, i) => {
    const entry = timeline.entries[i] || null;
    const mover = s.lastMove ? s.lastMove.side : (i % 2 === 0 ? 'white' : 'black');
    const before = evalAt(i);
    const after = evalAt(i + 1);
    const haveBoth = before !== null && after !== null;
    const moverDrop = haveBoth ? (mover === 'white' ? -(after - before) : after - before) : 0;
    const mark = !haveBoth ? '' : moverDrop >= BLUNDER_DROP ? '??' : moverDrop >= MISTAKE_DROP ? '?' : '';
    const label = entry && entry.type === 'castle'
      ? `${entry.piece1_from} ⇄ ${entry.piece2_from}`
      : s.lastMove ? `${s.lastMove.from} → ${s.lastMove.to}${entry && entry.enPassant ? ' ep' : ''}` : '?';
    return { snapIdx: i + 1, mover, label, mark, evalAfter: after };
  });

  const highlights = [];
  if (snap && snap.lastMove) {
    highlights.push({ square: snap.lastMove.from, color: HIGHLIGHT_FROM });
    highlights.push({ square: snap.lastMove.to, color: HIGHLIGHT_TO });
  }

  const exactEval = evalAt(bounded);
  const currentEval = exactEval !== null && exactEval !== undefined ? exactEval : nearestEval(bounded);
  // Squash white-positive pawn eval into a 0..100% bar position.
  const evalPct = 100 / (1 + Math.exp(-currentEval / 3));
  // The number lives in the bar's top band. The fill boundary must never
  // cross it (half-dark half-light digits): near-saturated fills clamp just
  // below the band, and only a truly total fill covers it — flipping the
  // digits to dark exactly when the band's background is white.
  const evalFillPct = evalPct >= 99.9 ? 100 : Math.min(evalPct, 96.5);
  const evalTextDark = evalFillPct >= 99.9;
  // Engine scores are mover-relative; show them white-positive to match the bar.
  const hintEvalWhite = (score) => (snap && snap.sideToMove === 'black' ? -score : score);
  // The three strongest moves as arrows: best is boldest, the others fade.
  const HINT_OPACITIES = [0.8, 0.38, 0.28];
  const hintArrows = (hints || [])
    .filter((m) => m.from && m.to && !m.castle)
    .map((m, i) => ({ from: m.from, to: m.to, opacity: HINT_OPACITIES[i] ?? 0.25 }));

  const orientation = game && game.user_side === 'black' ? 'black' : 'white';
  const bottomSide = orientation;
  const topSide = bottomSide === 'white' ? 'black' : 'white';
  const botOf = (side) => {
    const id = side === 'white' ? game && game.whiteName : game && game.blackName;
    return id ? getBotById(id) : null;
  };
  const nameOf = (side) => {
    const bot = botOf(side);
    if (bot) return bot.name;
    if (game && game.whiteName && side === 'white') return game.whiteName;
    if (game && game.blackName && side === 'black') return game.blackName;
    return side === bottomSide ? 'You' : (game && game.opponent) || 'Opponent';
  };
  const avatarOf = (side) => {
    const bot = botOf(side);
    if (!bot) return null;
    const initials = (bot.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return { initials, hue: bot.hue ?? 200, imageUrl: getBotAvatarUrl(bot), name: bot.name, tagline: bot.tagline || '' };
  };
  const ratingOf = (side) => {
    const bot = botOf(side);
    return bot && Number.isFinite(bot.rating) ? bot.rating : '????';
  };
  const headline = game && game.headline ? game.headline : game
    ? `vs ${game.opponent || 'unknown'}${game.opponent_rating ? ` (${game.opponent_rating})` : ''} · ${game.result || ''}`
    : '';

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      escapeToClose={false} // the keyboard-navigation effect above already handles Escape
      zIndex={1002}
      ariaLabelledBy="qc-review-title"
      backdropClassName="qc-review-backdrop"
      panelClassName="qc-review-panel"
      panelStyle={styles.panel}
    >
        <div style={styles.header}>
          <h2 id="qc-review-title" style={styles.title}>
            <Microscope size={18} color={theme.primary} /> Game Review
            <span style={styles.sub}>{headline}</span>
          </h2>
          <IconButton
            icon={XIcon} size={20} title="Close" ariaLabel="Close game review"
            className="qc-review-close" onClick={onClose} width={36} height={36} radius={8}
            bg={theme.secondary} color={theme.error} hoverInvert={true} shadow="transparent"
          />
        </div>

        {!timeline || snapshots.length <= 1 ? (
          <div style={{ fontSize: 13, color: theme.textSecondary, padding: 12 }}>
            This game has no replayable moves.
          </div>
        ) : (
          <>
            {timeline.incomplete ? (
              <div style={{ fontSize: 12, color: theme.textSecondary }}>
                This game was saved before full replay data was recorded — showing the
                first {snapshots.length - 1} moves.
              </div>
            ) : null}
            <div style={styles.content}>
              <div className="qc-review-board" style={styles.boardCol}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', justifyContent: 'center' }}>
                <div style={styles.evalBarVertical} title={`Eval ${formatEval(currentEval)} (white)`}>
                  <div style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, height: `${evalFillPct}%`,
                    background: '#e8e8e8', transition: 'height 200ms ease',
                    // follow the bar's rounding: bottom always, top only when total
                    borderRadius: evalTextDark ? 'inherit' : '0 0 7px 7px',
                  }} />
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '50%', height: 1,
                    background: 'rgba(120,120,120,0.8)',
                  }} />
                  <span style={styles.evalBarNumber(evalTextDark)}>{exactEval === null ? '…' : formatEval(currentEval)}</span>
                </div>
                <div style={{ width: 'min(60vmin, 440px)', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PlayerBar
                  side={topSide}
                  playerName={nameOf(topSide)}
                  rating={ratingOf(topSide)}
                  avatar={avatarOf(topSide)}
                  tagline={avatarOf(topSide) ? avatarOf(topSide).tagline : null}
                  playerBarColors={{ background: '#000', text: '#fff' }}
                  svgStyles={pieceSvgStyles || { white: {}, black: {} }}
                  showClock={false}
                  capturedPawns={capturedOf(snap.pieces, topSide === 'white' ? 'black' : 'white', true)}
                  capturedOthers={capturedOf(snap.pieces, topSide === 'white' ? 'black' : 'white', false)}
                />
                <Board
                  orientation={orientation}
                  showCoordinates={false}
                  highlights={highlights}
                  arrows={hintArrows}
                  pieces={snap.pieces}
                  indicators={indicators}
                  maxVisualSize="100%"
                  borderColor="transparent"
                  shadow="rgba(0, 0, 0, 0.15)"
                  pieceSvgStyles={pieceSvgStyles}
                  squareColors={squareColors}
                  ariaLabel="Review board"
                />
                <PlayerBar
                  side={bottomSide}
                  playerName={nameOf(bottomSide)}
                  rating={ratingOf(bottomSide)}
                  avatar={avatarOf(bottomSide)}
                  tagline={avatarOf(bottomSide) ? avatarOf(bottomSide).tagline : null}
                  playerBarColors={{ background: '#000', text: '#fff' }}
                  svgStyles={pieceSvgStyles || { white: {}, black: {} }}
                  showClock={false}
                  capturedPawns={capturedOf(snap.pieces, bottomSide === 'white' ? 'black' : 'white', true)}
                  capturedOthers={capturedOf(snap.pieces, bottomSide === 'white' ? 'black' : 'white', false)}
                />
                </div>
                </div>
              </div>

              <div className="qc-review-side" style={styles.sideCol}>
                <div>
                  <div style={styles.hintHead}>
                    <Sparkles size={13} strokeWidth={2.5} />
                    {snap.gameOver ? 'Final position' : hints && hints.length ? 'Engine suggests' : 'Engine is thinking…'}
                  </div>
                  <div style={styles.hintBox}>
                    {snap.gameOver ? (
                      <span>
                        {snap.gameOverReason}
                        {snap.winner ? ` — ${snap.winner} wins` : ''}.
                      </span>
                    ) : hints && hints.length ? (
                      <span>
                        {hints.map((m, i) => (
                          <span key={`hint-${i}`} style={{ display: 'block', opacity: i === 0 ? 1 : 0.65 }}>
                            {`${i + 1}. `}
                            <strong>{describeHintMove(m)}</strong>
                            {Number.isFinite(m.score) ? ` · ${formatEval(hintEvalWhite(m.score))}` : ''}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.6 }}>scanning the position…</span>
                    )}
                  </div>
                </div>
                <div className="qc-review-moves" style={styles.moveList}>
                  <div
                    style={{ ...styles.moveCell(bounded === 0), gridColumn: '1 / -1' }}
                    onClick={() => setIdx(0)}
                    role="button" tabIndex={0}
                  >
                    <span style={{ flex: 1 }}>Starting position</span>
                  </div>
                  {rowsToPairs(rows).map((pair) => (
                    <React.Fragment key={`mv-${pair.moveNo}`}>
                      <span style={styles.moveNo}>{pair.moveNo}.</span>
                      {[pair.white, pair.black].map((r, col) => (r ? (
                        <div
                          key={`cell-${r.snapIdx}`}
                          className="qc-review-move-row"
                          style={styles.moveCell(bounded === r.snapIdx)}
                          onClick={() => setIdx(r.snapIdx)}
                          role="button" tabIndex={0}
                        >
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                          <span style={styles.mark(r.mark)}>{r.mark}</span>
                          <span style={{ color: theme.textSecondary, minWidth: 38, textAlign: 'right' }}>{r.evalAfter === null ? '…' : formatEval(r.evalAfter)}</span>
                        </div>
                      ) : (
                        <span key={`cell-empty-${pair.moveNo}-${col}`} />
                      )))}
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.5 }}>
                  ? = mistake, ?? = blunder (eval drop for the mover). Evals are
                  the engine's static judgment, positive is better for white.
                  Use ← → to step through moves.
                </div>
                {showEvalGraph ? (
                  <EvalTraceGraph
                    trace={graphTrace}
                    count={snapshots.length}
                    idx={bounded}
                    onSeek={setIdx}
                    pendingCount={graphPending}
                    deepening={graphDeepening}
                    lineTier={lineTier}
                  />
                ) : null}
              </div>
            </div>
            <div style={styles.nav}>
              <span style={{ fontSize: 12, color: theme.textSecondary, marginRight: 8 }}>
                Move {bounded} / {snapshots.length - 1}
              </span>
              <IconButton icon={SkipBack} size={16} title="Start" ariaLabel="Jump to start" onClick={() => setIdx(0)} width={34} height={30} radius={7} bg={theme.secondary} color={theme.textPrimary} hoverInvert shadow="transparent" />
              <IconButton icon={ChevronLeft} size={18} title="Previous move" ariaLabel="Previous move" onClick={() => setIdx((i) => Math.max(0, i - 1))} width={40} height={30} radius={7} bg={theme.secondary} color={theme.textPrimary} hoverInvert shadow="transparent" />
              <IconButton icon={ChevronRight} size={18} title="Next move" ariaLabel="Next move" onClick={() => setIdx((i) => Math.min(snapshots.length - 1, i + 1))} width={40} height={30} radius={7} bg={theme.secondary} color={theme.textPrimary} hoverInvert shadow="transparent" />
              <IconButton icon={SkipForward} size={16} title="End" ariaLabel="Jump to end" onClick={() => setIdx(snapshots.length - 1)} width={34} height={30} radius={7} bg={theme.secondary} color={theme.textPrimary} hoverInvert shadow="transparent" />
            </div>
          </>
        )}
    </ModalShell>
  );
}
