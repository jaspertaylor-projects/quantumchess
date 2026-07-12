// frontend/tests/engine-bench.mjs
// Purpose: Engine performance benchmark — the measurement side of the
// bitmask/journal rewrite. Replays the 13 fixture games to build a corpus of
// real positions (opening / midgame / endgame), then times each hot layer in
// isolation (generateLegalReplies, applyQuantumConstraints, evaluatePosition)
// plus full fixed-depth searches, and reports nodes/sec. Results can be saved
// and compared:
//   docker exec quantumchess-frontend-1 node tests/engine-bench.mjs --save baseline
//   docker exec quantumchess-frontend-1 node tests/engine-bench.mjs --compare baseline
// Deterministic corpus (fixtures + fixed sample plies); timings vary with the
// machine, ratios are what matter.
// Imports From: ../src/review/replayCore.js, ../src/chessboard/quantumEngine.js,
//   ../src/ai/alphaBetaEngine.js, ./fixtures/engine-games.json
// Exported To: None (CLI)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReviewTimeline } from '../src/review/replayCore.js';
import {
  applyQuantumConstraints,
  clonePieces,
  generateLegalReplies,
} from '../src/chessboard/quantumEngine.js';
import { evaluatePosition, searchBestMove } from '../src/ai/alphaBetaEngine.js';
import { packBoard, snapshotWords, BLACK } from '../src/ai/fast/fastBoard.js';
import { forEachLegalReply } from '../src/ai/fast/fastRules.js';
import { applyConstraintsFast } from '../src/ai/fast/fastConservation.js';
import { evaluateFast } from '../src/ai/fast/fastEval.js';
import { searchBestMoveFast, epFromLastMove } from '../src/ai/fast/fastSearch.js';
import { DEFAULT_WEIGHTS } from '../src/ai/alphaBetaEngine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(HERE, 'fixtures/engine-games.json'), 'utf8'));

// --- Corpus: sample real positions from the fixture replays ---
// Fixed plies so the corpus is identical run-to-run and phase-labelled.
const SAMPLE_PLIES = [4, 8, 14, 22, 32, 44, 58, 72, 90];
function phaseOfPly(ply) {
  if (ply <= 10) return 'opening';
  if (ply <= 44) return 'midgame';
  return 'endgame';
}

function buildCorpus() {
  const corpus = [];
  for (const { seed, moves } of fixtures) {
    const { snapshots } = buildReviewTimeline(moves);
    for (const ply of SAMPLE_PLIES) {
      const snap = snapshots[ply];
      if (!snap || snap.gameOver) continue;
      const entry = {
        id: `seed${seed}@${ply}`,
        phase: phaseOfPly(ply),
        pieces: snap.pieces,
        sideToMove: snap.sideToMove,
        lastMove: snap.lastMove,
      };
      entry.bd = packBoard(snap.pieces);
      entry.sideBit = snap.sideToMove === 'black' ? BLACK : 0;
      entry.ep = epFromLastMove(entry.bd, snap.lastMove);
      corpus.push(entry);
    }
  }
  return corpus;
}

// --- Timing helpers ---
function timeLoop(fn, { minMs = 800, minIters = 3 } = {}) {
  // Warmup
  fn();
  let iters = 0;
  let out = 0;
  const t0 = performance.now();
  let elapsed = 0;
  while (elapsed < minMs || iters < minIters) {
    out += fn();
    iters += 1;
    elapsed = performance.now() - t0;
  }
  return { msPerIter: elapsed / iters, iters, unitsPerIter: out / iters, totalMs: elapsed };
}

const fmt = (n, d = 1) => Number(n.toFixed(d));

function benchLayer(name, corpus, run) {
  const perPhase = {};
  for (const phase of ['opening', 'midgame', 'endgame']) {
    const positions = corpus.filter((c) => c.phase === phase);
    if (positions.length === 0) continue;
    const r = timeLoop(() => {
      let units = 0;
      for (const pos of positions) units += run(pos);
      return units;
    });
    perPhase[phase] = {
      positions: positions.length,
      msPerPosition: fmt(r.msPerIter / positions.length, 3),
      callsPerSec: fmt(positions.length / (r.msPerIter / 1000), 0),
      unitsPerIter: fmt(r.unitsPerIter, 0),
    };
  }
  return { name, perPhase };
}

// --- Search benchmark: fixed depth, no variety/noise/adaptive, huge budget ---
const SEARCH_POSITIONS = [
  'seed1@8', 'seed1@32', 'seed1@72',
  'seed2@8', 'seed2@32', 'seed2@72',
];
const SEARCH_CFG = { maxDepth: 3, widths: [20, 12, 8], timeMs: 300000, noise: 0 };

function benchSearch(corpus, searchFn) {
  const results = [];
  for (const id of SEARCH_POSITIONS) {
    const pos = corpus.find((c) => c.id === id);
    if (!pos) continue;
    const t0 = performance.now();
    const res = searchFn({
      pieces: clonePieces(pos.pieces),
      sideToMove: pos.sideToMove,
      lastMove: pos.lastMove,
      bot: { search: SEARCH_CFG },
      openingVariety: false,
      adaptiveDepth: false,
    });
    const ms = performance.now() - t0;
    results.push({
      id,
      phase: pos.phase,
      ms: fmt(ms, 0),
      nodes: res.nodes,
      nodesPerSec: fmt(res.nodes / (ms / 1000), 0),
      depth: res.depth,
      score: fmt(res.score, 4),
      move: res.move ? { type: res.move.type, from: res.move.from ?? null, to: res.move.to ?? null } : null,
    });
    process.stderr.write(`  search ${id}: ${fmt(ms, 0)}ms, ${res.nodes} nodes\n`);
  }
  return results;
}

// --- Main ---
function main() {
  const args = process.argv.slice(2);
  const saveIdx = args.indexOf('--save');
  const cmpIdx = args.indexOf('--compare');
  const saveName = saveIdx >= 0 ? args[saveIdx + 1] : null;
  const cmpName = cmpIdx >= 0 ? args[cmpIdx + 1] : null;

  process.stderr.write('building corpus from fixture replays...\n');
  const corpus = buildCorpus();
  process.stderr.write(`corpus: ${corpus.length} positions\n`);

  const layers = [
    benchLayer('generateLegalReplies', corpus, (pos) =>
      generateLegalReplies(pos.pieces, pos.sideToMove, 0, pos.lastMove).length),
    benchLayer('fast:legalReplies', corpus, (pos) => {
      let n = 0;
      forEachLegalReply(pos.bd, pos.sideBit, pos.ep, () => { n += 1; });
      return n;
    }),
    benchLayer('applyQuantumConstraints', corpus, (pos) => {
      applyQuantumConstraints(pos.pieces);
      return 1;
    }),
    benchLayer('fast:constraints', corpus, (pos) => {
      applyConstraintsFast(pos.bd);
      return 1;
    }),
    benchLayer('evaluatePosition', corpus, (pos) => {
      evaluatePosition(pos.pieces);
      return 1;
    }),
    benchLayer('fast:evaluate', corpus, (pos) => {
      evaluateFast(pos.bd, DEFAULT_WEIGHTS);
      return 1;
    }),
  ];
  for (const layer of layers) {
    process.stderr.write(`${layer.name}:\n`);
    for (const [phase, r] of Object.entries(layer.perPhase)) {
      process.stderr.write(`  ${phase.padEnd(8)} ${String(r.msPerPosition).padStart(9)} ms/pos  (${r.callsPerSec}/s)\n`);
    }
  }

  process.stderr.write('search REFERENCE (depth 3, widths [20,12,8]):\n');
  const search = benchSearch(corpus, searchBestMove);
  process.stderr.write('search FAST (same config):\n');
  const searchFast = benchSearch(corpus, searchBestMoveFast);

  const report = {
    when: new Date().toISOString(),
    corpusPositions: corpus.length,
    layers,
    search,
    searchFast,
    searchTotals: {
      ms: fmt(search.reduce((a, s) => a + s.ms, 0), 0),
      nodes: search.reduce((a, s) => a + s.nodes, 0),
      fastMs: fmt(searchFast.reduce((a, s) => a + s.ms, 0), 0),
      fastNodes: searchFast.reduce((a, s) => a + s.nodes, 0),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (saveName) {
    const dir = join(HERE, 'bench');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${saveName}.json`), JSON.stringify(report, null, 2));
    process.stderr.write(`saved to tests/bench/${saveName}.json\n`);
  }

  if (cmpName) {
    const base = JSON.parse(readFileSync(join(HERE, 'bench', `${cmpName}.json`), 'utf8'));
    process.stderr.write(`\n--- vs ${cmpName} ---\n`);
    for (const layer of layers) {
      const bl = base.layers.find((l) => l.name === layer.name);
      if (!bl) continue;
      for (const [phase, r] of Object.entries(layer.perPhase)) {
        const b = bl.perPhase[phase];
        if (!b) continue;
        process.stderr.write(`${layer.name}/${phase}: ${fmt(b.msPerPosition / r.msPerPosition, 2)}x\n`);
      }
    }
    const bms = base.searchTotals.ms;
    process.stderr.write(`search total: ${fmt(bms / report.searchTotals.ms, 2)}x  (${bms}ms -> ${report.searchTotals.ms}ms)\n`);
  }
}

main();
