// frontend/src/puzzle/puzzleGenerator.js
// Purpose: The daily puzzle generator. Date-seeded and fully deterministic —
// every player on Earth gets the same puzzle with no backend. The week has a
// difficulty arc: two 1-move puzzles (Mon/Tue), two 2-move chains (Wed/Thu),
// two 3-move chains (Fri/Sat) and a 4-move hunt on Sunday. A puzzle is a
// CHAIN of quantum sub-goals (measure three at once, census collapse, seal,
// entanglement snap, unmasking, phantom check, mate across all worlds); each
// of the player's moves must be the UNIQUE move achieving that step's goal —
// verified by the real engine against every legal move — with a scripted
// Black reply between steps. Candidates that fail any ply are rejected and
// the seeded stream moves on, so verification IS the quality bar.
// Imports From: ../chessboard/quantumEngine.js, ../chessboard/boardUtils.js
// Exported To: ./DailyPuzzleModal.jsx (and the harness in tools/)

import { fromAlgebraic, toAlgebraic } from '../chessboard/boardUtils.js';
import {
  applyQuantumConstraints,
  buildOccupancy,
  canPieceRecohere,
  canSideCaptureSquare,
  evaluateTerminalAfterMove,
  listCheckThreats,
  listEnPassantCaptures,
  movesForType,
  simulateEnPassant,
  simulateStandardMove,
} from '../chessboard/quantumEngine.js';

// Bump to invalidate cached puzzles after generator changes.
export const PUZZLE_VERSION = 2;

// Puzzle #1 — set to the public launch day.
export const PUZZLE_EPOCH = '2026-07-10';

// A date whose generation is verified by the harness; used only if a day's
// whole recipe rotation somehow fails (it shouldn't).
const FALLBACK_DATE = '2026-01-01';

// ---------------------------------------------------------------- seeded rng

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

// ------------------------------------------------------------- construction

let PIECE_SEQ = 0;

// Puzzle pieces default to moved:true so stray double-steps and castling
// don't muddy the goal.
function P(side, square, types, opts = {}) {
  PIECE_SEQ += 1;
  const list = types.split('');
  return {
    id: `PZ_${side[0]}${PIECE_SEQ}_${square || 'x'}`,
    side,
    square,
    possibleTypes: list,
    baseTypes: [...list],
    promoTypes: [],
    captured: false,
    moveCount: opts.moved === false ? 0 : 1,
    wasPromoted: false,
    coherence: 3,
    recohere: opts.regain || 0,
    observed: false,
    entangledWith: opts.entangledWith || null,
    castled: Boolean(opts.entangledWith),
  };
}

function sq(f, r) { return toAlgebraic(f, r); } // 0-indexed file/rank
function inBoard(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }

// A tiny board-builder: tracks occupied squares so recipes stay readable.
function boardCtx() {
  const used = new Set();
  return {
    used,
    take(f, r) { used.add(`${f},${r}`); return sq(f, r); },
    free(f, r) { return inBoard(f, r) && !used.has(`${f},${r}`); },
    findFree(rng, fLo, fHi, rLo, rHi, tries = 14, avoid = null) {
      for (let i = 0; i < tries; i++) {
        const f = randInt(rng, fLo, fHi);
        const r = randInt(rng, rLo, rHi);
        if (this.free(f, r) && (!avoid || !avoid(f, r))) return [f, r];
      }
      return null;
    },
  };
}

function whiteKingHolder(cornerFile) {
  return P('white', sq(cornerFile, 0), 'nk');
}

const KNIGHT_OFFS = [[-1, -2], [1, -2], [-2, -1], [2, -1], [-2, 1], [2, 1], [-1, 2], [1, 2]];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// ------------------------------------------------------------- move scanner

function leavesCollapsedKingCapturable(pieces, side) {
  const opp = side === 'white' ? 'black' : 'white';
  for (const p of pieces) {
    if (p.captured || p.side !== side || !p.square) continue;
    if (p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k') {
      if (canSideCaptureSquare(pieces, opp, p.square)) return true;
    }
  }
  return false;
}

function buildLastMove(afterPieces, mover, from, to, enPassant, measuredSquares, side = 'white') {
  const lastMove = {
    side,
    pieceId: mover.id,
    from,
    to,
    isDoubleStep: false,
    crossedSquare: null,
    measuredSquares: measuredSquares || [],
  };
  if (!enPassant && (mover.moveCount || 0) === 0) {
    const fp = fromAlgebraic(from);
    const tp = fromAlgebraic(to);
    const dir = side === 'white' ? 1 : -1;
    const moved = afterPieces.find((p) => p.id === mover.id && !p.captured);
    if (fp && tp && moved && fp.fileIndex === tp.fileIndex && tp.rankIndex - fp.rankIndex === 2 * dir && moved.possibleTypes.includes('p')) {
      lastMove.isDoubleStep = true;
      lastMove.crossedSquare = toAlgebraic(fp.fileIndex, fp.rankIndex + dir);
    }
  }
  return lastMove;
}

// Every legal white move with its fully-resolved result. Mirrors the game's
// legality (including the collapsed-king filter); castling is omitted —
// recipes mark pieces moved, so none exists.
export function enumerateWhiteMoves(pieces, lastMove = null, captureCounter = 0) {
  const out = [];

  for (const ep of listEnPassantCaptures(pieces, 'white', lastMove)) {
    const sim = simulateEnPassant(pieces, ep.pieceId, ep.to, ep.victimId, captureCounter);
    if (!sim.ok) continue;
    if (leavesCollapsedKingCapturable(sim.pieces, 'white')) continue;
    const mover = pieces.find((p) => p.id === ep.pieceId);
    out.push({
      from: mover.square,
      to: ep.to,
      enPassant: true,
      pieceId: mover.id,
      after: sim.pieces,
      didCapture: true,
      nextCC: captureCounter + 1,
      measuredSquares: sim.measuredSquares || [],
      nextLastMove: buildLastMove(sim.pieces, mover, mover.square, ep.to, true, sim.measuredSquares),
    });
  }

  const occ = buildOccupancy(pieces);
  for (const p of pieces) {
    if (p.captured || p.side !== 'white' || !p.square) continue;
    const pos = fromAlgebraic(p.square);
    if (!pos) continue;
    const isFirstMove = (p.moveCount || 0) === 0;
    const merged = new Set();
    for (const t of p.possibleTypes) {
      for (const to of movesForType(t, pos.fileIndex, pos.rankIndex, occ, 'white', { isFirstMove })) merged.add(to);
    }
    for (const to of merged) {
      const sim = simulateStandardMove(pieces, p.id, to, captureCounter);
      if (!sim.ok) continue;
      if (leavesCollapsedKingCapturable(sim.pieces, 'white')) continue;
      out.push({
        from: p.square,
        to,
        enPassant: false,
        pieceId: p.id,
        after: sim.pieces,
        didCapture: Boolean(sim.didCapture),
        nextCC: captureCounter + (sim.didCapture ? 1 : 0),
        measuredSquares: sim.measuredSquares || [],
        nextLastMove: buildLastMove(sim.pieces, p, p.square, to, false, sim.measuredSquares),
      });
    }
  }

  return out;
}

// Apply a scripted Black reply. Returns { pieces, lastMove } or null when the
// reply is illegal in this position — which rejects the whole candidate.
function applyBlackReply(pieces, reply) {
  const mover = pieces.find((x) => !x.captured && x.side === 'black' && x.square === reply.from);
  if (!mover) return null;
  const sim = simulateStandardMove(pieces, mover.id, reply.to, 0);
  if (!sim.ok) return null;
  if (leavesCollapsedKingCapturable(sim.pieces, 'black')) return null;
  return {
    pieces: sim.pieces,
    lastMove: buildLastMove(sim.pieces, mover, reply.from, reply.to, false, sim.measuredSquares, 'black'),
  };
}

// ------------------------------------------------------------------ subgoals

// Each sub-goal is a named predicate over (positionBefore, enumeratedMove,
// ctx). The chain verifier demands EXACTLY ONE legal move satisfies the
// active sub-goal at its ply, so predicates are the puzzle's contract.
const SUBGOALS = {
  // Land one move that soft-measures >= 3 enemy pieces.
  measure3: (before, m) => m.measuredSquares.length >= 3,

  // A specific, untouched piece collapses to a single identity.
  censusCollapse: (before, m, ctx) => {
    const prev = before.find((p) => p.id === ctx.targetId);
    const now = m.after.find((p) => p.id === ctx.targetId);
    return Boolean(prev && now && !now.captured && prev.possibleTypes.length > 1 && now.possibleTypes.length === 1);
  },

  // A specific piece ends the move sealed (nothing left to regain).
  seal: (before, m, ctx) => {
    const now = m.after.find((p) => p.id === ctx.targetId);
    if (!now || now.captured || now.possibleTypes.length > 2) return false;
    return !canPieceRecohere(m.after, ctx.targetId);
  },

  // Exactly one of the entangled pair is captured; both end definite.
  snap: (before, m, ctx) => {
    const a = m.after.find((p) => p.id === ctx.pairIds[0]);
    const b = m.after.find((p) => p.id === ctx.pairIds[1]);
    if (!a || !b) return false;
    const capturedOne = (a.captured ? 1 : 0) + (b.captured ? 1 : 0) === 1;
    return capturedOne && a.possibleTypes.length === 1 && b.possibleTypes.length === 1;
  },

  // Black ends with exactly one, fully-known king-holder.
  unmask: (before, m) => {
    const holders = m.after.filter((p) => !p.captured && p.side === 'black' && p.possibleTypes.includes('k'));
    return holders.length === 1 && holders[0].possibleTypes.length === 1;
  },

  // Mid-hunt rung: check the king with a SPECIFIC rook, landing on the
  // king's own rank (the rank cut-off — a file-lift check would be a second
  // solution, so the rank condition keeps the ply unique), without mate.
  cutoff: (before, m, ctx) => {
    if (m.pieceId !== ctx.checkerId) return false;
    const king = m.after.find((p) => p.id === ctx.kingId);
    if (!king || king.captured || !king.square) return false;
    const toPos = fromAlgebraic(m.to);
    const kPos = fromAlgebraic(king.square);
    if (!toPos || !kPos || toPos.rankIndex !== kPos.rankIndex) return false;
    const checks = listCheckThreats(m.after).some((t) => t.side === 'white' && t.to === king.square);
    if (!checks) return false;
    return evaluateTerminalAfterMove(m.after, 'white', m.nextCC, m.nextLastMove) !== 'checkmate';
  },

  // Capture a specific piece.
  captureTarget: (before, m, ctx) => {
    const now = m.after.find((p) => p.id === ctx.targetId);
    return Boolean(now && now.captured);
  },

  // En passant capture that lands a (discovered) check.
  epCheck: (before, m) => {
    if (!m.enPassant) return false;
    return listCheckThreats(m.after).some((t) => t.side === 'white');
  },

  // Mate across every world. The cheap check-first prefilter only narrows
  // which candidates get ACCEPTED (deterministically), never the correctness
  // of an accepted puzzle.
  mate: (before, m) => {
    if (!listCheckThreats(m.after).some((t) => t.side === 'white')) return false;
    return evaluateTerminalAfterMove(m.after, 'white', m.nextCC, m.nextLastMove) === 'checkmate';
  },
};

// ----------------------------------------------------------------- sanity

function typesSig(pieces) {
  return pieces.map((p) => `${p.id}:${p.captured ? 'x' : p.square}:${(p.possibleTypes || []).join('')}`).sort().join('|');
}

function positionSane(pieces, { allowHangingKing = false } = {}) {
  const seen = new Set();
  for (const p of pieces) {
    if (p.captured) continue;
    if (!p.square) return false;
    if (seen.has(p.square)) return false;
    seen.add(p.square);
    if (!p.possibleTypes || p.possibleTypes.length === 0) return false;
  }
  const holders = (side) => pieces.filter((p) => !p.captured && p.side === side && p.possibleTypes.includes('k'));
  if (holders('white').length === 0 || holders('black').length === 0) return false;

  // A lone, already-known black king hanging to an immediate capture makes
  // every goal degenerate except mate day (where it IS the point).
  if (!allowHangingKing) {
    const bh = holders('black');
    if (bh.length === 1 && bh[0].possibleTypes.length === 1 && canSideCaptureSquare(pieces, 'white', bh[0].square)) {
      return false;
    }
  }
  return true;
}

// ----------------------------------------------------------------- verifier

// Candidate shape from recipes:
// { pieces, lastMove?, plies: [{ subgoal, ctx?, goalText, preCheck?, reply? }] }
// reply = scripted Black move played AFTER this ply's solution ({from,to}).
function verifyCandidate(cand, recipe) {
  const constrained = applyQuantumConstraints(cand.pieces);
  // Construction must already be a fixed point — if the solver reshapes it,
  // the recipe's census math was wrong for this seed.
  if (typesSig(constrained) !== typesSig(cand.pieces)) return null;
  if (!positionSane(constrained, { allowHangingKing: Boolean(recipe.allowHangingKing) })) return null;

  let position = constrained;
  let lastMove = cand.lastMove || null;
  const outPlies = [];

  for (let k = 0; k < cand.plies.length; k++) {
    const ply = cand.plies[k];
    const predicate = SUBGOALS[ply.subgoal];
    if (!predicate) return null;
    if (ply.preCheck && !ply.preCheck(position)) return null;

    const moves = enumerateWhiteMoves(position, lastMove);
    const minChoices = k === 0 ? (recipe.minChoices || 8) : (recipe.minChoicesLater || 6);
    if (moves.length < minChoices) return null;

    let hit = null;
    for (const m of moves) {
      if (predicate(position, m, ply.ctx || {})) {
        if (hit) return null; // not unique — reject
        hit = m;
      }
    }
    if (!hit) return null;

    const record = {
      pieces: position,
      lastMove,
      subgoal: ply.subgoal,
      ctx: ply.ctx || {},
      goalText: ply.goalText,
      solution: { from: hit.from, to: hit.to, enPassant: hit.enPassant },
      solutionAfter: hit.after,
      solutionMeasured: hit.measuredSquares,
      legalMoveCount: moves.length,
      reply: null,
    };

    if (k < cand.plies.length - 1) {
      if (!ply.reply) return null;
      const applied = applyBlackReply(hit.after, ply.reply);
      if (!applied) return null;
      record.reply = { from: ply.reply.from, to: ply.reply.to };
      position = applied.pieces;
      lastMove = applied.lastMove;
    }

    outPlies.push(record);
  }

  return { pieces: constrained, lastMove: cand.lastMove || null, plies: outPlies };
}

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
    const dirs = [...DIRS];
    for (let k = 0; k < 3; k++) {
      let placed = false;
      for (let tries = 0; tries < 12 && !placed; tries++) {
        const di = randInt(rng, 0, dirs.length - 1);
        const [df, dr] = dirs[di];
        const dist = randInt(rng, 1, 3);
        const f = Lf + df * dist;
        const r = Lr + dr * dist;
        if (!b.free(f, r)) continue;
        let clear = true;
        for (let s = 1; s < dist; s++) if (!b.free(Lf + df * s, Lr + dr * s)) { clear = false; break; }
        if (!clear) continue;
        dirs.splice(di, 1);
        for (let s = 1; s < dist; s++) b.take(Lf + df * s, Lr + dr * s);
        pieces.push(P('black', b.take(f, r), 'pnbrq'));
        placed = true;
      }
      if (!placed) return null;
    }
    const moverTypes = pick(rng, ['q', 'q', 'rq', 'bq']);
    let mover = null;
    for (let tries = 0; tries < 12 && !mover; tries++) {
      const [df, dr] = pick(rng, dirs);
      if (moverTypes === 'rq' && df !== 0 && dr !== 0) continue;
      if (moverTypes === 'bq' && (df === 0 || dr === 0)) continue;
      const dist = randInt(rng, 2, 4);
      const f = Lf + df * dist;
      const r = Lr + dr * dist;
      if (!b.free(f, r)) continue;
      let clear = true;
      for (let s = 1; s < dist; s++) if (!b.free(Lf + df * s, Lr + dr * s)) { clear = false; break; }
      if (!clear) continue;
      mover = P('white', b.take(f, r), moverTypes);
    }
    if (!mover) return null;
    b.used.delete(`${Lf},${Lr}`); // landing square stays empty
    pieces.push(mover);
    const bk = b.findFree(rng, Lf < 4 ? 6 : 0, Lf < 4 ? 7 : 1, 6, 7);
    if (!bk) return null;
    pieces.push(P('black', b.take(bk[0], bk[1]), 'pnbrqk'));
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
    pieces.push(P('black', b.take(4, 7), 'pnbrqk'));
    const blur = b.findFree(rng, 0, 7, 4, 6, 10);
    if (blur) pieces.push(P('black', b.take(blur[0], blur[1]), 'pnbrq'));
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
    // holder without 'n' — both knight slots are confirmed, so a 6-type
    // holder would be pruned by the solver and fail the fixed point
    const kh = b.findFree(rng, 2, 5, 6, 7, 10);
    if (!kh) return null;
    pieces.push(P('black', b.take(kh[0], kh[1]), 'pbrqk'));
    const wkf = Xf < 4 ? 7 : 0;
    if (!b.free(wkf, 0)) return null;
    pieces.push(whiteKingHolder(wkf));
    const dec = b.findFree(rng, 0, 7, 1, 2, 10);
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
    const e1 = P('black', b.take(pf, pr), 'rk', { entangledWith: 'TBD' });
    const e2 = P('black', b.take(pf + gap, pr), 'rk', { entangledWith: 'TBD' });
    e1.entangledWith = e2.id;
    e2.entangledWith = e1.id;
    pieces.push(e1, e2);
    const dd = pick(rng, [[-1, -1], [1, -1]]);
    const dist = randInt(rng, 2, 3);
    const bf = pf + dd[0] * dist;
    const br = pr + dd[1] * dist;
    if (!b.free(bf, br)) return null;
    for (let s = 1; s < dist; s++) if (!b.free(pf + dd[0] * s, pr + dd[1] * s)) return null;
    pieces.push(P('white', b.take(bf, br), 'b'));
    for (let k = 0; k < 2; k++) {
      const spot = b.findFree(rng, 0, 7, 5, 7, 12);
      if (spot) pieces.push(P('black', b.take(spot[0], spot[1]), k === 0 ? 'pnbrq' : 'pnbr'));
    }
    const wkf = pf < 4 ? 7 : 0;
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
        goalText: 'The castled pair is entangled: in every world exactly one is the King. Break the chain — one capture forces BOTH to resolve, instantly, at any distance.',
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
    const victim = P('black', b.take(vf, 2), pick(rng, ['pr', 'pq']));
    pieces.push(victim);
    const cf = vf + pick(rng, [-1, 1]);
    if (!b.free(cf, 2)) return null;
    pieces.push(P('white', b.take(cf, 2), pick(rng, ['pb', 'pn'])));
    const rr = randInt(rng, 0, 1);
    if (!b.free(cf, rr)) return null;
    pieces.push(P('white', b.take(cf, rr), 'r'));
    const kr = randInt(rng, 5, 7);
    for (let r = 3; r < kr; r++) if (!b.free(cf, r)) return null;
    if (!b.free(cf, kr)) return null;
    pieces.push(P('black', b.take(cf, kr), 'k'));
    const blur = b.findFree(rng, 0, 7, 5, 7, 10, (f) => f === cf);
    if (blur) pieces.push(P('black', b.take(blur[0], blur[1]), 'pnbrq'));
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
  allowHangingKing: true,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const kf = randInt(rng, 5, 7);
    pieces.push(P('black', b.take(kf, 7), 'k'));
    const shieldTypes = () => pick(rng, ['p', 'p', 'pn', 'pb']);
    for (const f of [kf - 1, kf, kf + 1]) {
      if (b.free(f, 6)) pieces.push(P('black', b.take(f, 6), shieldTypes()));
    }
    const mf = randInt(rng, 0, Math.max(0, kf - 3));
    const mr = randInt(rng, 0, 3);
    if (!b.free(mf, mr)) return null;
    for (let r = mr + 1; r < 8; r++) if (!b.free(mf, r)) return null;
    for (let f = mf + 1; f < kf; f++) if (!b.free(f, 7)) return null;
    pieces.push(P('white', b.take(mf, mr), pick(rng, ['r', 'r', 'rq', 'q'])));
    const by = b.findFree(rng, 0, 7, 3, 5, 12, (f) => f === mf);
    if (by) pieces.push(P('black', b.take(by[0], by[1]), pick(rng, ['pnbrq', 'nbr', 'pnb'])));
    const df = b.findFree(rng, 0, 7, 4, 6, 12, (f) => f === mf);
    if (df) pieces.push(P('black', b.take(df[0], df[1]), pick(rng, ['n', 'b'])));
    if (!b.free(0, 0) && !b.free(1, 0)) return null;
    pieces.push(whiteKingHolder(b.free(0, 0) ? 0 : 1));
    const w2 = b.findFree(rng, 0, 7, 1, 3, 12, (f) => f === mf);
    if (!w2) return null;
    pieces.push(P('white', b.take(w2[0], w2[1]), pick(rng, ['n', 'b', 'nb'])));

    return {
      pieces,
      plies: [{
        subgoal: 'mate',
        goalText: 'Mate in one. Not "check" — erase the last world where their King survives. Every reply must leave him capturable.',
      }],
    };
  },
};

// ==================== two-move chains (Wed / Thu) ===========================

// Wed: snap the pair, then back-rank mate on the revealed king.
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
    const pf = randInt(rng, 1, 4);
    // pair on the 8th rank; E2 (right) becomes the king
    const e1 = P('black', b.take(pf, 7), 'rk', { entangledWith: 'TBD' });
    const e2 = P('black', b.take(pf + 1, 7), 'rk', { entangledWith: 'TBD' });
    e1.entangledWith = e2.id;
    e2.entangledWith = e1.id;
    pieces.push(e1, e2);
    // shields box the king in on rank 7
    for (const f of [pf, pf + 1, pf + 2]) {
      if (!b.free(f, 6)) return null;
      pieces.push(P('black', b.take(f, 6), 'p'));
    }
    // white bishop takes E1 (clear diagonal from below)
    const dd = pick(rng, [[-1, -1], [1, -1]]);
    const dist = randInt(rng, 2, 3);
    const bf = pf + dd[0] * dist;
    const br = 7 + dd[1] * dist;
    if (!b.free(bf, br)) return null;
    for (let s = 1; s < dist; s++) if (!b.free(pf + dd[0] * s, 7 + dd[1] * s)) return null;
    pieces.push(P('white', b.take(bf, br), 'b'));
    // white rook on an open file right of the king, clear route to rank 8
    const rf = randInt(rng, pf + 3, 7);
    const rr = randInt(rng, 0, 2);
    if (!b.free(rf, rr)) return null;
    for (let r = rr + 1; r < 8; r++) if (!b.free(rf, r)) return null;
    for (let f = pf + 2; f < rf; f++) if (!b.free(f, 7)) return null;
    pieces.push(P('white', b.take(rf, rr), 'r'));
    // scripted-reply blur, far from the mating geometry
    const blur = b.findFree(rng, 0, 7, 3, 4, 14, (f) => f === rf || f === pf || Math.abs(f - pf) <= 2);
    if (!blur) return null;
    pieces.push(P('black', b.take(blur[0], blur[1]), 'pnbrq'));
    if (!b.free(7, 0) && !b.free(0, 0)) return null;
    pieces.push(whiteKingHolder(b.free(7, 0) ? 7 : 0));

    return {
      pieces,
      plies: [
        {
          subgoal: 'snap',
          ctx: { pairIds: [e1.id, e2.id] },
          goalText: 'Step 1 of 2 — Break the entangled pair: one capture forces both partners to resolve. Watch where the King appears…',
          reply: { from: sq(blur[0], blur[1]), to: sq(blur[0], blur[1] - 1) },
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
    // ply-1 cascade target: a maybe-queen elsewhere
    const t1 = b.findFree(rng, 0, 7, 5, 7);
    if (!t1) return null;
    const t1Square = sq(t1[0], t1[1]);
    const T1 = P('black', b.take(t1[0], t1[1]), 'nq');
    pieces.push(T1);
    // X1 = {n,r}: capture -> n, completing the knight census
    const Xf = randInt(rng, 2, 5);
    const Xr = randInt(rng, 2, 4);
    if (!b.free(Xf, Xr)) return null;
    pieces.push(P('black', b.take(Xf, Xr), 'nr'));
    // X2 = {b,r}: a knight-hop from X1's square; capture -> b
    let X2spot = null;
    for (let tries = 0; tries < 10 && !X2spot; tries++) {
      const [df, dr] = pick(rng, KNIGHT_OFFS);
      if (b.free(Xf + df, Xr + dr) && Xr + dr >= 1) X2spot = [Xf + df, Xr + dr];
    }
    if (!X2spot) return null;
    pieces.push(P('black', b.take(X2spot[0], X2spot[1]), 'br'));
    // the auditor: a white knight a hop away from X1
    let att = null;
    for (let tries = 0; tries < 10 && !att; tries++) {
      const [df, dr] = pick(rng, KNIGHT_OFFS);
      if (b.free(Xf + df, Xr + dr)) att = P('white', b.take(Xf + df, Xr + dr), 'n');
    }
    if (!att) return null;
    pieces.push(att);
    // confirmed census pieces: one knight, one bishop
    for (const tp of ['n', 'b']) {
      const spot = b.findFree(rng, 0, 7, 5, 7);
      if (!spot) return null;
      pieces.push(P('black', b.take(spot[0], spot[1]), tp));
    }
    // black king-holder (full blur is fine: n census is only 1 deep pre-move)
    const kh = b.findFree(rng, 2, 5, 6, 7, 10);
    if (!kh) return null;
    pieces.push(P('black', b.take(kh[0], kh[1]), 'pnbrqk'));
    // scripted-reply blur
    const blur = b.findFree(rng, 0, 7, 4, 5, 14);
    if (!blur) return null;
    pieces.push(P('black', b.take(blur[0], blur[1]), 'pnbr'));
    const wkf = Xf < 4 ? 7 : 0;
    if (!b.free(wkf, 0)) return null;
    pieces.push(whiteKingHolder(wkf));
    const dec = b.findFree(rng, 0, 7, 1, 2, 10);
    if (!dec) return null;
    pieces.push(P('white', b.take(dec[0], dec[1]), 'r'));

    return {
      pieces,
      plies: [
        {
          subgoal: 'censusCollapse',
          ctx: { targetId: T1.id, targetSquare: t1Square },
          goalText: `Step 1 of 2 — Complete the knight census: one capture, and the piece on ${t1Square} must confess what it is.`,
          reply: { from: sq(blur[0], blur[1]), to: sq(blur[0], blur[1] - 1) },
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

  // pair: E1 on the inner file, king-to-be E2 pinned to the wall file
  const pf = F(5);
  const kfile = F(7);
  const e1 = P('black', b.take(pf, r0), 'rk', { entangledWith: 'TBD' });
  const e2 = P('black', b.take(kfile, r0), 'rk', { entangledWith: 'TBD' });
  e1.entangledWith = e2.id;
  e2.entangledWith = e1.id;
  pieces.push(e1, e2);
  // extra pretenders — the unmask cascade strips their crowns
  for (const tp of ['nk', 'bk']) {
    const spot = b.findFree(rng, mirror ? 4 : 0, mirror ? 7 : 3, 0, 2, 14, (f, r) => f === pf || f === kfile || r === r0);
    if (!spot) return null;
    pieces.push(P('black', b.take(spot[0], spot[1]), tp));
  }
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
  // texture blur, kept off the corridors
  const blur = b.findFree(rng, mirror ? 5 : 0, mirror ? 7 : 2, 2, 3, 14, (f, r) => f === pf || f === kfile || f === rf || r >= r0);
  if (blur) pieces.push(P('black', b.take(blur[0], blur[1]), 'pnbr'));
  const wkf = mirror ? 7 : 0;
  if (!b.free(wkf, 0)) return null;
  pieces.push(whiteKingHolder(wkf));

  const total = rungs + 1;
  const plies = [];
  // ply 1: unmask with check (R1 takes E1, rank r0 lights up)
  plies.push({
    subgoal: 'unmask',
    ctx: {},
    goalText: `Step 1 of ${total} — Four pieces might be the King. One capture snaps the entanglement and unmasks him — with check.`,
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
const R_INVESTIGATION = {
  key: 'investigation',
  title: 'The Investigation',
  emoji: '🔍',
  moves: 3,
  minChoices: 10,
  minChoicesLater: 8,
  build(rng) {
    const b = boardCtx();
    const pieces = [];
    const Lf = randInt(rng, 2, 5);
    const Lr = randInt(rng, 2, 4);
    b.take(Lf, Lr);
    const dirs = [...DIRS];
    // X: the census piece — 3 types so the probe marks it too
    let X = null;
    let Xsq = null;
    for (let tries = 0; tries < 12 && !X; tries++) {
      const di = randInt(rng, 0, dirs.length - 1);
      const [df, dr] = dirs[di];
      const dist = randInt(rng, 1, 2);
      const f = Lf + df * dist;
      const r = Lr + dr * dist;
      if (!b.free(f, r)) continue;
      let clear = true;
      for (let s = 1; s < dist; s++) if (!b.free(Lf + df * s, Lr + dr * s)) { clear = false; break; }
      if (!clear) continue;
      dirs.splice(di, 1);
      for (let s = 1; s < dist; s++) b.take(Lf + df * s, Lr + dr * s);
      Xsq = b.take(f, r);
      X = P('black', Xsq, 'nbq');
    }
    if (!X) return null;
    pieces.push(X);
    // two 5-type blurs on other rays; the first one is the scripted replier
    const blurs = [];
    for (let k = 0; k < 2; k++) {
      let placed = null;
      for (let tries = 0; tries < 12 && !placed; tries++) {
        const di = randInt(rng, 0, dirs.length - 1);
        const [df, dr] = dirs[di];
        const dist = randInt(rng, 1, 3);
        const f = Lf + df * dist;
        const r = Lr + dr * dist;
        if (!b.free(f, r) || r < 2) continue;
        let clear = true;
        for (let s = 1; s < dist; s++) if (!b.free(Lf + df * s, Lr + dr * s)) { clear = false; break; }
        if (!clear) continue;
        dirs.splice(di, 1);
        for (let s = 1; s < dist; s++) b.take(Lf + df * s, Lr + dr * s);
        placed = [f, r];
      }
      if (!placed) return null;
      b.take(placed[0], placed[1]);
      blurs.push(placed);
      pieces.push(P('black', sq(placed[0], placed[1]), 'pnbrq'));
    }
    // the probe: a white queen sliding onto L
    let Q = null;
    for (let tries = 0; tries < 12 && !Q; tries++) {
      const [df, dr] = pick(rng, dirs);
      const dist = randInt(rng, 2, 4);
      const f = Lf + df * dist;
      const r = Lr + dr * dist;
      if (!b.free(f, r)) continue;
      let clear = true;
      for (let s = 1; s < dist; s++) if (!b.free(Lf + df * s, Lr + dr * s)) { clear = false; break; }
      if (!clear) continue;
      Q = P('white', b.take(f, r), 'q');
    }
    if (!Q) return null;
    b.used.delete(`${Lf},${Lr}`);
    pieces.push(Q);
    // T: the maybe-queen the census will name, with exactly one white
    // attacker (a rook) aimed at it
    const Tspot = b.findFree(rng, 0, 7, 6, 7, 14, (f, r) => Math.abs(f - Lf) < 2 && Math.abs(r - Lr) < 2);
    if (!Tspot) return null;
    const tSquare = sq(Tspot[0], Tspot[1]);
    const T = P('black', b.take(Tspot[0], Tspot[1]), 'nq');
    pieces.push(T);
    const rr = randInt(rng, 0, 1);
    if (!b.free(Tspot[0], rr)) return null;
    for (let r = rr + 1; r < Tspot[1]; r++) if (!b.free(Tspot[0], r)) return null;
    pieces.push(P('white', b.take(Tspot[0], rr), 'r'));
    // confirmed knight for the census
    const cn = b.findFree(rng, 0, 7, 5, 7);
    if (!cn) return null;
    pieces.push(P('black', b.take(cn[0], cn[1]), 'n'));
    // black king-holder
    const kh = b.findFree(rng, 0, 7, 6, 7, 12);
    if (!kh) return null;
    pieces.push(P('black', b.take(kh[0], kh[1]), 'pnbrqk'));
    if (!b.free(0, 0) && !b.free(7, 0)) return null;
    pieces.push(whiteKingHolder(b.free(0, 0) ? 0 : 7));

    const [b1f, b1r] = blurs[0];
    const [b2f, b2r] = blurs[1];
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
          goalText: `Step 2 of 3 — Expose: one capture completes the knight census, and the piece on ${tSquare} must confess.`,
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

// ------------------------------------------------------------- weekly slate

const RECIPES = [
  R_INSTRUMENT, R_CENSUS, R_SEAL, R_SNAP, R_PHANTOM, R_MATE1,
  R_SNAP_TRAP, R_LEDGER, R_HUNT3, R_INVESTIGATION, R_HUNT4,
];

// Tuesday rotates through the classic one-movers so the week never repeats.
const TUESDAY_POOL = ['census', 'seal', 'snap', 'phantom', 'mate'];

// getDay(): 0 = Sunday ... 6 = Saturday
function primaryKeyFor(dateStr) {
  const dow = dayOfWeek(dateStr);
  if (dow === 0) return 'hunt4';
  if (dow === 1) return 'instrument';
  if (dow === 2) return TUESDAY_POOL[hashString(`tue:${dateStr}`) % TUESDAY_POOL.length];
  if (dow === 3) return 'snaptrap';
  if (dow === 4) return 'ledger';
  if (dow === 5) return 'hunt3';
  return 'investigation';
}

// If a day's primary recipe fails to converge, fall through the reliable
// one-movers — deterministically, so every device drifts identically.
const SAFETY_CHAIN = ['census', 'snap', 'instrument', 'seal', 'phantom', 'mate'];

const TRIES_PER_RECIPE = 80;

function recipeByKey(key) { return RECIPES.find((a) => a.key === key); }

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function puzzleNumber(dateStr) {
  const [y1, m1, d1] = PUZZLE_EPOCH.split('-').map(Number);
  const [y2, m2, d2] = dateStr.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

function tryRecipe(recipe, dateStr) {
  const rng = mulberry32(hashString(`qc-puzzle-v${PUZZLE_VERSION}:${dateStr}:${recipe.key}`));
  for (let i = 0; i < TRIES_PER_RECIPE; i++) {
    PIECE_SEQ = 0;
    let cand = null;
    try { cand = recipe.build(rng); } catch (_) { cand = null; }
    if (!cand) continue;
    let verified = null;
    try { verified = verifyCandidate(cand, recipe); } catch (_) { verified = null; }
    if (verified) {
      return {
        date: dateStr,
        number: puzzleNumber(dateStr),
        version: PUZZLE_VERSION,
        recipe: { key: recipe.key, title: recipe.title, emoji: recipe.emoji, moves: recipe.moves },
        pieces: verified.pieces,
        lastMove: verified.lastMove,
        plies: verified.plies,
      };
    }
  }
  return null;
}

// The main entry point. Deterministic in dateStr; throws never — falls back
// to a harness-verified date if a whole rotation fails.
export function generateDailyPuzzle(dateStr, { isFallback = false } = {}) {
  const keys = [primaryKeyFor(dateStr), ...SAFETY_CHAIN.filter((k) => recipeByKey(k))];
  for (const key of keys) {
    const recipe = recipeByKey(key);
    if (!recipe) continue;
    const puzzle = tryRecipe(recipe, dateStr);
    if (puzzle) return puzzle;
  }
  if (!isFallback) {
    const fb = generateDailyPuzzle(FALLBACK_DATE, { isFallback: true });
    return fb ? { ...fb, date: dateStr, number: puzzleNumber(dateStr) } : null;
  }
  return null;
}

// Check a player's move against ply `plyIdx` of the puzzle. Returns
// { correct, move } — move is the enumerated move actually applied, so the
// UI can show the result either way. En passant is preferred when both
// readings share a destination (the phantom goal says "en passant").
export function checkPuzzleMove(puzzle, plyIdx, from, to) {
  const ply = puzzle.plies[plyIdx];
  if (!ply) return { correct: false, move: null };
  const predicate = SUBGOALS[ply.subgoal];
  const moves = enumerateWhiteMoves(ply.pieces, ply.lastMove || null);
  const candidates = moves.filter((m) => m.from === from && m.to === to);
  if (candidates.length === 0) return { correct: false, move: null };
  candidates.sort((a, b) => (b.enPassant ? 1 : 0) - (a.enPassant ? 1 : 0));
  for (const m of candidates) {
    if (predicate(ply.pieces, m, ply.ctx || {})) return { correct: true, move: m };
  }
  return { correct: false, move: candidates[0] };
}

export { RECIPES, SUBGOALS };
