// frontend/src/puzzle/puzzleRecipesChains.js
// Purpose: The multi-move daily puzzle chains (Wed-Sun): Snap Trap, The
// Ledger (census -> seal), the Hunt rook ladders, and The Investigation.
// Each `build(rng)` constructs a seeded candidate with scripted Black
// replies; the kit's verifier is the quality bar. BUILD_FAIL counts where
// candidates die (see debugRecipe / the README tuning workflow). Split out
// of puzzleGenerator.js.
// Imports From: ./puzzleBoardKit.js
// Exported To: ./puzzleGenerator.js

import {
  canPieceRecohere,
} from '../chessboard/quantumEngine.js';
import {
  KNIGHT_OFFS,
  P,
  atkBlackPawn,
  atkDiag,
  atkKnight,
  atkLine,
  atkNear,
  atkQueenly,
  boardCtx,
  inBoard,
  padCapturedSides,
  pick,
  placeKingSafely,
  randInt,
  sq,
  whiteKingHolder,
  placeProbeTargets,
  placeProbeMover,
} from './puzzleBoardKit.js';

const R_SNAP_TRAP = {
  key: 'snaptrap',
  title: 'The Snap Trap',
  emoji: '🪤',
  moves: 2,
  minChoices: 9,
  minChoicesLater: 8,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const pf = randInt(rng, 2, 3);
    // royal pair on the 8th rank, TWO apart: the revealed king (E2) is never
    // adjacent to the capture square, so no refuting recapture exists. The
    // census anti-correlates {q,k} pieces on its own — capture one and the
    // other must be the King.
    const e1 = P('black', b.take(pf, 7), 'qk');
    const e2 = P('black', b.take(pf + 2, 7), 'qk');
    pieces.push(e1, e2);
    // shields box the king in on rank 7
    for (const f of [pf + 1, pf + 2, pf + 3]) {
      if (!b.free(f, 6)) return null;
      pieces.push(P('black', b.take(f, 6), 'p'));
    }
    // white bishop takes E1 (clear diagonal from below-left)
    const dist = pf; // pf 2 or 3 -> bishop starts on file 0
    if (!b.free(0, 7 - dist)) return null;
    for (let s = 1; s < dist; s++) if (!b.free(pf - s, 7 - s)) return null;
    pieces.push(P('white', b.take(0, 7 - dist), 'b'));
    // a knight covers the king's one open flight square (pf+1, 8th rank)
    // WITHOUT attacking E1 itself (that would be a second snap solution)
    if (!b.free(pf, 5)) return null;
    pieces.push(P('white', b.take(pf, 5), 'n'));
    // white rook on an open file right of the king, clear route to rank 8
    const rf = randInt(rng, pf + 4, 7);
    const rr = randInt(rng, 0, 2);
    if (!b.free(rf, rr)) return null;
    for (let r = rr + 1; r < 8; r++) if (!b.free(rf, r)) return null;
    for (let f = pf + 3; f < rf; f++) if (!b.free(f, 7)) return null;
    pieces.push(P('white', b.take(rf, rr), 'r'));
    // two {n,b} blurs (a closed group over open slots {n, b} — the pair
    // holds r and k), far from the mating geometry; the first one is the
    // scripted replier and, being knight-or-bishop, replies with a HOP
    const blurAvoid = (f) => f === rf || f === pf || Math.abs(f - pf) <= 2;
    const blur = b.findFree(rng, 0, 7, 3, 4, 14, blurAvoid);
    if (!blur) return null;
    pieces.push(P('black', b.take(blur[0], blur[1]), 'nb'));
    const blur2 = b.findFree(rng, 0, 7, 3, 4, 14, blurAvoid);
    if (!blur2) return null;
    pieces.push(P('black', b.take(blur2[0], blur2[1]), 'nb'));
    let hop = null;
    for (const [df, dr] of [[1, -2], [-1, -2], [2, -1], [-2, -1]]) {
      const f = blur[0] + df;
      const r = blur[1] + dr;
      if (b.free(f, r) && f !== rf && f !== pf) { hop = [f, r]; break; }
    }
    if (!hop) return null;
    if (!b.free(7, 0) && !b.free(0, 0)) return null;
    pieces.push(whiteKingHolder(b.free(7, 0) ? 7 : 0));

    return {
      pieces,
      plies: [
        {
          subgoal: 'snap',
          ctx: { pairIds: [e1.id, e2.id] },
          goalText: 'Step 1 of 2 — Break the royal pair: capture one and conservation defines both. Watch where the King appears…',
          reply: { from: sq(blur[0], blur[1]), to: sq(hop[0], hop[1]) },
        },
        {
          subgoal: 'mate',
          goalText: 'Step 2 of 2 — He is unmasked and boxed in. Erase the last world where he survives.',
        },
      ],
    };
  },
};

// Thu: your census-into-seal. One knight audits the whole army.
const R_LEDGER = {
  key: 'ledger',
  title: 'The Ledger',
  emoji: '📒',
  moves: 2,
  minChoices: 9,
  minChoicesLater: 6,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    // seal target on black's promotion rank
    const Tf = randInt(rng, 1, 6);
    const tSquare = b.take(Tf, 0);
    const T = P('black', tSquare, 'rq');
    pieces.push(T);
    // X1 = {n,r}: capture -> n, completing the knight census. The auditor
    // knight lands here, so the square must be off T's queen-lines.
    const Xspot = b.findFree(rng, 1, 6, 2, 4, 30, (f, r) => atkQueenly(f, r, Tf, 0));
    if (!Xspot) return bfail('led-Xspot');
    const [Xf, Xr] = Xspot;
    pieces.push(P('black', b.take(Xf, Xr), 'nr'));
    // X2 = {b,r}: a knight-hop from X1's square (so the auditor chains);
    // also a landing square, so also off T's lines
    let X2spot = null;
    for (let tries = 0; tries < 12 && !X2spot; tries++) {
      const [df, dr] = pick(rng, KNIGHT_OFFS);
      const f = Xf + df;
      const r = Xr + dr;
      if (b.free(f, r) && r >= 1 && !atkQueenly(f, r, Tf, 0)) X2spot = [f, r];
    }
    if (!X2spot) return bfail('led-X2spot');
    pieces.push(P('black', b.take(X2spot[0], X2spot[1]), 'br'));
    // landings the rest of Black's army must not reach
    const landings = [[Xf, Xr], X2spot];
    const reaches = (f, r, kinds) => landings.some(([lf, lr]) => {
      if (kinds.includes('n') && atkKnight(lf, lr, f, r)) return true;
      if (kinds.includes('q') && atkQueenly(lf, lr, f, r)) return true;
      if (kinds.includes('line') && atkLine(lf, lr, f, r)) return true;
      if (kinds.includes('file') && f === lf) return true;
      if (kinds.includes('diag') && atkDiag(lf, lr, f, r)) return true;
      if (kinds.includes('p') && atkBlackPawn(lf, lr, f, r)) return true;
      if (kinds.includes('k') && atkNear(lf, lr, f, r)) return true;
      return false;
    });
    // ply-1 cascade target: a maybe-queen, out of reach of both landings
    const t1 = b.findFree(rng, 0, 7, 5, 7, 30, (f, r) => reaches(f, r, ['n', 'q']));
    if (!t1) return bfail('led-t1');
    const t1Square = sq(t1[0], t1[1]);
    const T1 = P('black', b.take(t1[0], t1[1]), 'nq');
    pieces.push(T1);
    // confirmed census pieces: one knight, one bishop
    const cn = b.findFree(rng, 0, 7, 5, 7, 30, (f, r) => reaches(f, r, ['n']));
    if (!cn) return bfail('led-cn');
    pieces.push(P('black', b.take(cn[0], cn[1]), 'n'));
    const cb = b.findFree(rng, 0, 7, 5, 7, 30, (f, r) => reaches(f, r, ['diag']));
    if (!cb) return bfail('led-cb');
    pieces.push(P('black', b.take(cb[0], cb[1]), 'b'));
    // scripted-reply blur {n,b,r}: safe both where it stands and after its
    // push (its rook branch moves it straight down one)
    const blur = b.findFree(rng, 0, 7, 3, 5, 60, (f, r) =>
      reaches(f, r, ['n', 'line', 'diag']));
    if (!blur) return bfail('led-blur');
    pieces.push(P('black', b.take(blur[0], blur[1]), 'nbr'));
    // scripted replies come from the confirmed knight: it is already
    // definite, so its hop collapses nothing (an ambiguous replier's own
    // collapse would cascade and seal T before the player's second move)
    let cnHop = null;
    for (const [df, dr] of KNIGHT_OFFS) {
      const f = cn[0] + df;
      const r = cn[1] + dr;
      if (inBoard(f, r) && b.free(f, r) && r >= 4) { cnHop = [f, r]; break; }
    }
    if (!cnHop) return bfail('led-cnhop');
    // the auditor: a white knight a hop from X1 — blind to T1 and the blur
    // (both capture-collapse to 'n' pre-move, and the blur to 'b' after the
    // reply: capturing either would be a second census solution)
    let att = null;
    for (let tries = 0; tries < 12 && !att; tries++) {
      const [df, dr] = pick(rng, KNIGHT_OFFS);
      const f = Xf + df;
      const r = Xr + dr;
      if (!b.free(f, r)) continue;
      if (atkKnight(t1[0], t1[1], f, r)) continue;
      if (atkKnight(blur[0], blur[1], f, r) || atkKnight(blur[0], blur[1] - 1, f, r)) continue;
      att = P('white', b.take(f, r), 'n');
    }
    if (!att) return bfail('led-att');
    pieces.push(att);
    // decoy rook: off the landings' files/ranks AND off T1/blur files (a
    // rook capture of an n-collapsing piece would be a second solution)
    const dec = b.findFree(rng, 0, 7, 1, 2, 30, (f, r) =>
      reaches(f, r, ['line']) || f === t1[0] || f === blur[0]);
    if (!dec) return bfail('led-dec');
    pieces.push(P('white', b.take(dec[0], dec[1]), 'r'));
    // kings last, on provably safe squares; the white king additionally
    // keeps its hands off every n-collapsing piece (a king capture of one
    // would be a second census solution)
    if (!placeKingSafely(rng, b, pieces, 'black', 0, 7, 6, 7)) return bfail('led-bk');
    const noNCapture = (f, r) =>
      atkNear(f, r, Xf, Xr) || atkNear(f, r, t1[0], t1[1]) || atkNear(f, r, blur[0], blur[1]);
    if (!placeKingSafely(rng, b, pieces, 'white', 0, 7, 0, 3, 120, noNCapture)) return bfail('led-wk');
    return {
      pieces,
      plies: [
        {
          subgoal: 'censusCollapse',
          ctx: { targetId: T1.id, targetSquare: t1Square },
          goalText: `Step 1 of 2 — Complete the knight census: one capture, and the piece on ${t1Square} must confess what it is.`,
          reply: { from: sq(cn[0], cn[1]), to: sq(cnHop[0], cnHop[1]) },
        },
        {
          subgoal: 'seal',
          ctx: { targetId: T.id, targetSquare: tSquare },
          preCheck: (pos) => canPieceRecohere(pos, T.id),
          goalText: `Step 2 of 2 — Now close the ledger: seal the piece on ${tSquare} so nothing can ever grow back.`,
        },
      ],
    };
  },
};

// ==================== hunt chains (Fri 3 / Sun 4) ===========================

// Unmask the king with check, then ladder him to the back rank. rungs=2 gives
// a 3-move puzzle (Fri), rungs=3 a 4-mover (Sun).
function buildHunt(rng, rungs) {
  const b = boardCtx();
  const pieces = [];
  const mirror = pick(rng, [false, true]);
  const F = (f) => (mirror ? 7 - f : f); // mirror on files for variety
  const r0 = 7 - rungs; // final mate lands on rank 8

  // royal pair: E1 on the inner file, king-to-be E2 pinned to the wall file.
  // {q,k} each — the census anti-correlates them by itself, so capturing E1
  // (it collapses to Queen) confirms E2 as the King.
  const pf = F(5);
  const kfile = F(7);
  const e1 = P('black', b.take(pf, r0), 'qk');
  const e2 = P('black', b.take(kfile, r0), 'qk');
  pieces.push(e1, e2);
  // The {q,k} pair's queen branch sees diagonals the old rook pair never
  // did: at rungs=2 (and only then — |pf−wkf| = r0 needs r0=5), E1's long
  // diagonal reaches the white corner king. A shield pawn blocks it.
  if (rungs === 2) {
    const shieldF = mirror ? 6 : 1;
    if (!b.free(shieldF, 1)) return null;
    pieces.push(P('white', b.take(shieldF, 1), 'p'));
  }
  const wkf = mirror ? 7 : 0;
  // R1 below E1 on its file, clear path
  const r1r = randInt(rng, 0, 1);
  if (!b.free(pf, r1r)) return null;
  for (let r = r1r + 1; r < r0; r++) if (!b.free(pf, r)) return null;
  const R1 = P('white', b.take(pf, r1r), 'r');
  pieces.push(R1);
  // R2 on a far file with a clear route up, plus a guard pawn that blocks
  // its "check along the king's file" alternative so each rung is unique
  const rf = F(randInt(rng, 0, 3));
  const r2r = randInt(rng, 0, 1);
  if (Math.abs(rf - kfile) < 2 || rf === pf) return null;
  if (!b.free(rf, r2r)) return null;
  for (let r = r2r + 1; r <= 7; r++) if (!b.free(rf, r)) return null;
  const R2 = P('white', b.take(rf, r2r), 'r');
  pieces.push(R2);
  if (!b.free(kfile, r2r + 1)) return null;
  pieces.push(P('white', b.take(kfile, r2r + 1), 'p'));
  // the ladder's rank corridors must be clear: above r0 the whole span
  // between R2's file and the wall (R1 climbs through it too); on r0 itself
  // only the gap between E1 (which R1 captures) and the king
  for (let r = r0 + 1; r <= 7; r++) {
    for (let f = Math.min(rf, kfile) + 1; f < Math.max(rf, kfile); f++) {
      if (!b.free(f, r)) return null;
    }
  }
  for (let f = Math.min(pf, kfile) + 1; f < Math.max(pf, kfile); f++) {
    if (!b.free(f, r0)) return null;
  }
  // texture blurs. {n,b} only: with the pair pinning q and k, a rook branch
  // has no open-slot grouping left (padCapturedSides would reject every
  // try). Ladder safety: a {n,b} piece refutes the puzzle if it can swoop
  // onto the unmask square or a rook's landing squares (a bishop diagonal
  // or a knight jump away) — the old {n,k}/{b,k} pretenders carried one
  // long-range branch each, these carry two, so screen every ladder square.
  const ladder = [];
  for (let r = r0; r <= 7; r++) ladder.push([pf, r], [rf, r]);
  const reachesLadder = (f, r) => ladder.some(([lf, lr]) =>
    atkKnight(lf, lr, f, r) || atkDiag(lf, lr, f, r));
  let blurs = 0;
  for (let k = 0; k < 3; k++) {
    const spot = b.findFree(rng, 0, 7, 0, 3, 20, (f, r) =>
      f === pf || f === kfile || f === rf || r >= r0 || reachesLadder(f, r) ||
      atkQueenly(wkf, 0, f, r) || atkKnight(wkf, 0, f, r));
    if (!spot) continue;
    pieces.push(P('black', b.take(spot[0], spot[1]), 'nb'));
    blurs++;
  }
  if (blurs < 2) return null; // too austere — retry with a fresh layout
  if (!b.free(wkf, 0)) return null;
  pieces.push(whiteKingHolder(wkf));

  const total = rungs + 1;
  const plies = [];
  // ply 1: unmask with check (R1 takes E1, rank r0 lights up)
  plies.push({
    subgoal: 'unmask',
    ctx: {},
    goalText: `Step 1 of ${total} — The royal pair shares one crown. Capture the one you can reach: conservation crowns the other — with check.`,
    reply: { from: sq(kfile, r0), to: sq(kfile, r0 + 1) },
  });
  // middle rungs: alternate rooks cutting off ranks
  const checkers = [R2, R1];
  for (let i = 0; i < rungs - 1; i++) {
    const rank = r0 + 1 + i;
    plies.push({
      subgoal: 'cutoff',
      ctx: { checkerId: checkers[i % 2].id, kingId: e2.id },
      goalText: `Step ${i + 2} of ${total} — He runs. Land your ${i % 2 === 0 ? 'other' : 'first'} rook ON HIS RANK — cut it off and keep the ladder climbing.`,
      reply: { from: sq(kfile, rank), to: sq(kfile, rank + 1) },
    });
  }
  // final rung: mate at the wall
  plies.push({
    subgoal: 'mate',
    goalText: `Step ${total} of ${total} — He is out of board. Close the ladder: mate, across every world.`,
  });

  return { pieces, plies };
}

const R_HUNT3 = {
  key: 'hunt3',
  title: 'The Hunt',
  emoji: '🏹',
  moves: 3,
  minChoices: 8,
  minChoicesLater: 6,
  build(rng) { return buildHunt(rng, 2); },
};

const R_HUNT4 = {
  key: 'hunt4',
  title: 'The Long Hunt',
  emoji: '♛',
  moves: 4,
  minChoices: 8,
  minChoicesLater: 6,
  build(rng) { return buildHunt(rng, 3); },
};

// ==================== Sat: three-move investigation =========================

// Probe (measure 3) -> the census names the queen -> take her.
// Temporary build-stage counters for the harness (cheap, module-level).
export const BUILD_FAIL = {};
function bfail(label) {
  BUILD_FAIL[label] = (BUILD_FAIL[label] || 0) + 1;
  return null;
}

const R_INVESTIGATION = {
  key: 'investigation',
  title: 'The Investigation',
  emoji: '🔍',
  moves: 3,
  minChoices: 10,
  minChoicesLater: 8,
  tries: 400,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const Lf = randInt(rng, 2, 5);
    const Lr = randInt(rng, 3, 5);
    b.take(Lf, Lr);
    // three diagonal {p,n,r} ray targets plus a fourth free-standing group
    // member (not on a ray — it isn't measured, it just closes the census
    // group over open slots {p, p, n, r}); the two HIGHEST ray targets
    // double as the scripted repliers
    const spots = placeProbeTargets(rng, b, pieces, Lf, Lr, 3, 'diag');
    if (!spots) return bfail('inv1-spots');
    const replierIdx = spots
      .map((s, i) => i)
      .sort((a, c) => spots[c][1] - spots[a][1])
      .slice(0, 2);
    if (spots[replierIdx[0]][1] < 2 || spots[replierIdx[1]][1] < 2) return bfail('inv2-spotrank');
    for (const ri of replierIdx) {
      const [rf2, rr2] = spots[ri];
      if (!b.free(rf2, rr2 - 1)) return bfail('inv2c-replyblocked');
      b.take(rf2, rr2 - 1); // reserve the push square
    }
    const fourth = b.findFree(rng, 0, 7, 6, 7, 20, (f, r) =>
      Math.abs(f - Lf) <= 1 || spots.some(([f2]) => f === f2));
    if (!fourth) return bfail('inv2b-fourth');
    // {p,n}: closes the group over {p,p,n,r} without being pulse-markable
    // (2 types), so alternate probe landings can't count it toward three
    pieces.push(P('black', b.take(fourth[0], fourth[1]), 'pn'));
    spots.push([fourth[0], fourth[1], 'pnb']); // knight/pawn risk only (no lines)
    // the probe: a white queen sliding onto L
    const Q = placeProbeMover(rng, b, Lf, Lr);
    if (!Q) return bfail('inv3-Q');
    b.used.delete(`${Lf},${Lr}`);
    pieces.push(Q);
    // Placement discipline: every white landing square (L for the queen,
    // X for the knight, T for the rook) must be out of reach of every loose
    // black piece, or the soundness rule rejects the whole candidate.
    const knightOff = (f, r, f2, r2) => KNIGHT_OFFS.some(([df, dr]) => f + df === f2 && r + dr === r2);
    const aligned = (f, r, f2, r2) => f === f2 || r === r2 || Math.abs(f - f2) === Math.abs(r - r2);
    const near = (f, r, f2, r2) => Math.max(Math.abs(f - f2), Math.abs(r - r2)) <= 1;
    // Risk from the probe targets — matched to their ACTUAL attack patterns
    // ({p,n,r} strikes files/ranks, {p,n,b} strikes diagonals, both jump and
    // pawn-hit), both where they stand and where the two scripted repliers
    // will stand after their one-step push.
    const pawnHit = (f, r, f2, r2) => r === r2 - 1 && Math.abs(f - f2) === 1;
    const spotAttacks = (f, r, f2, r2, kind) => {
      if (knightOff(f, r, f2, r2) || pawnHit(f, r, f2, r2)) return true;
      // 'pnr' rank attacks are usually blocked on busy boards; the exact
      // soundness pass vetoes the rare open ones, so only files pre-filter
      if (kind === 'pnr') return f === f2;
      return Math.abs(f - f2) === Math.abs(r - r2); // pnb: diagonals
    };
    const spotRisk = (f, r) => spots.some(([f2, r2, kind], i) =>
      spotAttacks(f, r, f2, r2, kind) ||
      (replierIdx.includes(i) && spotAttacks(f, r, f2, r2 - 1, kind)));

    // X = {b,q}: the census piece, captured by a white knight on ply 2
    // (2 types, so the probe never marks it — the census is its own clue).
    // With T = {b,q} it forms a closed group over the open slots {b, q}.
    // Off ALL of L's lines: X must not see L, and the queen parked on L
    // must not see X (a queen capture would be a second census solution).
    const Xspot = b.findFree(rng, 0, 7, 1, 5, 90, (f, r) =>
      aligned(f, r, Lf, Lr) || knightOff(f, r, Lf, Lr) || spotRisk(f, r));
    if (!Xspot) return bfail('inv4-X');
    pieces.push(P('black', b.take(Xspot[0], Xspot[1]), 'bq'));
    let N = null;
    for (let tries = 0; tries < 10 && !N; tries++) {
      const [df, dr] = pick(rng, KNIGHT_OFFS);
      if (b.free(Xspot[0] + df, Xspot[1] + dr)) N = P('white', b.take(Xspot[0] + df, Xspot[1] + dr), 'n');
    }
    if (!N) return bfail('inv5-N');
    pieces.push(N);
    // T: the maybe-queen the census will name, with exactly one white
    // attacker (a rook) aimed at it. Kept off X's lines and jumps.
    const Tspot = b.findFree(rng, 0, 7, 5, 7, 90, (f, r) => {
      if (aligned(f, r, Lf, Lr) || aligned(f, r, Xspot[0], Xspot[1]) || r <= Xspot[1]) return true;
      for (let rr2 = 0; rr2 < r; rr2++) if (!b.free(f, rr2)) return true; // rook aim needs the file
      return false;
    });
    if (!Tspot) return bfail('inv6-T');
    const tSquare = sq(Tspot[0], Tspot[1]);
    const T = P('black', b.take(Tspot[0], Tspot[1]), 'bq');
    pieces.push(T);
    const rr = randInt(rng, 0, 1);
    if (!b.free(Tspot[0], rr)) return null;
    for (let r = rr + 1; r < Tspot[1]; r++) if (!b.free(Tspot[0], r)) return null;
    pieces.push(P('white', b.take(Tspot[0], rr), 'r'));
    // kings last, on provably safe squares
    if (!placeKingSafely(rng, b, pieces, 'black', 0, 7, 6, 7)) return bfail('inv7-bk');
    const noXCapture = (f, r) => atkNear(f, r, Xspot[0], Xspot[1]);
    if (!placeKingSafely(rng, b, pieces, 'white', 0, 7, 0, 2, 80, noXCapture)) return bfail('inv8-wk');

    const [b1f, b1r] = spots[replierIdx[0]];
    const [b2f, b2r] = spots[replierIdx[1]];
    return {
      pieces,
      plies: [
        {
          subgoal: 'measure3',
          goalText: 'Step 1 of 3 — Probe: find the one landing square that soft-measures THREE of their pieces at once.',
          reply: { from: sq(b1f, b1r), to: sq(b1f, b1r - 1) },
        },
        {
          subgoal: 'censusCollapse',
          ctx: { targetId: T.id, targetSquare: tSquare },
          goalText: `Step 2 of 3 — Expose: one capture completes the bishop census, and the piece on ${tSquare} must confess.`,
          reply: { from: sq(b2f, b2r), to: sq(b2f, b2r - 1) },
        },
        {
          subgoal: 'captureTarget',
          ctx: { targetId: T.id, targetSquare: tSquare },
          goalText: `Step 3 of 3 — Punish: she is a Queen, and everyone knows it. Take her.`,
        },
      ],
    };
  },
};


export { R_SNAP_TRAP, R_LEDGER, R_HUNT3, R_HUNT4, R_INVESTIGATION };
