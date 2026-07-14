// tools/miner/swing.mjs
// Purpose: The mistake-from-balance detector and par-line certifier —
// balance probes, deep swing analysis with perishability + size gates, the
// depth-stability confirm, the parPlies rollout in which every ply must stay
// quantum-tricky, per-game mining, and the deep verification gate. Split out
// of puzzle-miner.mjs.
// Imports From: ./config.mjs, ./gameplay.mjs, ./themes.mjs, ../../frontend/src/*
// Exported To: ../puzzle-miner.mjs

import {
  applyQuantumConstraints,
  clonePieces,
  computePositionSignature,
  generateLegalReplies,
} from '../../frontend/src/chessboard/quantumEngine.js';
import { countPossibilities } from '../../frontend/src/chessboard/advanceCore.js';
import { evaluatePosition } from '../../frontend/src/ai/alphaBetaEngine.js';
// Fast packed engine — verified bit-identical to alphaBetaEngine's search
// (frontend/tests/fastEngineDiff.test.js), ~13-17x faster mining.
import {
  analyzeRootMovesFast as analyzeRootMoves,
  searchBestMoveFast as searchBestMove,
} from '../../frontend/src/ai/fast/fastSearch.js';
import { CFG, PROBE_WIDTHS, MINE_WIDTHS, CONFIRM_WIDTHS, VERIFY_WIDTHS } from './config.mjs';
import { applyReply } from './gameplay.mjs';
import { simulateAnalysisMove, tagThemes, pieceInFlux, quantumBaseline, plyTrickiness } from './themes.mjs';

// ----------------------------------------------------------------- mining

function moveKey(m) {
  if (m.type === 'castle') return `castle:${m.plan.piece1_from}->${m.plan.piece1_to}+${m.plan.piece2_from}`;
  return `${m.type}:${m.from}->${m.to}`;
}

function positionSane(pieces) {
  const seen = new Set();
  for (const p of pieces) {
    if (p.captured) continue;
    if (!p.square || seen.has(p.square)) return false;
    seen.add(p.square);
  }
  const holders = (side) => pieces.filter((p) => !p.captured && p.side === side && (p.possibleTypes || []).includes('k')).length;
  return holders('white') > 0 && holders('black') > 0;
}

// Census fixed-point assertion carried over from the composed pipeline: a
// mined game state must already satisfy global type constraints. A failure
// here is an engine bug, not a bad puzzle — report loudly.
function censusFixed(pieces) {
  const sig = (ps) => ps.map((p) => `${p.id}:${(p.possibleTypes || []).join('')}`).sort().join('|');
  return sig(applyQuantumConstraints(clonePieces(pieces))) === sig(pieces);
}

function analyzePosition(position, depth, widths, timeMs) {
  return analyzeRootMoves({
    pieces: position.pieces,
    sideToMove: 'white',
    lastMove: position.lastMove,
    depth,
    widths,
    timeMs,
  });
}

// ------------------------------------------- swing detection (the mistake)

// Cheap depth-2 probe: the side-to-move's best-move score, normalized to
// WHITE-POSITIVE. Feeds the balance history and flags candidate swings
// (the dev viewer computes its own parity-matched graph client-side).
// Null on timeout (treated as "unknown" — it breaks the balance streak
// rather than lying).
function probeEval(position, stats, side = 'white') {
  const t0 = performance.now();
  // searchBestMove, not analyzeRootMoves: probes only need the BEST score,
  // and root-wide alpha pruning is ~6x cheaper at the same full root width
  // (measured 118s -> 18s on a 98-move position).
  const res = searchBestMove({
    pieces: position.pieces,
    sideToMove: side,
    lastMove: position.lastMove,
    bot: { search: { maxDepth: 2, widths: PROBE_WIDTHS, timeMs: CFG.probeMs, noise: 0 } },
  });
  stats.mineMsTotal += performance.now() - t0;
  if (!res || !res.move || res.depth < 2) { stats.prefilterTimeouts++; return { score: null, move: null }; }
  return { score: Number((side === 'white' ? res.score : -res.score).toFixed(2)), move: res.move };
}

// Spread stats over a full root analysis: how perishable is the advantage?
// best = the par move's eval; medianFrac = the share of it a lazy (median)
// move keeps. Low medianFrac = most moves leak the win = a real test.
function spreadOf(analysis) {
  const scores = analysis.moves.map((m) => m.score);
  const best = scores[0];
  const median = scores[Math.floor(scores.length / 2)];
  const medianFrac = best > 0 ? Number((Math.max(0, median) / best).toFixed(3)) : 1;
  return { best, median: Number(median.toFixed(2)), medianFrac, numChoices: scores.length };
}

// Did ANY piece regain an identity across this transition? Recoherence
// paying out mid-line is peak quantum — tagged as a 'recohere' theme, which
// feeds the trickiness theme bonus. (Recoherence merely IN FLIGHT — running
// clocks — is already part of the quantumBaseline via pieceInFlux.)
function regainedIdentity(before, after) {
  const lens = new Map(before.map((p) => [p.id, (p.possibleTypes || []).length]));
  return after.some((p) => !p.captured && p.square
    && (p.possibleTypes || []).length > (lens.get(p.id) ?? 99));
}

// Analyze one par ply: full root analysis (reused if the caller already has
// it), theme tags, spread, and per-ply trickiness.
// --- Instant-gauge eval tables ---
// The modal's gauge scores every root move at depth 3 / widths [176,12,8]
// (MinedPuzzleModal.jsx — the two rulers MUST stay in sync). Precompute that
// exact table for every white-to-move position on the certified line, keyed
// by position signature: the modal looks the current position up and, on a
// hit, loads certified evals instantly instead of running a 176-wide
// analyze in the browser. A miss (player diverged, or the live black reply
// differed from the recorded one) falls back to the worker as before.
const GAUGE_DEPTH = 3;
const GAUGE_WIDTHS = [176, 12, 8];

export function buildEvalTable(position) {
  const analysis = analyzeRootMoves({
    pieces: position.pieces,
    sideToMove: 'white',
    lastMove: position.lastMove || null,
    depth: GAUGE_DEPTH,
    widths: GAUGE_WIDTHS,
    timeMs: 120000,
  });
  if (!analysis || !analysis.moves.length) return null;
  const evals = {};
  for (const { move, score } of analysis.moves) {
    // Key format mirrors the modal's keyOf/worker mapping exactly:
    // castle keys by piece1's from>to, en passant appends 'ep'.
    const from = move.type === 'castle' ? move.plan.piece1_from : move.from;
    const to = move.type === 'castle' ? move.plan.piece1_to : move.to;
    const ep = move.type === 'enpassant';
    evals[`${from}>${to}${ep ? 'ep' : ''}`] = Number(score.toFixed(3));
  }
  return {
    sig: computePositionSignature(position.pieces, 'white', position.lastMove || null),
    evals,
  };
}

function parStep(rec, stats, analysis = null) {
  if (!analysis) {
    const t0 = performance.now();
    analysis = analyzePosition(rec, CFG.mineDepth, MINE_WIDTHS, CFG.mineMs);
    stats.mineMsTotal += performance.now() - t0;
    if (!analysis) { stats.timeouts++; return null; }
  }
  if (!analysis.moves.length) return null;
  const best = analysis.moves[0];
  const moveSim = simulateAnalysisMove(rec, best.move);
  if (!moveSim) return null;
  const themes = tagThemes(rec, moveSim);
  if (regainedIdentity(rec.pieces, moveSim.after)) themes.push('recohere');
  const staticSorted = [...analysis.moves]
    .map((m) => ({ key: moveKey(m.move), s: evaluatePosition(m.move.resultPieces) }))
    .sort((a, b) => b.s - a.s);
  const shallowRank = staticSorted.findIndex((m) => m.key === moveKey(best.move));
  const spread = spreadOf(analysis);
  const step = {
    ply: rec.ply,
    bestMove: { type: best.move.type, from: moveSim.from, to: moveSim.to, enPassant: moveSim.enPassant },
    parEval: Number(best.score.toFixed(2)),
    spread,
    numChoices: spread.numChoices,
    shallowRank,
    possDelta: countPossibilities(rec.pieces) - countPossibilities(moveSim.after),
    themes,
    analysisMove: best.move, // rolls the line forward (stripped on save)
    position: rec, // pieces/lastMove/captureCounter snapshot (stripped on save)
  };
  step.trickiness = plyTrickiness(step);
  return step;
}

// "First grab" (Jasper, 2026-07-13): the puzzle's first move takes the very
// piece Black just moved — "they hung it, take it". Sound but stale as a
// steady diet, so it's filtered as a puzzle START (forced recaptures deeper
// in the line are fine). Any capture landing on lastMove.to is that piece;
// en passant on the crossed square grabs the double-stepper. Re-enable for
// easy-Monday harvests with --allowFirstGrab. Subsumes the old
// isPlainRecapture (which only caught the collapsed-piece subcase).
function isFirstGrab(move, rec) {
  const lm = rec.lastMove;
  if (!lm || !move) return false;
  if (move.to === lm.to) return true;
  if (move.enPassant && lm.isDoubleStep && move.to === lm.crossedSquare) return true;
  return false;
}

// The mistake moment, certified end to end. Called on a white-to-move
// position whose preceding white-to-move probes were all balanced: probe →
// deep analysis (swing + perishability + size) → depth-stability confirm →
// a parPlies-long engine rollout in which EVERY ply must stay tricky and
// the line must stay quantum. Returns { probe, chain }.
function detectSwingChain(rec, preEval, stats, priorRec = null) {
  const { score: probe, move: probeMove } = probeEval(rec, stats);
  // Relaxed probe bar (depth-2 evals are noisy; a real swing must never die
  // in the funnel, mop-ups and quiet positions do).
  if (probe === null || probe < CFG.swingMin - 1) return { probe, chain: null };
  stats.funnelSurvivors++;

  // Size gate BEFORE the deep analysis: counting legal moves is ~30ms while
  // a wasted deep search on a 60-move position is minutes (seed-5 burned
  // both its deep-timeout budget slots on positions the gate would reject).
  const moveCount = generateLegalReplies(rec.pieces, 'white', rec.captureCounter, rec.lastMove).length;
  if (moveCount < CFG.minChoices || moveCount >= CFG.maxChoices) {
    stats.sizeRejects++;
    console.log(`  size-reject @ply ${rec.ply}: probe ${probe} but ${moveCount} legal moves (bar: ${CFG.minChoices}..${CFG.maxChoices - 1})`);
    return { probe, chain: null };
  }

  // Grab pre-filter BEFORE the deep analysis (Jasper, 2026-07-13): the
  // depth-2 probe's own best move is a cheap tell. If even the shallow
  // search wants to take the piece Black just moved, skip the minutes of
  // deep search — the authoritative post-analysis check below still guards
  // the cases where only the deep best is the grab.
  if (!CFG.allowFirstGrab && probeMove
    && isFirstGrab({ to: probeMove.to, enPassant: probeMove.type === 'enpassant' }, rec)) {
    stats.firstGrabPrefilter++;
    return { probe, chain: null };
  }

  const t0 = performance.now();
  const analysis = analyzePosition(rec, CFG.mineDepth, MINE_WIDTHS, CFG.mineMs);
  stats.mineMsTotal += performance.now() - t0;
  if (!analysis) { stats.timeouts++; return { probe, chain: null }; }
  const spread = spreadOf(analysis);
  if (spread.best < CFG.swingMin || spread.best - preEval < CFG.swingDelta) {
    stats.weakSwingRejects++;
    console.log(`  near-miss @ply ${rec.ply}: pre ${preEval} -> deep best ${spread.best.toFixed(2)} (need >=${CFG.swingMin} and jump >=${CFG.swingDelta})`);
    return { probe, chain: null };
  }
  if (spread.medianFrac >= CFG.perishFrac) { stats.perishRejects++; return { probe, chain: null }; }

  // Depth-stability confirm (the engine-as-referee guard from the only-move
  // era, kept): one depth deeper the swing must hold and the advantage must
  // still be perishable. A timeout is not evidence — the gate still rules.
  const confirm = analyzePosition(rec, CFG.mineDepth + 1, CONFIRM_WIDTHS, CFG.confirmMs);
  let confirmStatus = 'ok';
  if (!confirm) {
    stats.confirmTimeouts++;
    confirmStatus = 'timeout';
  } else {
    const cs = spreadOf(confirm);
    if (cs.best < CFG.swingMin * 0.8 || cs.medianFrac >= CFG.perishFrac + 0.15) {
      stats.confirmRejects++;
      return { probe, chain: null };
    }
  }
  stats.swings++;
  console.log(`  swing @ply ${rec.ply}: ${preEval} -> ${spread.best.toFixed(2)} after ${rec.lastMove.from}->${rec.lastMove.to}  medianFrac=${spread.medianFrac} confirm=${confirmStatus}`);

  // --- par line: exactly parPlies white moves, every ply interesting ---
  const steps = [];
  const blackReplies = [];
  let endsInMate = false;
  let replyActivity = false;
  let replyRecohere = false;
  let state = {
    pieces: rec.pieces,
    sideToMove: 'white',
    captureCounter: rec.captureCounter,
    lastMove: rec.lastMove,
    halfmoveClock: 0,
  };
  let curRec = rec;
  let curAnalysis = analysis;
  for (let k = 0; k < CFG.parPlies; k++) {
    const step = parStep(curRec, stats, curAnalysis);
    curAnalysis = null;
    if (!step) return { probe, chain: null };
    if (k === 0 && !CFG.allowFirstGrab && isFirstGrab(step.bestMove, rec)) { stats.filteredRecapture++; return { probe, chain: null }; }
    if (k > 0 && step.numChoices < CFG.minChoices) { stats.sizeRejects++; return { probe, chain: null }; }
    if (step.trickiness < CFG.minPlyTrick) { stats.dullRejects++; return { probe, chain: null }; }
    steps.push(step);

    const afterWhite = applyReply(state, step.analysisMove);
    if (!afterWhite) return { probe, chain: null };
    if (afterWhite.gameOver) {
      endsInMate = afterWhite.reason === 'checkmate';
      // Mate ON the final par move is a complete 3-mover; earlier means the
      // line is shorter than the format — reject, all puzzles are 3-movers.
      if (k < CFG.parPlies - 1) { stats.shortLineRejects++; return { probe, chain: null }; }
      break;
    }
    state = afterWhite.state;
    if (k === CFG.parPlies - 1) break;

    const blackAnalysis = analyzeRootMoves({
      pieces: state.pieces,
      sideToMove: 'black',
      lastMove: state.lastMove,
      depth: CFG.mineDepth,
      widths: MINE_WIDTHS,
      timeMs: CFG.mineMs,
    });
    if (!blackAnalysis || !blackAnalysis.moves.length) { stats.shortLineRejects++; return { probe, chain: null }; }
    const replyMove = blackAnalysis.moves[0].move;
    const beforeReply = state.pieces;
    const afterBlack = applyReply(state, replyMove);
    if (!afterBlack) return { probe, chain: null };
    if (countPossibilities(afterBlack.state.pieces) < countPossibilities(beforeReply)) replyActivity = true;
    if (regainedIdentity(beforeReply, afterBlack.state.pieces)) replyRecohere = true;
    blackReplies.push({
      type: replyMove.type,
      from: replyMove.type === 'castle' ? replyMove.plan.piece1_from : replyMove.from,
      to: replyMove.type === 'castle' ? replyMove.plan.piece1_to : replyMove.to,
    });
    if (afterBlack.gameOver) { stats.shortLineRejects++; return { probe, chain: null }; }
    state = afterBlack.state;

    curRec = {
      ply: rec.ply + 2 * (k + 1),
      rollout: true,
      sideToMove: 'white',
      pieces: clonePieces(state.pieces),
      captureCounter: state.captureCounter,
      lastMove: state.lastMove,
      played: null,
    };
    if (!positionSane(curRec.pieces) || !censusFixed(curRec.pieces)) { stats.censusBug++; return { probe, chain: null }; }
  }

  // Par must HOLD through the line (Jasper, 2026-07-13: a chain reported a
  // +3.44 swing whose own rollout ended at -2.13 — every later par eval sees
  // ~2 plies deeper, so a collapsing line means the swing was shallow-search
  // noise, not a mistake). Each white-to-move par eval along the line must
  // keep a real advantage; the deepest view is the most trusted one.
  const parFloor = CFG.parHoldFloor;
  if (steps.some((s) => s.parEval < parFloor)) {
    stats.parCollapseRejects++;
    return { probe, chain: null };
  }

  // Quantum-ness: cull lines where nothing collapses, decoheres, or
  // recoheres at any ply — classical puzzles in the wrong costume.
  const quantumActive = replyActivity || replyRecohere
    || steps.some((s) => (s.possDelta || 0) > 0 || s.themes.includes('recohere'));
  if (!quantumActive) { stats.filteredClassical++; return { probe, chain: null }; }

  const themes = [...new Set([...steps.flatMap((s) => s.themes), ...(replyRecohere ? ['recohere'] : [])])];
  const trickList = steps.map((s) => s.trickiness);
  const chain = {
    startPly: rec.ply,
    parPlies: steps.length,
    endsInMate,
    // Black's move that opened the door — the puzzle SHOWS this move.
    mistake: {
      from: rec.lastMove.from,
      to: rec.lastMove.to,
      evalBefore: preEval,
      evalAfter: steps[0].parEval,
      swing: Number((steps[0].parEval - preEval).toFixed(2)),
    },
    spread: steps[0].spread,
    parEvals: steps.map((s) => s.parEval),
    trickiness: steps[0].trickiness,
    trickMin: Math.min(...trickList),
    trickAvg: Number((trickList.reduce((a, b) => a + b, 0) / trickList.length).toFixed(2)),
    themes,
    steps: steps.map(({ position, analysisMove, ...s }) => s),
    blackReplies, // engine-best replies, matching the live product
    start: {
      pieces: rec.pieces,
      lastMove: rec.lastMove,
      captureCounter: rec.captureCounter,
      sideToMove: 'white',
    },
    // Position before the mistake. The puzzle intro holds this snapshot,
    // then replays the already-certified Black move into `start` so its
    // contact particles are visible before White is allowed to answer.
    intro: priorRec ? {
      pieces: clonePieces(priorRec.pieces),
      lastMove: priorRec.lastMove ? structuredClone(priorRec.lastMove) : null,
      captureCounter: priorRec.captureCounter,
      sideToMove: 'black',
    } : null,
    // One instant-gauge table per par position (start + each follow-up the
    // recorded line reaches) — see buildEvalTable.
    evalTables: steps.map((s) => buildEvalTable(s.position)).filter(Boolean),
    _verify: steps.map((s) => ({ parEval: s.parEval, position: s.position, plyIdx: steps.indexOf(s) })),
  };
  return { probe, chain };
}

function mineGame(game, stats) {
  const chains = [];
  // Probe EVERY white-to-move ply: the balance streak needs the history and
  // the dev game viewer graphs the full eval story of the game.
  const probes = []; // chronological white-to-move probe evals (null = unknown)
  const evals = []; // [{ ply, eval }] for the report/game viewer
  let balancedEligible = 0;
  let found = false;

  for (let recIdx = 0; recIdx < game.record.length; recIdx++) {
    const rec = game.record[recIdx];
    if (rec.sideToMove !== 'white') continue;
    if (!positionSane(rec.pieces)) { stats.insane++; continue; }
    if (!censusFixed(rec.pieces)) {
      stats.censusBug++;
      console.log(`  !! census fixed-point FAILED at game ${game.gameIdx} ply ${rec.ply} — engine bug candidate`);
      continue;
    }
    stats.scanned++;

    // The balance stretch may sit one probe back: two-ply mistakes (seed-3
    // near-misses: 1.0 -> 2.2 -> 4.2) put one developing, out-of-band value
    // between the stretch and the candidate. Core = the stretch; the newest
    // probe may be anything.
    const recent = probes.slice(-(CFG.balanceStreak + 1));
    const core = recent.slice(0, CFG.balanceStreak);
    const preBalanced = core.length >= CFG.balanceStreak
      && core.every((e) => e !== null && Math.abs(e) <= CFG.balanceBand);
    const classicalStart = !rec.pieces.some((p) => !p.captured && (p.possibleTypes || []).length > 1);
    if (classicalStart) stats.filteredClassical++;

    if (!found && rec.ply >= CFG.minPly && preBalanced && !classicalStart && rec.lastMove) {
      balancedEligible++;
      stats.balancedEligible++;
      const inBand = recent.filter((e) => e !== null && Math.abs(e) <= CFG.balanceBand);
      const preEval = inBand.length ? inBand[inBand.length - 1] : core[core.length - 1];
      const { probe, chain } = detectSwingChain(rec, preEval, stats, game.record[recIdx - 1] || null);
      probes.push(probe);
      if (probe !== null) evals.push({ ply: rec.ply, eval: probe, side: 'white' });
      if (chain) {
        chain.game = game.gameIdx;
        chain.white = game.white;
        chain.black = game.black;
        // Mirrored pass: this window was BLACK's in the real game; the saved
        // start state is the reflected board (the puzzle player still plays
        // White, as always).
        chain.mirrored = Boolean(game.mirrored);
        chains.push(chain);
        // The first accepted mistake ends this game's DETECTION (the story
        // of the game IS that moment) — probing continues for the graph.
        found = true;
      }
    } else {
      const { score: probe } = probeEval(rec, stats);
      probes.push(probe);
      if (probe !== null) evals.push({ ply: rec.ply, eval: probe, side: 'white' });
    }
  }

  console.log(`  probes: [${probes.map((e) => (e === null ? '?' : e.toFixed(1))).join(', ')}]  balanced-eligible: ${balancedEligible}`);
  return { chains, evals };
}

// -------------------------------------------------------------- verification

// Deep re-search of one par ply: the certified par eval must HOLD at a
// depth above confirm. A deeper search finding a BETTER line only raises
// par (recorded for curation; fidelity may exceed 100% in play) — the
// failure mode the gate exists for is par being an illusion of shallow
// search, i.e. the deep best falling clearly below the mined par.
function verifyParPly(entry, stats) {
  const t0 = performance.now();
  let best = null;
  let usedDepth = null;
  // Best-score search, not analyzeRootMoves: the verdict needs only the
  // best move's score, and root-wide alpha pruning is ~6x cheaper — which
  // is what makes depth 8 affordable (~20 min/ply vs ~2 h; Jasper asked
  // for the deeper gate 2026-07-13). Even depths stay parity-sober.
  for (let d = CFG.verifyDepth; d > CFG.mineDepth && !best; d--) {
    const res = searchBestMove({
      pieces: entry.position.pieces,
      sideToMove: 'white',
      lastMove: entry.position.lastMove,
      bot: { search: { maxDepth: d, widths: VERIFY_WIDTHS, timeMs: CFG.verifyMs, noise: 0 } },
      openingVariety: false,
      adaptiveDepth: false,
    });
    if (res && res.move && res.depth >= d) {
      best = res;
      usedDepth = d;
    }
  }
  stats.verifyMsTotal += performance.now() - t0;
  if (!best) return { verdict: 'timeout' };
  const parHolds = best.score >= entry.parEval - 1.0;
  const swingHolds = entry.plyIdx > 0 || best.score >= CFG.swingMin - 0.5;
  const mv = best.move;
  return {
    verdict: parHolds && swingHolds ? 'agree' : 'disagree',
    depth: usedDepth,
    deepBest: `${mv.type}:${mv.type === 'castle' ? mv.plan.piece1_from : mv.from || ''}->${mv.type === 'castle' ? mv.plan.piece1_to : mv.to || ''}`,
    deepBestScore: Number(best.score.toFixed(2)),
    parHolds, swingHolds,
  };
}

export { positionSane, censusFixed, analyzePosition, probeEval, mineGame, detectSwingChain, verifyParPly };
