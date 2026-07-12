// Smoke test for the contact zap/heal rules — random full games with
// per-ply invariants (zap sheds cleanly, heals never regain king, terminal
// states legal). Not part of the vitest suite — run on demand:
//   docker exec -u 1000:1000 -w /app quantumchess-frontend-1 node tests/contact-variant-smoke.mjs
import { makeInitialSnapshot, advanceEntry } from '../src/chessboard/advanceCore.js';
import { generateLegalReplies, simulateStandardMove } from '../src/chessboard/quantumEngine.js';
import { CONTACT_ZAP_ORDER } from '../src/chessboard/gameConstants.js';

let fails = 0;
const assert = (cond, msg) => {
  if (!cond) { fails += 1; console.error('FAIL:', msg); }
};

// Deterministic PRNG so runs are reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 1. Contact projects from the mover's LEAST valuable possibility only.
// 1.e4 leaves the mover {p,r,q}: pawn-reach (d5/f5) is empty, so NO zaps —
// despite rook/queen rays touching the back rank. Then after 1.d4, Black's
// 1...e5 pawn-reaches d4 and zaps the white piece there (sheds 'k').
{
  const snap0 = makeInitialSnapshot();
  const sim = simulateStandardMove(snap0.pieces, snap0.pieces.find((p) => p.square === 'e2').id, 'e4', 0);
  assert(sim.ok, '1.e4 simulates');
  assert(sim.measuredSquares === undefined, 'no measurement-mark field survives');
  assert((sim.zappedSquares || []).length === 0,
    `1.e4 zaps nothing under least-valuable contact (got: ${(sim.zappedSquares || []).join(',')})`);
  assert((sim.healedSquares || []).length === 0, 'no heals while everyone is full superposition');
}
{
  let snap = makeInitialSnapshot();
  const snaps = [snap];
  const a1 = advanceEntry(snap, { type: 'move', from: 'd2', to: 'd4', enPassant: false }, snaps);
  assert(a1.ok, '1.d4 replays');
  snaps.push(a1.snap);
  const a2 = advanceEntry(a1.snap, { type: 'move', from: 'e7', to: 'e5', enPassant: false }, snaps);
  assert(a2.ok, '1...e5 replays');
  const zapped = [...((a2.snap.lastMove || {}).zappedSquares || [])].sort().join(',');
  assert(zapped === 'd4', `1...e5 pawn-reach zaps d4 (got: ${zapped})`);
  const d4 = a2.snap.pieces.find((p) => p.square === 'd4');
  assert(d4 && !d4.possibleTypes.includes('k'),
    `d4 shed its king possibility (got ${d4 && d4.possibleTypes.join('')})`);
}

// --- 2. Random contact games: invariants every ply
for (const seed of [11, 42, 77]) {
  const rnd = mulberry32(seed);
  let snap = makeInitialSnapshot();
  const snaps = [snap];
  let plies = 0, zapEvents = 0, healEvents = 0;

  while (!snap.gameOver && plies < 120) {
    const replies = generateLegalReplies(snap.pieces, snap.sideToMove, snap.captureCounter, snap.lastMove);
    if (replies.length === 0) break;
    // Bias toward captures/central moves a little via random pick among all.
    const mv = replies[Math.floor(rnd() * replies.length)];
    const before = snap.pieces;
    const entry = mv.type === 'castle'
      ? { type: 'castle', piece1_from: mv.plan.piece1_from, piece2_from: mv.plan.piece2_from }
      : { type: 'move', from: mv.from, to: mv.to, enPassant: mv.type === 'enpassant' };
    const adv = advanceEntry(snap, entry, snaps);
    assert(adv.ok, `seed ${seed} ply ${plies}: entry replays (${JSON.stringify(entry)})`);
    if (!adv.ok) break;
    snap = adv.snap;
    snaps.push(snap);
    plies += 1;

    const lm = snap.lastMove || {};
    

    // Zap invariant (guarded shed): the zap itself is a single clean shed,
    // but the same ply's move resolution (capture-collapse cascades) can
    // narrow the target too before the pulse fires. Ply-wide we can only
    // assert: a zapped piece lost possibilities and gained none. The
    // exactly-one-shed guarantee is covered by the hand-built guard
    // scenarios below, where no capture muddies the ply.
    for (const sq of lm.zappedSquares || []) {
      zapEvents += 1;
      const beforePiece = before.find((p) => !p.captured && p.square === sq);
      const afterPiece = snap.pieces.find((p) => beforePiece && p.id === beforePiece.id);
      if (!beforePiece || !afterPiece) continue;
      const lost = beforePiece.possibleTypes.filter((t) => !(afterPiece.possibleTypes || []).includes(t));
      const gained = (afterPiece.possibleTypes || []).filter((t) => !beforePiece.possibleTypes.includes(t));
      assert(gained.length === 0, `seed ${seed} ply ${plies}: zapped ${sq} gained nothing`);
      assert(lost.length >= 1, `seed ${seed} ply ${plies}: zapped ${sq} lost a possibility`);
    }
    // Heal invariant: gained possibilities, never king.
    for (const sq of lm.healedSquares || []) {
      healEvents += 1;
      const beforePiece = before.find((p) => !p.captured && p.square === sq);
      const afterPiece = snap.pieces.find((p) => beforePiece && p.id === beforePiece.id);
      if (!beforePiece || !afterPiece) continue;
      const gained = (afterPiece.possibleTypes || []).filter((t) => !beforePiece.possibleTypes.includes(t));
      assert(gained.length >= 1, `seed ${seed} ply ${plies}: healed ${sq} gained a possibility`);
      assert(!gained.includes('k'), `seed ${seed} ply ${plies}: heal never regains king`);
    }

    // Dead-economy invariant: coherence/recohere/observed frozen at defaults.
    for (const p of snap.pieces) {
      if (p.captured) continue;
      assert((p.recohere || 0) === 0 && !p.observed && (p.coherence ?? 3) === 3,
        `seed ${seed} ply ${plies}: coherence economy stays frozen (${p.id})`);
    }
  }

  const kingless = (side) => !snap.pieces.some((p) => !p.captured && p.square && p.side === side && (p.possibleTypes || []).includes('k'));
  if (snap.gameOver && snap.gameOverReason === 'wave function collapse') {
    const loser = snap.winner === 'white' ? 'black' : 'white';
    assert(kingless(loser), `seed ${seed}: WFC loser is kingless`);
  }
  console.log(`seed ${seed}: plies=${plies} zaps=${zapEvents} heals=${healEvents} over=${snap.gameOver} reason=${snap.gameOverReason || '-'} winner=${snap.winner || '-'}`);
  assert(zapEvents > 0, `seed ${seed}: at least one zap happened`);
}

// --- 3. Guarded zap: census cascades block the shed; clean sheds land.
// Hand-built positions (custom piece arrays with consistent censuses).
function makePiece(id, side, square, types, { captured = false, captureIndex = null } = {}) {
  return {
    id, side, square: captured ? null : square,
    possibleTypes: [...types], baseTypes: [...types], promoTypes: [],
    captured, captureIndex, moveCount: 1, wasPromoted: false, castled: false,
  };
}
function capturedSet(side, typeCounts) {
  const out = [];
  let i = 0;
  for (const [t, n] of Object.entries(typeCounts)) {
    for (let k = 0; k < n; k++) out.push(makePiece(`${side}-cap-${t}${k}`, side, null, [t], { captured: true, captureIndex: i++ }));
  }
  return out;
}
// White: a lone pawn mover; the rest captured. Census stays satisfiable.
const whiteSide = (sq) => [
  makePiece('w-M', 'white', sq, ['p']),
  ...capturedSet('white', { p: 7, n: 2, b: 2, r: 2, q: 1, k: 1 }),
];

{
  // FIZZLE: two black king-holders. Zapping k off d5 would force e8 to be
  // the definite king (cascade); zapping r off d5 collapses it to {k} and
  // forces the others too. Nothing sheds cleanly -> the zap dissipates.
  const pieces = [
    ...whiteSide('e3'),
    makePiece('b-A', 'black', 'e8', ['q', 'k']),
    makePiece('b-B', 'black', 'd5', ['r', 'k']),
    makePiece('b-C', 'black', 'a8', ['r', 'q']),
    ...capturedSet('black', { p: 8, n: 2, b: 2, r: 1 }),
  ];
  const sim = simulateStandardMove(pieces, 'w-M', 'e4', 50);
  assert(sim.ok, 'guard fizzle: 1.e4 simulates');
  assert((sim.zappedSquares || []).length === 0,
    `guard: no clean shed on d5 -> zap dissipates (got ${(sim.zappedSquares || []).join(',')})`);
  assert((sim.fizzledSquares || []).join(',') === 'd5',
    `guard: fizzle reported on d5 for the shield UI (got ${(sim.fizzledSquares || []).join(',')})`);
  const b = sim.pieces.find((p) => p.id === 'b-B');
  assert(b.possibleTypes.join('') === 'rk', `guard: d5 keeps {r,k} (got ${b.possibleTypes.join('')})`);
  const a = sim.pieces.find((p) => p.id === 'b-A');
  assert(a.possibleTypes.join('') === 'qk', `guard: e8 untouched (got ${a.possibleTypes.join('')})`);
}
{
  // CLEAN SHED: three black king-holders. Zapping k off d5 leaves the king
  // seatable on e8 or a8 — local, so the most valuable type still goes.
  const pieces = [
    ...whiteSide('e3'),
    makePiece('b-A', 'black', 'd5', ['r', 'q', 'k']),
    makePiece('b-B', 'black', 'e8', ['r', 'q', 'k']),
    makePiece('b-C', 'black', 'a8', ['r', 'k']),
    makePiece('b-D', 'black', 'h8', ['r']),
    ...capturedSet('black', { p: 8, n: 2, b: 2 }),
  ];
  const sim = simulateStandardMove(pieces, 'w-M', 'e4', 50);
  assert(sim.ok, 'guard clean: 1.e4 simulates');
  assert((sim.zappedSquares || []).join(',') === 'd5', `guard: d5 zapped (got ${(sim.zappedSquares || []).join(',')})`);
  assert((sim.fizzledSquares || []).length === 0,
    `guard: clean shed reports no fizzle (got ${(sim.fizzledSquares || []).join(',')})`);
  const a = sim.pieces.find((p) => p.id === 'b-A');
  assert(a.possibleTypes.join('') === 'rq', `guard: d5 shed k cleanly (got ${a.possibleTypes.join('')})`);
  const bAfter = sim.pieces.find((p) => p.id === 'b-B');
  const cAfter = sim.pieces.find((p) => p.id === 'b-C');
  assert(bAfter.possibleTypes.join('') === 'rqk' && cAfter.possibleTypes.join('') === 'rk',
    `guard: bystanders untouched (got ${bAfter.possibleTypes.join('')}/${cAfter.possibleTypes.join('')})`);
}

// --- 4. Back-rank pawn rights: after 1.e4 clears e2, the e1 piece may
// double-step e1->e3 AND remain a maybe-pawn (p, r and q can all make that
// move), opening an en passant window on e2.
{
  let snap = makeInitialSnapshot();
  const snaps = [snap];
  const a1 = advanceEntry(snap, { type: 'move', from: 'e2', to: 'e4', enPassant: false }, snaps);
  assert(a1.ok, 'pawn-rights: 1.e4 replays');
  snaps.push(a1.snap);
  const a2 = advanceEntry(a1.snap, { type: 'move', from: 'e7', to: 'e5', enPassant: false }, snaps);
  assert(a2.ok, 'pawn-rights: 1...e5 replays');
  snaps.push(a2.snap);
  const a3 = advanceEntry(a2.snap, { type: 'move', from: 'e1', to: 'e3', enPassant: false }, snaps);
  assert(a3.ok, 'pawn-rights: back-rank double step e1->e3 is legal');
  if (a3.ok) {
    const e3 = a3.snap.pieces.find((p) => p.square === 'e3');
    assert(e3 && e3.possibleTypes.includes('p'),
      `pawn-rights: e1->e3 keeps the pawn world (got ${e3 && e3.possibleTypes.join('')})`);
    assert(a3.snap.lastMove.isDoubleStep && a3.snap.lastMove.crossedSquare === 'e2',
      'pawn-rights: back-rank double step opens the en passant window on e2');
  }
}

console.log(fails === 0 ? 'SMOKE OK' : `SMOKE FAILED (${fails})`);
process.exit(fails === 0 ? 0 : 1);
