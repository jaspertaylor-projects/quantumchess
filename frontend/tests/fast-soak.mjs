// frontend/tests/fast-soak.mjs
// Purpose: Random-game soak for the fast engine — plays seeded pseudo-random
// full games on the REFERENCE game path (advanceCore, real lastMove/en
// passant windows, terminal rules) and at EVERY position cross-checks the
// fast engine: identical legal-move lists (order + keys), identical resulting
// positions for every reply, bit-identical child evaluations, and clean
// journal rollback. Fresh trajectories reach states the 13 fixture games
// never visit (promotion storms, deep collapses, EP windows), so this is the
// wide net behind tests/fastEngineDiff.test.js.
//   docker exec quantumchess-frontend-1 node tests/fast-soak.mjs [games] [maxPlies]
// Exits nonzero on the first divergence with a full repro dump.
// Imports From: ../src/chessboard/advanceCore.js, ../src/chessboard/quantumEngine.js,
//   ../src/ai/*, ./fixtureUtil.mjs
// Exported To: None (CLI)

import { makeInitialSnapshot, advanceEntry } from '../src/chessboard/advanceCore.js';
import { generateLegalReplies } from '../src/chessboard/quantumEngine.js';
import { evaluatePosition, DEFAULT_WEIGHTS } from '../src/ai/alphaBetaEngine.js';
import {
  packBoard, unpackBoard, snapshotWords, wordsEqual, setFastDebug, ALGEBRAIC, BLACK,
} from '../src/ai/fast/fastBoard.js';
import { forEachLegalReply } from '../src/ai/fast/fastRules.js';
import { evaluateFast } from '../src/ai/fast/fastEval.js';
import { epFromLastMove } from '../src/ai/fast/fastSearch.js';
import { mulberry32 } from './fixtureUtil.mjs';

setFastDebug(true);

const GAMES = Number(process.argv[2]) || 20;
const MAX_PLIES = Number(process.argv[3]) || 140;

function refKey(mv) {
  if (mv.type === 'castle') {
    return `castle:${mv.plan.piece1_from}>${mv.plan.piece1_to}:${mv.plan.piece2_from}>${mv.plan.piece2_to}`;
  }
  return `${mv.type}:${mv.from}>${mv.to}`;
}

function descKey(desc) {
  if (desc.kind === 'castle') {
    return `castle:${ALGEBRAIC[desc.plan.from1]}>${ALGEBRAIC[desc.plan.to1]}:${ALGEBRAIC[desc.plan.from2]}>${ALGEBRAIC[desc.plan.to2]}`;
  }
  return `${desc.kind}:${ALGEBRAIC[desc.from]}>${ALGEBRAIC[desc.to]}`;
}

function pieceDiff(fast, ref) {
  const norm = (p, moveCountExact) => JSON.stringify({
    id: p.id,
    side: p.side,
    square: p.captured ? null : p.square,
    captured: Boolean(p.captured),
    possibleTypes: p.possibleTypes,
    baseTypes: Array.isArray(p.baseTypes) ? p.baseTypes : p.possibleTypes,
    promoTypes: Array.isArray(p.promoTypes) ? p.promoTypes : [],
    moveCount: moveCountExact,
    wasPromoted: Boolean(p.wasPromoted),
    castled: Boolean(p.castled),
    captureIndex: p.captureIndex,
  });
  for (let i = 0; i < ref.length; i++) {
    const a = norm(fast[i], fast[i].moveCount);
    const b = norm(ref[i], ref[i].moveCount || 0);
    if (a !== b) return `piece ${i}:\n  fast ${a}\n  ref  ${b}`;
  }
  return null;
}

function fail(seed, ply, msg) {
  console.error(`DIVERGENCE seed ${seed} ply ${ply}: ${msg}`);
  process.exit(1);
}

let totalPlies = 0;
let totalMoves = 0;
const t0 = performance.now();

for (let seed = 1; seed <= GAMES; seed++) {
  const rng = mulberry32(0xfa57 + seed);
  let snap = makeInitialSnapshot();

  for (let ply = 0; ply < MAX_PLIES && !snap.gameOver; ply++) {
    const { pieces, sideToMove, lastMove, captureCounter } = snap;
    const ref = generateLegalReplies(pieces, sideToMove, captureCounter, lastMove);

    const bd = packBoard(pieces);
    const before = snapshotWords(bd);
    const side = sideToMove === 'black' ? BLACK : 0;
    const fast = [];
    forEachLegalReply(bd, side, epFromLastMove(bd, lastMove), (desc) => {
      const moveBumps = new Map([[desc.pieceIdx, 1]]);
      if (desc.kind === 'castle') moveBumps.set(desc.plan.i2, 1);
      const captureIndexFor = new Map();
      if (desc.victimIdx >= 0) captureIndexFor.set(desc.victimIdx, captureCounter);
      fast.push({
        key: descKey(desc),
        result: unpackBoard(bd, { moveBumps, captureIndexFor }),
        score: evaluateFast(bd, DEFAULT_WEIGHTS),
      });
    });

    if (!wordsEqual(bd.words, before)) fail(seed, ply, 'board not restored after generation');
    if (bd.journal.length !== 0) fail(seed, ply, 'journal not drained');
    if (fast.length !== ref.length) {
      fail(seed, ply, `reply count ${fast.length} != ${ref.length}\nfast: ${fast.map((f) => f.key).join(', ')}\nref: ${ref.map(refKey).join(', ')}`);
    }
    for (let m = 0; m < ref.length; m++) {
      if (fast[m].key !== refKey(ref[m])) fail(seed, ply, `move ${m}: ${fast[m].key} != ${refKey(ref[m])}`);
      const diff = pieceDiff(fast[m].result, ref[m].resultPieces);
      if (diff) fail(seed, ply, `move ${m} (${fast[m].key}) result mismatch\n${diff}`);
      const refScore = evaluatePosition(ref[m].resultPieces, DEFAULT_WEIGHTS);
      if (fast[m].score !== refScore) fail(seed, ply, `move ${m} eval ${fast[m].score} != ${refScore}`);
    }
    totalMoves += ref.length;

    if (ref.length === 0) break;
    const pick = ref[Math.floor(rng() * ref.length)];
    const entry = pick.type === 'castle'
      ? { type: 'castle', piece1_from: pick.plan.piece1_from, piece2_from: pick.plan.piece2_from }
      : { type: 'move', from: pick.from, to: pick.to, enPassant: pick.type === 'enpassant' };
    const adv = advanceEntry(snap, entry, []);
    if (!adv.ok) fail(seed, ply, `advanceEntry rejected ${refKey(pick)}: ${adv.reason || 'unknown'}`);
    snap = adv.snap;
    totalPlies += 1;
  }
  process.stderr.write(`seed ${seed}: ok (${totalPlies} plies cumulative)\n`);
}

const secs = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`SOAK PASS: ${GAMES} games, ${totalPlies} plies, ${totalMoves} moves cross-checked in ${secs}s`);
