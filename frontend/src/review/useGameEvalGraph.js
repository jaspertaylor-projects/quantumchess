// frontend/src/review/useGameEvalGraph.js
// Purpose: Whole-game eval computation for the review modal (dev/mined
// games): a small worker pool walks the snapshots in coarse-to-fine stride
// passes so a rough curve appears in seconds, then deeper passes re-resolve
// every point — the modal never waits on it. Depth pairs are parity-matched
// (white-to-move even, black-to-move odd: every lookahead ends after a Black
// move) because a fixed depth flips who-moved-last each ply and saws the
// curve. Extracted from ReviewModal.jsx.
// Imports From: ../ai/aiWorker.js (as a Worker)
// Exported To: ./ReviewModal.jsx

import { useEffect, useMemo, useState } from 'react';
import { cacheEval, getCachedEvals } from './evalCache.js';

// Display STAGES, not raw tiers: white and black plies are trustworthy at
// different depths (white d2 pairs with black d3 — nested searches), so the
// curve/list upgrade wholesale through stages:
//   S1 white:fast + black:mid -> S2 both:mid -> S3 both:deep.
// Within a stage every value is on a declared ruler; a ply ahead of its
// stage shows its stage value, never a mixed one.
const STAGES = [
  { name: 'd6/d5', white: 'deep', black: 'deep' },
  { name: 'd4/d3', white: 'mid', black: 'mid' },
  { name: 'd2/d3', white: 'fast', black: 'mid' },
];

export default function useGameEvalGraph({ open, showEvalGraph, timeline, snapshots }) {
  const [graphTrace, setGraphTrace] = useState([]);
  const [graphPending, setGraphPending] = useState(0);
  const [graphDeepening, setGraphDeepening] = useState(false); // false | 'd4/d3' | 'd6/d5'

  useEffect(() => {
    if (!open || !showEvalGraph || !timeline || timeline.snapshots.length <= 1) return undefined;
    const snaps = timeline.snapshots;
    // Seed every ply that a previous session (or another game passing through
    // the same positions) already resolved — a reopened review draws its full
    // curve instantly and only re-searches what's missing.
    const seeded = [];
    snaps.forEach((snap, k) => {
      if (snap.gameOver) return;
      const cached = getCachedEvals(snap.positionSig);
      if (cached) seeded.push({ ply: k, side: snap.sideToMove, vals: { ...cached } });
    });
    setGraphTrace(seeded);
    setGraphDeepening(false);
    let stopped = false;
    // EVERY ply gets a value: an unsampled ply would fall back to a
    // different ruler (static eval), and mixed rulers saw the move list —
    // material counted before the search's discounting made White's moves
    // look like they improved the eval.
    const jobs = [];
    let nextId = 0;
    // Root beams are FULL WIDTH on the deep passes: a pruned root move is
    // exactly how a false "eval jumped after the move" seam gets drawn.
    // Root width 176 = never truncate: these midgames reach 60-80 legal
    // moves, and a root-pruned move is a phantom seam in the curve (found
    // the hard way: d1->d7 pruned at root width 40 drew 0.8 where the true
    // matched-tier value was 3.45).
    const PHASES = {
      fast: { tier: 'fast', depthW: 2, depthB: 1, widths: [176, 8, 6], timeMs: 8000, deep: false },
      mid: { tier: 'mid', depthW: 4, depthB: 3, widths: [176, 12, 8, 6], timeMs: 20000, deep: true },
      deep: { tier: 'deep', depthW: 6, depthB: 5, widths: [176, 12, 8, 6, 5, 4], timeMs: 45000, deep: true },
    };
    // Staged by side: white plies at d2 land in seconds; black plies go
    // straight to d3 (a d1 black eval is blind to the threat the next d2
    // point sees, and d3-black NESTS into d2-white searches, so those pairs
    // read exactly consistently); then white upgrades to d4, then the deep
    // pass sweeps everything.
    const phasePlan = [
      { ...PHASES.fast, only: 'white' },
      { ...PHASES.mid, only: 'black' },
      { ...PHASES.mid, only: 'white' },
      { ...PHASES.deep, only: null },
    ];
    for (const phase of phasePlan) {
      const seen = new Set();
      for (const stride of [8, 4, 2, 1]) {
        for (let k = 0; k < snaps.length; k += stride) {
          if (seen.has(k)) continue;
          if (phase.only && snaps[k] && snaps[k].sideToMove !== phase.only) continue;
          seen.add(k);
          // Already resolved at this tier (this session or a persisted one).
          const cached = snaps[k] ? getCachedEvals(snaps[k].positionSig) : null;
          if (cached && cached[phase.tier] !== undefined) continue;
          jobs.push({ id: nextId++, k, tier: phase.tier, depthW: phase.depthW, depthB: phase.depthB, widths: phase.widths, timeMs: phase.timeMs, deep: phase.deep });
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
      state.depthAsked = snap.sideToMove === 'white' ? job.depthW : job.depthB;
      worker.postMessage({
        type: 'bestScore',
        id: job.id,
        payload: {
          pieces: snap.pieces,
          sideToMove: snap.sideToMove,
          lastMove: snap.lastMove || null,
          depth: state.depthAsked,
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
        if (d.type !== 'bestScore' || !state.job || d.id !== state.job.id) return;
        const job = state.job;
        if (Number.isFinite(d.score) && d.depth >= state.depthAsked) {
          const side = snaps[job.k].sideToMove;
          const v = Number((side === 'white' ? d.score : -d.score).toFixed(2));
          cacheEval(snaps[job.k].positionSig, job.tier, v);
          setGraphTrace((t) => {
            const prev = t.find((p) => p.ply === job.k);
            const point = { ply: job.k, side, vals: { ...(prev ? prev.vals : {}), [job.tier]: v } };
            return [...t.filter((p) => p.ply !== job.k), point];
          });
          setGraphPending((n) => Math.max(0, n - 1));
        } else if ((job.retries || 0) < 2) {
          // Timeout: retry AT THE FRONT with a doubled budget. At the back
          // it would queue behind whole deeper phases and the ply would
          // starve for many minutes — a '…' that outlives the user's
          // patience. Bounded retries keep this from livelocking.
          jobs.unshift({ ...job, id: nextId++, retries: (job.retries || 0) + 1, timeMs: job.timeMs * 2 });
        } else {
          // Two retries exhausted: give up on this tier for the ply; a
          // deeper phase may still supply its stage value.
          setGraphPending((n) => Math.max(0, n - 1));
        }
        takeJob(worker, state);
      };
      worker.onerror = () => { setGraphPending((n) => Math.max(0, n - 1)); takeJob(worker, state); };
      workers.push(worker);
      takeJob(worker, state);
    }
    return () => { stopped = true; workers.forEach((w) => w.terminate()); };
  }, [open, showEvalGraph, timeline]);

  const stage = useMemo(() => {
    const complete = (st) => graphTrace.length
      && graphTrace.every((p) => p.vals[st[p.side]] !== undefined);
    return STAGES.find(complete) || STAGES[STAGES.length - 1];
  }, [graphTrace]);
  const lineTier = stage.name; // label for the graph badge

  // Per-point resolution: the stage tier, else the point's own DEEPER value
  // (a retry-exhausted ply borrows its more accurate future rather than
  // holding a '…' hostage; never a shallower one).
  const resolvePoint = (p) => {
    const order = { fast: 0, mid: 1, deep: 2 };
    const want = stage[p.side];
    let v = p.vals[want];
    for (const t of ['mid', 'deep']) {
      if (v === undefined && order[t] > order[want]) v = p.vals[t];
    }
    return v;
  };
  const graphVals = useMemo(() => {
    const m = new Map();
    for (const p of graphTrace) {
      const v = resolvePoint(p);
      if (v !== undefined) m.set(p.ply, v);
    }
    return m;
  }, [graphTrace, stage]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return { graphTrace, graphPending, graphDeepening, lineTier, resolvePoint, evalAt, nearestEval };
}
