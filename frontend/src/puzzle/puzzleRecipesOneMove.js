// frontend/src/puzzle/puzzleRecipesOneMove.js
// Purpose: The one-move daily puzzle recipes (Monday + the Tuesday wildcard
// pool): The Instrument, The Census, The Seal, The Snap, The Phantom, and
// Collapse Mate. Each `build(rng)` constructs a seeded candidate; the kit's
// verifier is the quality bar. Split out of puzzleGenerator.js.
// Imports From: ./puzzleBoardKit.js
// Exported To: ./puzzleGenerator.js

import {
  canPieceRecohere,
  listCheckThreats,
} from '../chessboard/quantumEngine.js';
import {
  DIRS,
  KNIGHT_OFFS,
  P,
  atkKnight,
  atkQueenly,
  boardCtx,
  pick,
  randInt,
  sq,
  whiteKingHolder,
  placeProbeTargets,
  placeProbeMover,
} from './puzzleBoardKit.js';

// ------------------------------------------------------------------ recipes
//
// ============ one-move recipes (Mon + Tuesday wildcard pool) ================

const R_INSTRUMENT = {
  key: 'instrument',
  title: 'The Instrument',
  emoji: '📡',
  moves: 1,
  minChoices: 10,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const Lf = randInt(rng, 2, 5);
    const Lr = randInt(rng, 2, 5);
    b.take(Lf, Lr); // reserve the landing square
    // straight rays only: the three {p,n,b} targets form one closed group
    if (!placeProbeTargets(rng, b, pieces, Lf, Lr, 3, 'straight')) return null;
    const mover = placeProbeMover(rng, b, Lf, Lr);
    if (!mover) return null;
    b.used.delete(`${Lf},${Lr}`); // landing square stays empty
    pieces.push(mover);
    const bk = b.findFree(rng, Lf < 4 ? 6 : 0, Lf < 4 ? 7 : 1, 6, 7);
    if (!bk) return null;
    pieces.push(P('black', b.take(bk[0], bk[1]), 'k')); // lone carrier = the king
    if (!b.free(Lf < 4 ? 7 : 0, 0)) return null;
    pieces.push(whiteKingHolder(Lf < 4 ? 7 : 0));
    return {
      pieces,
      plies: [{
        subgoal: 'measure3',
        goalText: 'Find the one landing square that soft-measures THREE enemy pieces at once. To observe, you must be able to touch.',
      }],
    };
  },
};


const R_CENSUS = {
  key: 'census',
  title: 'The Census',
  emoji: '🧮',
  moves: 1,
  minChoices: 9,
  build(rng) {
    const t = pick(rng, ['n', 'b', 'r']);
    const uPool = { n: ['b', 'r', 'q'], b: ['r', 'q'], r: ['q'] }[t];
    const u = pick(rng, uPool);
    const vPool = ['n', 'b', 'r', 'q'].filter((x) => x !== t && x !== u);
    const v = pick(rng, vPool);
    const b = boardCtx();
    const pieces = [];

    const Xf = randInt(rng, 1, 6);
    const Xr = randInt(rng, 2, 5);
    pieces.push(P('black', b.take(Xf, Xr), t + u));
    let att = null;
    for (let tries = 0; tries < 10 && !att; tries++) {
      const [df, dr] = pick(rng, KNIGHT_OFFS);
      if (b.free(Xf + df, Xr + dr)) att = P('white', b.take(Xf + df, Xr + dr), 'n');
    }
    if (!att) return null;
    pieces.push(att);
    const Tf = Xf < 4 ? randInt(rng, 5, 7) : randInt(rng, 0, 2);
    const Tr = randInt(rng, 5, 7);
    if (!b.free(Tf, Tr)) return null;
    const targetSquare = b.take(Tf, Tr);
    const T = P('black', targetSquare, t + v);
    pieces.push(T);
    const cf = b.findFree(rng, 0, 7, 5, 7, 10);
    if (!cf) return null;
    pieces.push(P('black', b.take(cf[0], cf[1]), t));
    if (!b.free(4, 7)) return null;
    pieces.push(P('black', b.take(4, 7), 'k')); // lone carrier = the king
    // third suspect {u,v}: closes the ambiguity group {X, T, H} over the
    // open slots {t, u, v} — required by the full-16 census
    const hs = b.findFree(rng, 0, 7, 4, 6, 12);
    if (!hs) return null;
    pieces.push(P('black', b.take(hs[0], hs[1]), u + v));
    const wkf = Xf < 4 ? 7 : 0;
    if (!b.free(wkf, 0)) return null;
    pieces.push(whiteKingHolder(wkf));
    const dec = b.findFree(rng, 0, 7, 0, 1, 10);
    if (!dec) return null;
    pieces.push(P('white', b.take(dec[0], dec[1]), 'r'));

    return {
      pieces,
      plies: [{
        subgoal: 'censusCollapse',
        ctx: { targetId: T.id, targetSquare },
        goalText: `Make the marked piece on ${targetSquare} collapse to a single identity — WITHOUT touching it. One capture completes a census; conservation does the rest.`,
      }],
    };
  },
};

const R_SEAL = {
  key: 'seal',
  title: 'The Seal',
  emoji: '🔏',
  moves: 1,
  minChoices: 9,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const Tf = randInt(rng, 1, 6);
    const targetSquare = b.take(Tf, 0);
    const T = P('black', targetSquare, 'rq');
    pieces.push(T);
    const Xf = randInt(rng, 1, 6);
    const Xr = randInt(rng, 2, 4);
    if (!b.free(Xf, Xr)) return null;
    pieces.push(P('black', b.take(Xf, Xr), 'br'));
    let att = null;
    for (let tries = 0; tries < 10 && !att; tries++) {
      const [df, dr] = pick(rng, KNIGHT_OFFS);
      if (b.free(Xf + df, Xr + dr)) att = P('white', b.take(Xf + df, Xr + dr), 'n');
    }
    if (!att) return null;
    pieces.push(att);
    for (const tp of ['n', 'n', 'b']) {
      const spot = b.findFree(rng, 0, 7, 5, 7);
      if (!spot) return null;
      pieces.push(P('black', b.take(spot[0], spot[1]), tp));
    }
    // {b,q} partner: closes the group {T, X, H} over open slots {b, r, q}
    const hs = b.findFree(rng, 0, 7, 4, 6, 12);
    if (!hs) return null;
    pieces.push(P('black', b.take(hs[0], hs[1]), 'bq'));
    const kh = b.findFree(rng, 2, 5, 6, 7, 10);
    if (!kh) return null;
    pieces.push(P('black', b.take(kh[0], kh[1]), 'k')); // lone carrier = the king
    // white king on rank 2, off the back-rank target's lines (T is {r,q} on
    // rank 1 and would otherwise see a corner king along the rank)
    const wk = b.findFree(rng, 0, 7, 1, 1, 14, (f) => f === Tf || Math.abs(f - Tf) === 1);
    if (!wk) return null;
    pieces.push(P('white', sq(wk[0], 1), 'k'));
    b.take(wk[0], 1);
    const dec = b.findFree(rng, 0, 7, 1, 2, 10, (f, r) => f === Tf);
    if (!dec) return null;
    pieces.push(P('white', b.take(dec[0], dec[1]), 'r'));

    return {
      pieces,
      plies: [{
        subgoal: 'seal',
        ctx: { targetId: T.id, targetSquare },
        preCheck: (pos) => canPieceRecohere(pos, T.id),
        goalText: `Seal the piece on ${targetSquare}: one capture closes the last identity its wavefunction could ever grow back into. Sealed pieces show the solid line.`,
      }],
    };
  },
};

const R_SNAP = {
  key: 'snap',
  title: 'The Snap',
  emoji: '⛓️',
  moves: 1,
  minChoices: 9,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const pr = randInt(rng, 4, 6);
    const pf = randInt(rng, 1, 5);
    const gap = pick(rng, [1, 2]);
    if (!b.free(pf, pr) || !b.free(pf + gap, pr)) return null;
    // The royal pair: queen-or-king each. The census alone anti-correlates
    // them (one queen slot, one king slot), so capturing either collapses
    // BOTH — no entanglement link needed, or possible, under current rules.
    const e1 = P('black', b.take(pf, pr), 'qk');
    const e2 = P('black', b.take(pf + gap, pr), 'qk');
    pieces.push(e1, e2);
    const dd = pick(rng, [[-1, -1], [1, -1]]);
    const dist = randInt(rng, 2, 3);
    const bf = pf + dd[0] * dist;
    const br = pr + dd[1] * dist;
    if (!b.free(bf, br)) return null;
    for (let s = 1; s < dist; s++) if (!b.free(pf + dd[0] * s, pr + dd[1] * s)) return null;
    pieces.push(P('white', b.take(bf, br), 'b'));
    // three {n,b} blurs: a closed group over open slots {n, b} (the pair
    // holds q and k, so no blur can carry the queen branch at fixed point).
    // Keep them off the capture square's and the white king's lines and jumps.
    const wkf = pf < 4 ? 7 : 0;
    for (let k = 0; k < 3; k++) {
      const spot = b.findFree(rng, 0, 7, 5, 7, 20, (f, r) =>
        atkQueenly(pf, pr, f, r) || atkKnight(pf, pr, f, r) ||
        atkQueenly(wkf, 0, f, r) || atkKnight(wkf, 0, f, r));
      if (!spot) return null;
      pieces.push(P('black', b.take(spot[0], spot[1]), 'nb'));
    }
    if (!b.free(wkf, 0)) return null;
    pieces.push(whiteKingHolder(wkf));
    const dec = b.findFree(rng, 0, 7, 0, 2, 10);
    if (!dec) return null;
    pieces.push(P('white', b.take(dec[0], dec[1]), 'n'));

    return {
      pieces,
      plies: [{
        subgoal: 'snap',
        ctx: { pairIds: [e1.id, e2.id] },
        goalText: 'The royal pair: in every world exactly one is the Queen and the other the King — conservation allows nothing else. One capture forces BOTH to resolve, instantly, at any distance.',
      }],
    };
  },
};

const R_PHANTOM = {
  key: 'phantom',
  title: 'The Phantom',
  emoji: '👻',
  moves: 1,
  minChoices: 6,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const vf = randInt(rng, 1, 6);
    const victim = P('black', b.take(vf, 2), 'pr');
    pieces.push(victim);
    const cf = vf + pick(rng, [-1, 1]);
    if (!b.free(cf, 2)) return null;
    pieces.push(P('white', b.take(cf, 2), 'p'));
    const rr = randInt(rng, 0, 1);
    if (!b.free(cf, rr)) return null;
    pieces.push(P('white', b.take(cf, rr), 'r'));
    const kr = randInt(rng, 5, 7);
    for (let r = 3; r < kr; r++) if (!b.free(cf, r)) return null;
    if (!b.free(cf, kr)) return null;
    pieces.push(P('black', b.take(cf, kr), 'k'));
    // {p,r} partner: closes the victim's ambiguity group
    const hSpot = b.findFree(rng, 0, 7, 5, 7, 12, (f) => f === cf);
    if (!hSpot) return null;
    pieces.push(P('black', b.take(hSpot[0], hSpot[1]), 'pr'));
    const wkf = cf < 4 ? 7 : 0;
    if (!b.free(wkf, 0)) return null;
    pieces.push(whiteKingHolder(wkf));

    const lastMove = {
      side: 'black', pieceId: victim.id,
      from: sq(vf, 4), to: sq(vf, 2),
      isDoubleStep: true, crossedSquare: sq(vf, 3), measuredSquares: [],
    };
    return {
      pieces,
      lastMove,
      plies: [{
        subgoal: 'epCheck',
        preCheck: (pos) => !listCheckThreats(pos).some((t) => t.side === 'white'),
        goalText: `Black just double-stepped ${sq(vf, 4)} → ${sq(vf, 2)}, passing through ${sq(vf, 3)}. Capture the ghost en passant — so that the discovery lands with CHECK.`,
      }],
    };
  },
};

const R_MATE1 = {
  key: 'mate',
  title: 'Collapse Mate',
  emoji: '♚',
  moves: 1,
  minChoices: 8,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const kf = randInt(rng, 5, 7);
    pieces.push(P('black', b.take(kf, 7), 'k'));
    const shieldTypes = () => 'p';
    for (const f of [kf - 1, kf, kf + 1]) {
      if (b.free(f, 6)) pieces.push(P('black', b.take(f, 6), shieldTypes()));
    }
    const mf = randInt(rng, 0, Math.max(0, kf - 3));
    const mr = randInt(rng, 0, 3);
    if (!b.free(mf, mr)) return null;
    for (let r = mr + 1; r < 8; r++) if (!b.free(mf, r)) return null;
    for (let f = mf + 1; f < kf; f++) if (!b.free(f, 7)) return null;
    pieces.push(P('white', b.take(mf, mr), pick(rng, ['r', 'r', 'q'])));
    // a two-piece {n,b} group — both are required, or the survivor would be
    // a lone ambiguous piece and the full-16 census would force it definite
    const by = b.findFree(rng, 0, 7, 3, 5, 12, (f) => f === mf);
    if (!by) return null;
    pieces.push(P('black', b.take(by[0], by[1]), 'nb'));
    const df = b.findFree(rng, 0, 7, 4, 6, 12, (f) => f === mf);
    if (!df) return null;
    pieces.push(P('black', b.take(df[0], df[1]), 'nb'));
    if (!b.free(0, 0) && !b.free(1, 0)) return null;
    pieces.push(whiteKingHolder(b.free(0, 0) ? 0 : 1));
    const w2 = b.findFree(rng, 0, 7, 1, 3, 12, (f) => f === mf);
    if (!w2) return null;
    pieces.push(P('white', b.take(w2[0], w2[1]), pick(rng, ['n', 'b'])));

    return {
      pieces,
      plies: [{
        subgoal: 'mate',
        goalText: 'Mate in one. Not merely check — every legal reply must leave the revealed King capturable.',
      }],
    };
  },
};

// ==================== two-move chains (Wed / Thu) ===========================

// Wed: snap the royal pair, then back-rank mate on the revealed king.

export { R_INSTRUMENT, R_CENSUS, R_SEAL, R_SNAP, R_PHANTOM, R_MATE1 };
