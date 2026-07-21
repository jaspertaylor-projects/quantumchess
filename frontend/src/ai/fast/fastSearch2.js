// frontend/src/ai/fast/fastSearch2.js
// Purpose: The V2 search — the STRONG-BOT engine. PVS alpha-beta on the
// packed board with child-eval ordering (a move's zap/heal payload is
// invisible until resolved, so the one-ply eval of the RESOLVED child is the
// only ordering signal that works here), an ADAPTIVE beam (generous
// eval-ranked width, extended to include every child within 0.8 of the best
// — never a hard cutoff on a near-best move), late-move reductions inside
// the beam, revealed-King mate detection at terminal nodes, capture
// quiescence at the horizon, a Zobrist-keyed transposition table, aspiration
// windows, in-tree en passant, and in-line repetition scoring. No null-move
// pruning (quantum zugzwang breaks its assumption).
// V1 (fastSearch.js) STAYS: it is the certified reference twin, the easy
// tier, and the miner's engine — bot-vs-bot matches showed V1 stronger at
// sub-500ms budgets (V2's per-node overhead starves depth) while V2 wins
// from ~1s upward (+89 Elo at 1s, equal depth), which is where the medium
// and hard bots actually live.
// Correctness: V2 only composes the differentially-certified primitives
// (make/rollback, movegen, eval); strength is validated by
// tests/engine-match.mjs, not bit-equality.
// Imports From: ./fastBoard.js, ./fastRules.js, ./fastEval.js, ./fastSearch.js,
//   ../alphaBetaEngine.js (weights/config constants)
// Exported To: ../aiWorker.js, ../../../tests/engine-match.mjs

import {
  BLACK, ALGEBRAIC, TK, CAPTURED, sideBit,
  packBoard, unpackBoard, rollback, watermark, positionSignature, possibleOf,
  snapshotWords, wordsEqual, ZOB,
} from './fastBoard.js';
import {
  forEachLegalReply, collectCaptureCandidates,
  makeCandidate, epWindowAfter, lostInCheck,
} from './fastRules.js';
import { evaluateFast, MATE } from './fastEval.js';
import { epFromLastMove } from './fastSearch.js';
import { DEFAULT_WEIGHTS, DIFFICULTY_CONFIG } from '../alphaBetaEngine.js';

class SearchTimeout extends Error {}

const sideBitOf = (s) => (s === 'black' ? BLACK : 0);
const sideName = (b) => (b === BLACK ? 'black' : 'white');
const otherB = (b) => b ^ BLACK;
const signOf = (b) => (b === BLACK ? -1 : 1);

export function configuredBeamWidth(widths, ply, fallback) {
  const schedule = Array.isArray(widths) && widths.length ? widths : [];
  const configured = schedule.length ? schedule[Math.min(ply, schedule.length - 1)] : null;
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : fallback;
}

function madeMoveIsMate(bd, moverSide, desc) {
  const defender = otherB(moverSide);
  if (!lostInCheck(bd, defender)) return false;
  const childEp = epWindowAfter(bd, desc);
  let escaped = false;
  forEachLegalReply(bd, defender, childEp, () => {
    if (!lostInCheck(bd, defender)) escaped = true;
  });
  return !escaped;
}

// Collapse value of a victim (what a capture banks), by lowest non-king bit.
const VICTIM_VAL = [1, 3, 3.1, 5, 9, 0];
function victimValue(bd, idx) {
  const nonKing = possibleOf(bd.words[idx]) & ~TK;
  if (!nonKing) return 12; // pure-king capture ends the game — order first
  return VICTIM_VAL[31 - Math.clz32(nonKing & -nonKing)];
}

// --- Transposition table (module-level; survives across moves in a game) ---
const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const ttKeyLo = new Int32Array(TT_SIZE);
const ttKeyHi = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE); // 0 empty, 1 exact, 2 lower, 3 upper
const ttGenArr = new Uint8Array(TT_SIZE);
const ttScore = new Float64Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE); // candKey of the best move
let ttGen = 1; // bumps when the WEIGHTS change (scores are weight-relative)
let ttWSig = '';

const candKey = (desc) => (desc.kind << 11) | (desc.pieceIdx << 6) | desc.to;

// Mate scores are stored relative to the STORING node so they transpose.
const scoreToTT = (s, ply) => (s > MATE - 200 ? s + ply : s < -MATE + 200 ? s - ply : s);
const scoreFromTT = (s, ply) => (s > MATE - 200 ? s - ply : s < -MATE + 200 ? s + ply : s);

function nodeKey(bd, side, ep) {
  let lo = bd.hashLo;
  let hi = bd.hashHi;
  if (side === BLACK) { lo ^= ZOB.sideLo; hi ^= ZOB.sideHi; }
  if (ep) { lo ^= ZOB.epLo[ep.crossed]; hi ^= ZOB.epHi[ep.crossed]; }
  return { lo, hi };
}

// --- Search context ---
const MAX_PLY = 64;
function makeCtx(deadline, W, cfg) {
  return {
    deadline,
    nodes: 0,
    W,
    widths: Array.isArray(cfg.widths) && cfg.widths.length ? cfg.widths : [28, 24, 16, 12],
    adaptiveBeam: cfg.adaptiveBeam !== false,
    pathLo: new Int32Array(MAX_PLY + 8),
    pathHi: new Int32Array(MAX_PLY + 8),
    pathLen: 0,
  };
}


// --- Quiescence: captures only; stand-pat floor. Zap/heal cascades resolve
// inside every make, so capture lines carry the contact consequences.
function qsearch(bd, side, ply, alpha, beta, ctx, ep) {
  ctx.nodes += 1;
  if ((ctx.nodes & 63) === 0 && performance.now() > ctx.deadline) throw new SearchTimeout();

  const standPat = signOf(side) * evaluateFast(bd, ctx.W);
  if (standPat >= beta) return standPat;
  let best = standPat;
  if (standPat > alpha) alpha = standPat;
  if (ply >= MAX_PLY - 2) return standPat;

  const cands = collectCaptureCandidates(bd, side, ep);
  // MVV ordering: biggest victim first.
  for (const c of cands) c.ord = victimValue(bd, c.victimIdx);
  cands.sort((a, b) => b.ord - a.ord);

  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const mark = watermark(bd);
    if (!makeCandidate(bd, c)) { rollback(bd, mark); continue; }
    const childEp = epWindowAfter(bd, c);
    let s;
    try {
      s = -qsearch(bd, otherB(side), ply + 1, -beta, -alpha, ctx, childEp);
    } finally {
      rollback(bd, mark);
    }
    if (s > best) best = s;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// --- The main PVS node ---
function negamax2(bd, side, depth, ply, alpha, beta, ctx, ep) {
  ctx.nodes += 1;
  if ((ctx.nodes & 63) === 0 && performance.now() > ctx.deadline) throw new SearchTimeout();

  // Mate-distance pruning.
  if (alpha < -MATE + ply) alpha = -MATE + ply;
  if (beta > MATE - ply - 1) beta = MATE - ply - 1;
  if (alpha >= beta) return alpha;

  const { lo, hi } = nodeKey(bd, side, ep);

  // In-line repetition: a position already on the current path is a shuffle
  // — score it as dead-equal rather than searching in circles.
  for (let k = ctx.pathLen - 1; k >= 0; k -= 1) {
    if (ctx.pathLo[k] === lo && ctx.pathHi[k] === hi) return 0;
  }

  // TT probe.
  const idx = (lo ^ hi) & TT_MASK;
  let ttMoveKey = 0;
  if (ttGenArr[idx] === ttGen && ttKeyLo[idx] === lo && ttKeyHi[idx] === hi) {
    ttMoveKey = ttMove[idx];
    if (ttDepth[idx] >= depth) {
      const s = scoreFromTT(ttScore[idx], ply);
      const f = ttFlag[idx];
      if (f === 1) return s;
      if (f === 2 && s >= beta) return s;
      if (f === 3 && s <= alpha) return s;
    }
  }

  if (depth <= 0) return qsearch(bd, side, ply, alpha, beta, ctx, ep);

  // Child-eval ordering: in this game a move's payload (zaps, heals,
  // cascades) is INVISIBLE until resolved, so cheap descriptor heuristics
  // order badly and reductions on "quiet" moves prune the very tactics that
  // matter. Expanding every child once (make → eval → rollback, the V1 cost
  // model) buys the one ordering signal that works; the TT move still jumps
  // the queue. Ranked-late moves get REDUCED (and re-searched on fail-high),
  // never beam-excluded.
  const sign = signOf(side);
  const children = [];
  forEachLegalReply(bd, side, ep, (desc) => {
    const numeric = desc.kind === 'move'
      ? { kind: 0, pieceIdx: desc.pieceIdx, from: desc.from, to: desc.to, victimIdx: desc.victimIdx, plan: null }
      : desc.kind === 'enpassant'
        ? { kind: 1, pieceIdx: desc.pieceIdx, from: desc.from, to: desc.to, victimIdx: desc.victimIdx, plan: null }
        : { kind: 2, pieceIdx: desc.pieceIdx, from: desc.from, to: desc.to, victimIdx: -1, plan: desc.plan };
    children.push({
      desc: numeric,
      ev: sign * evaluateFast(bd, ctx.W),
      childEp: epWindowAfter(bd, numeric),
    });
  });
  if (children.length === 0) return lostInCheck(bd, side) ? -MATE + ply : 0;
  for (const c of children) c.ord = (candKey(c.desc) === ttMoveKey ? 1e6 : 0) + c.ev;
  children.sort((a, b) => b.ord - a.ord);

  // Adaptive beam: full width is unaffordable at quantum branching (the
  // expansion cost of EVERY interior node is ~branching makes), so search a
  // generous eval-ranked prefix — but never cut a child whose one-ply eval
  // sits within 0.8 of the best (the miss-the-best-move guard V1's hard
  // beam lacked). The default extension cap is 48; an explicitly wider bot
  // schedule remains wider.
  const width = configuredBeamWidth(ctx.widths, ply, ply <= 1 ? 24 : ply === 2 ? 16 : 12);
  let limit = Math.min(children.length, width);
  const bestEv = children[0].ev;
  const adaptiveCap = Math.max(48, width);
  while (ctx.adaptiveBeam && limit < children.length && limit < adaptiveCap
    && children[limit].ev >= bestEv - 0.8) limit += 1;

  const origAlpha = alpha;
  let best = -Infinity;
  let bestKey = 0;
  let searched = 0;

  ctx.pathLo[ctx.pathLen] = lo;
  ctx.pathHi[ctx.pathLen] = hi;
  ctx.pathLen += 1;
  try {
    for (let i = 0; i < limit; i++) {
      const c = children[i];
      let s;
      // A mate-scored child is terminal, so no re-make is needed (V1's
      // shortcut, with mate distance).
      if (c.ev >= MATE - 100) s = MATE - (ply + 1);
      else if (c.ev <= -MATE + 100) s = -MATE + (ply + 1);
      else {
        const mark = watermark(bd);
        makeCandidate(bd, c.desc); // was legal during expansion
        try {
          if (searched === 0) {
            s = -negamax2(bd, otherB(side), depth - 1, ply + 1, -beta, -alpha, ctx, c.childEp);
          } else {
            // Rank-based LMR: the eval ordering is informed, so late rank
            // is a real signal — reduce, and re-search on fail-high.
            let red = 0;
            if (depth >= 3) red = (i >= 6 ? 1 : 0) + (i >= 16 ? 1 : 0) + (i >= 36 ? 1 : 0);
            else if (depth === 2 && i >= 10) red = 1;
            s = -negamax2(bd, otherB(side), depth - 1 - red, ply + 1, -alpha - 1e-4, -alpha, ctx, c.childEp);
            if (s > alpha && (red > 0 || s < beta)) {
              s = -negamax2(bd, otherB(side), depth - 1, ply + 1, -beta, -alpha, ctx, c.childEp);
            }
          }
        } finally {
          rollback(bd, mark);
        }
      }
      searched += 1;
      if (s > best) {
        best = s;
        bestKey = candKey(c.desc);
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  } finally {
    ctx.pathLen -= 1;
  }

  // TT store (depth-preferred replacement within the current generation).
  if (ttGenArr[idx] !== ttGen || ttDepth[idx] <= depth) {
    ttKeyLo[idx] = lo;
    ttKeyHi[idx] = hi;
    ttDepth[idx] = depth;
    ttScore[idx] = scoreToTT(best, ply);
    ttFlag[idx] = best <= origAlpha ? 3 : best >= beta ? 2 : 1;
    ttMove[idx] = bestKey;
    ttGenArr[idx] = ttGen;
  }
  return best;
}

// --- Public API: drop-in for searchBestMove (worker 'think' path) ---
export function searchBestMoveV2({
  pieces,
  sideToMove,
  difficulty = 'medium',
  bot = null,
  lastMove = null,
  onDepthComplete = null,
  repetitionSigs = null,
  openingVariety = true,
  adaptiveDepth = true, // accepted for compat; V2's clock handles depth
}) {
  void adaptiveDepth;
  const base = DIFFICULTY_CONFIG[(bot && bot.tier) || difficulty] || DIFFICULTY_CONFIG.medium;
  const cfg = { ...base, ...((bot && bot.search) || {}) };
  const W = { ...DEFAULT_WEIGHTS, ...((bot && bot.weights) || {}) };

  // Weight change invalidates the TT (scores are weight-relative).
  const wSig = JSON.stringify(W);
  if (wSig !== ttWSig) {
    ttWSig = wSig;
    ttGen = (ttGen + 1) & 0xff;
    if (ttGen === 0) { ttGen = 1; ttGenArr.fill(0); } // wrapped: flush stale gens
  }

  const bd = packBoard(pieces);
  const rootWords = bd.debug ? snapshotWords(bd) : null;
  const side = sideBitOf(sideToMove);
  const ep = epFromLastMove(bd, lastMove);

  // Opening variety — identical to V1/reference.
  const sideMoveCount = pieces.reduce((n, p) => (p.side === sideToMove ? n + (p.moveCount || 0) : n), 0);
  const anyCaptures = pieces.some((p) => p.captured);

  // Root move list via the certified generator: legal moves + eval-ordered
  // baseline + repetition signatures. One full expansion (~ms) buys the V1
  // contract (depth-1 baseline, repPen, noise pool) unchanged.
  const sign = signOf(side);
  const rootMoves = [];
  forEachLegalReply(bd, side, ep, (desc) => {
    // forEachLegalReply descriptors carry string kinds; the V2 make/order
    // path uses the numeric encoding.
    const numeric = {
      ...desc,
      kind: desc.kind === 'move' ? 0 : desc.kind === 'enpassant' ? 1 : 2,
    };
    const entry = {
      desc: numeric,
      score: madeMoveIsMate(bd, side, numeric) ? MATE - 1 : sign * evaluateFast(bd, W),
    };
    if (repetitionSigs) entry.sig = positionSignature(bd, sideName(otherB(side)), null);
    rootMoves.push(entry);
  });

  if (openingVariety && sideMoveCount < 2 && !anyCaptures) {
    const mate = rootMoves.find((entry) => entry.score >= MATE - 100);
    if (mate) return { move: materializeRootMove(bd, mate.desc), score: mate.score, depth: 1, nodes: 0 };
    const quiet = rootMoves.filter(({ desc }) => {
      if (desc.kind !== 0 || desc.victimIdx >= 0) return false;
      const toRank = desc.to >> 3;
      return side === BLACK ? toRank >= 4 : toRank <= 3;
    });
    if (quiet.length > 0) {
      const pick = quiet[Math.floor(Math.random() * quiet.length)].desc;
      return { move: materializeRootMove(bd, pick), score: 0, depth: 0, nodes: 0 };
    }
  }

  if (rootMoves.length === 0) return { move: null, score: 0, depth: 0, nodes: 0 };
  rootMoves.sort((a, b) => b.score - a.score);

  const repCount = (sig) => {
    if (!repetitionSigs) return 0;
    const n = repetitionSigs instanceof Map ? repetitionSigs.get(sig) : repetitionSigs[sig];
    return n || 0;
  };
  const repWinning = Boolean(repetitionSigs) && rootMoves[0].score >= 1;
  const repPenOf = (entry) => {
    if (!repWinning) return 0;
    const n = repCount(entry.sig);
    return n >= 2 ? 50 : n === 1 ? 3 : 0;
  };
  for (const e of rootMoves) e.repPen = repPenOf(e);

  const deadline = performance.now() + cfg.timeMs;
  const ctx = makeCtx(deadline, W, cfg);

  // Depth-1 baseline (same contract as V1).
  let bestEntry = rootMoves.reduce((a, b) => (b.score - b.repPen > a.score - a.repPen ? b : a));
  let best = { desc: bestEntry.desc, score: bestEntry.score, depth: 1, nodes: 0 };
  const report = (b) => {
    if (typeof onDepthComplete === 'function') {
      onDepthComplete({ move: materializeRootMove(bd, b.desc), score: b.score, depth: b.depth, nodes: b.nodes });
    }
  };
  report(best);

  // The clock is the governor; depth cap is a generous backstop.
  const maxDepth = Math.min(MAX_PLY - 8, (cfg.maxDepth || 3) + 9);
  let prevScore = best.score;

  for (let depth = 2; depth <= maxDepth; depth++) {
    let completed = false;
    try {
      // Aspiration around the previous depth's score.
      let windowLo = 0.8;
      let windowHi = 0.8;
      for (;;) {
        const alpha0 = prevScore - windowLo;
        const beta0 = prevScore + windowHi;
        const r = searchRoot(bd, side, depth, alpha0, beta0, ctx, ep, rootMoves);
        if (r.score <= alpha0 && windowLo < 100) { windowLo *= 4; continue; }
        if (r.score >= beta0 && windowHi < 100) { windowHi *= 4; continue; }
        // Re-sort for the next iteration: searched scores first, stable.
        rootMoves.sort((a, b) => (b.iter ?? -Infinity) - (a.iter ?? -Infinity));
        best = { desc: r.desc, score: r.score, depth, nodes: ctx.nodes };
        prevScore = r.score;
        completed = true;
        break;
      }
    } catch (err) {
      if (err instanceof SearchTimeout) {
        rollback(bd, 0);
        break;
      }
      throw err;
    }
    if (completed) report(best);
    if (performance.now() > deadline) break;
    if (Math.abs(best.score) >= MATE - 100) break; // mate found — done
  }

  // Easy-mode noise (identical contract to V1).
  let chosenDesc = best.desc;
  if (cfg.noise > 0 && rootMoves.length > 1) {
    const byScore = [...rootMoves].sort((a, b) => (b.iter ?? b.score) - (a.iter ?? a.score));
    const jittered = byScore
      .slice(0, Math.min(6, byScore.length))
      .map((e) => ({ desc: e.desc, s: (e.iter ?? e.score) - e.repPen + (Math.random() - 0.5) * 2 * cfg.noise }))
      .sort((a, b) => b.s - a.s);
    chosenDesc = jittered[0].desc;
  }

  const move = materializeRootMove(bd, chosenDesc);
  if (rootWords && !wordsEqual(bd.words, rootWords)) throw new Error('fast engine v2: root state corrupted');
  return { move, score: best.score, depth: best.depth, nodes: ctx.nodes };

  // Root PVS over the (previous-iteration-ordered) legal root moves.
  function searchRoot(bd2, side2, depth2, alpha0, beta0, ctx2, ep2, entries) {
    let alpha = alpha0;
    let bestS = -Infinity;
    let bestE = entries[0];
    const { lo, hi } = nodeKey(bd2, side2, ep2);
    ctx2.pathLo[0] = lo;
    ctx2.pathHi[0] = hi;
    ctx2.pathLen = 1;
    // Root beam, same adaptive rule as interior nodes: generous prefix plus
    // every near-best entry (ordering comes from the previous iteration).
    const rootWidth = configuredBeamWidth(ctx2.widths, 0, 28);
    let rootLimit = Math.min(entries.length, rootWidth);
    const rootBestEv = entries[0].score;
    const adaptiveCap = Math.max(48, rootWidth);
    while (ctx2.adaptiveBeam && rootLimit < entries.length && rootLimit < adaptiveCap
      && (entries[rootLimit].iter ?? entries[rootLimit].score) >= rootBestEv - 0.8) rootLimit += 1;
    try {
      for (let i = 0; i < rootLimit; i++) {
        const e = entries[i];
        const mark = watermark(bd2);
        makeCandidate(bd2, e.desc); // root moves are known-legal
        const childEp = epWindowAfter(bd2, e.desc);
        let s;
        try {
          if (i === 0) {
            s = -negamax2(bd2, otherB(side2), depth2 - 1, 1, -beta0, -alpha, ctx2, childEp);
          } else {
            s = -negamax2(bd2, otherB(side2), depth2 - 1, 1, -alpha - 1e-4, -alpha, ctx2, childEp);
            if (s > alpha && s < beta0) {
              s = -negamax2(bd2, otherB(side2), depth2 - 1, 1, -beta0, -alpha, ctx2, childEp);
            }
          }
        } finally {
          rollback(bd2, mark);
        }
        e.iter = s;
        const adjusted = s - e.repPen;
        if (adjusted > bestS) {
          bestS = adjusted;
          bestE = e;
        }
        if (s > alpha) alpha = s;
        if (alpha >= beta0) break;
      }
    } finally {
      ctx2.pathLen = 0;
    }
    return { desc: bestE.desc, score: bestE.iter };
  }
}

// Materialize a root descriptor into the reference move shape, including
// resultPieces (same mechanics as fastSearch.js materializeMove).
function materializeRootMove(bd, desc) {
  const mark = watermark(bd);
  makeCandidate(bd, desc);
  const moveBumps = new Map([[desc.pieceIdx, 1]]);
  if (desc.kind === 2) moveBumps.set(desc.plan.i2, 1);
  const captureIndexFor = new Map();
  if (desc.victimIdx >= 0) captureIndexFor.set(desc.victimIdx, 0);
  // Lazy import avoided: unpackBoard comes from fastBoard.
  const resultPieces = unpackBoard(bd, { moveBumps, captureIndexFor });
  rollback(bd, mark);

  if (desc.kind === 2) {
    return {
      type: 'castle',
      plan: {
        piece1_id: bd.ids[desc.plan.i1],
        piece2_id: bd.ids[desc.plan.i2],
        piece1_from: ALGEBRAIC[desc.plan.from1],
        piece2_from: ALGEBRAIC[desc.plan.from2],
        piece1_to: ALGEBRAIC[desc.plan.to1],
        piece2_to: ALGEBRAIC[desc.plan.to2],
      },
      resultPieces,
    };
  }
  if (desc.kind === 1) {
    return { type: 'enpassant', from: ALGEBRAIC[desc.from], to: ALGEBRAIC[desc.to], victimId: bd.ids[desc.victimIdx], resultPieces };
  }
  return { type: 'move', from: ALGEBRAIC[desc.from], to: ALGEBRAIC[desc.to], resultPieces };
}
