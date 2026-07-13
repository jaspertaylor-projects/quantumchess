// frontend/src/puzzle/puzzleBoardKit.js
// Purpose: The daily-puzzle construction kit — seeded placement primitives
// (piece factory, board builder, attack-shape filters, safe king placement),
// the white-move scanner mirroring live-game legality, the SUBGOAL
// predicates that define what a puzzle asks for, position sanity, 16-piece
// padding (so the engine's conservation behaves exactly as in a real game),
// and the chain verifier that demands a UNIQUE solution at every ply.
// Split out of puzzleGenerator.js.
// Imports From: ../chessboard/boardUtils.js, ../chessboard/advanceCore.js, ../chessboard/quantumEngine.js
// Exported To: ./puzzleGenerator.js, ./puzzleRecipesOneMove.js, ./puzzleRecipesChains.js

import {
  fromAlgebraic,
  toAlgebraic,
} from '../chessboard/boardUtils.js';
import { buildLastMoveRecord } from '../chessboard/advanceCore.js';
// Live-surface scanner moved to ./whiteMoves.js (this kit is PARKED
// classic-era code; the live mined-puzzle path must not import through it).
import { buildLastMove, enumerateWhiteMoves } from './whiteMoves.js';
import {
  applyQuantumConstraints,
  buildOccupancy,
  canPieceRecohere,
  canSideCaptureSquare,
  evaluateTerminalAfterMove,
  generateLegalReplies,
  hasCollapsedKingCapturable,
  listCheckThreats,
  listEnPassantCaptures,
  mergedDestinations,
  simulateEnPassant,
  simulateStandardMove,
} from '../chessboard/quantumEngine.js';

// ---------------------------------------------------------------- seeded rng

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

// ------------------------------------------------------------- construction

let PIECE_SEQ = 0;
function resetPieceSeq() { PIECE_SEQ = 0; }

// Puzzle pieces default to moved:true so stray double-steps and castling
// don't muddy the goal.
const CANON = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
function P(side, square, types, opts = {}) {
  PIECE_SEQ += 1;
  // canonical engine order, so constructed sets match solver output exactly
  const list = types.split('').sort((a, b2) => CANON[a] - CANON[b2]);
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
    castled: false,
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

// A lone king-carrier must BE the king: in a real game (all 16 slots seated,
// captured pieces never holding k) conservation forces it, and players
// correctly apply that rule. Puzzle boards are sparse, so the solver alone
// wouldn't collapse it — we honor the invariant by construction instead.
// Ambiguous kings appear only where a side has 2+ carriers (pairs,
// pretenders).
function whiteKingHolder(cornerFile) {
  return P('white', sq(cornerFile, 0), 'k');
}

// Attack-shape helpers shared by the recipes' placement filters.
const atkKnight = (f, r, f2, r2) => KNIGHT_OFFS.some(([df, dr]) => f2 + df === f && r2 + dr === r);
const atkLine = (f, r, f2, r2) => f === f2 || r === r2;
const atkDiag = (f, r, f2, r2) => Math.abs(f - f2) === Math.abs(r - r2);
const atkQueenly = (f, r, f2, r2) => atkLine(f, r, f2, r2) || atkDiag(f, r, f2, r2);
const atkNear = (f, r, f2, r2) => Math.max(Math.abs(f - f2), Math.abs(r - r2)) <= 1;
const atkBlackPawn = (f, r, f2, r2) => r === r2 - 1 && Math.abs(f - f2) === 1;


function placeKingSafely(rng, b, pieces, side, fLo, fHi, rLo, rHi, tries = 40, avoid = null) {
  const opp = side === 'white' ? 'black' : 'white';
  for (let i = 0; i < tries; i++) {
    const f = randInt(rng, fLo, fHi);
    const r = randInt(rng, rLo, rHi);
    if (!b.free(f, r)) continue;
    if (avoid && avoid(f, r)) continue;
    const kp = P(side, sq(f, r), 'k');
    if (canSideCaptureSquare([...pieces, kp], opp, kp.square)) continue;
    b.take(f, r);
    pieces.push(kp);
    return kp;
  }
  return null;
}

const KNIGHT_OFFS = [[-1, -2], [1, -2], [-2, -1], [2, -1], [-2, 1], [2, 1], [-1, 2], [1, 2]];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// ------------------------------------------------------------- move scanner

// Apply a scripted Black reply. Returns { pieces, lastMove } or null when the
// reply is illegal in this position — which rejects the whole candidate.
function applyBlackReply(pieces, reply) {
  const mover = pieces.find((x) => !x.captured && x.side === 'black' && x.square === reply.from);
  if (!mover) return null;
  const sim = simulateStandardMove(pieces, mover.id, reply.to, 0);
  if (!sim.ok) return null;
  if (hasCollapsedKingCapturable(sim.pieces, 'black')) return null;
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

  // Exactly one of the royal pair is captured; conservation defines both
  // (the captured one collapses to Queen, so the survivor must be the King).
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

  // Mined puzzles (dev preview via ?mined=N, and the future mined dailies):
  // the solution is one specific engine-certified move, not a goal predicate.
  exactMove: (before, m, ctx) =>
    m.from === ctx.from && m.to === ctx.to && Boolean(m.enPassant) === Boolean(ctx.enPassant),

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

function positionSane(pieces) {
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

  // No definite king may be capturable at rest: for Black that's a
  // degenerate "take the free king" puzzle; for White it would make every
  // move that doesn't resolve the attack illegal.
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    if (p.possibleTypes.length === 1 && p.possibleTypes[0] === 'k') {
      const opp = p.side === 'white' ? 'black' : 'white';
      if (canSideCaptureSquare(pieces, opp, p.square)) return false;
    }
  }
  return true;
}

// -------------------------------------------------------- 16-piece padding

// Real game states always contain ALL 16 pieces per side — captured pieces
// persist with definite, non-king types (capture-collapse never yields k).
// Padding each side to 16 makes the engine's conservation behave exactly as
// in a live game: a bijective seating must fill every slot, so a lone
// king-carrier is FORCED to be the king, and ambiguity can only exist as
// closed groups (N pieces sharing exactly N open slots).
const SLOT_POOL = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const SLOT_TYPES = ['p', 'n', 'b', 'r', 'q', 'k'];

// Can `pieces` (arrays of type-options) each take a distinct slot from the
// `counts` multiset, with piece `pinIdx` forced to `pinType`? Backtracking —
// ambiguity groups are tiny (<= 8 pieces).
function canSeat(options, counts, pinIdx = -1, pinType = null) {
  const c = { ...counts };
  if (pinIdx >= 0) {
    if (!c[pinType]) return false;
    c[pinType] -= 1;
  }
  const order = options
    .map((o, i) => i)
    .filter((i) => i !== pinIdx)
    .sort((a, bIdx) => options[a].length - options[bIdx].length);
  const bt = (k) => {
    if (k === order.length) return true;
    const i = order[k];
    for (const t of options[i]) {
      if (c[t] > 0) {
        c[t] -= 1;
        if (bt(k + 1)) { c[t] += 1; return true; }
        c[t] += 1;
      }
    }
    return false;
  };
  return bt(0);
}

// Choose which slots stay OPEN for the ambiguous pieces (one each) such that
// EVERY type of every ambiguous piece remains realizable, then return the
// rest of the pool as captured padding. Deterministic; null when no closed
// grouping exists (the recipe's sets are then inconsistent with a real game).
function padCapturedSides(alive) {
  const out = [...alive];
  for (const side of ['white', 'black']) {
    const mine = alive.filter((p) => p.side === side);
    if (mine.length > 16) return null;
    const remaining = { ...SLOT_POOL };
    const ambiguous = [];
    for (const p of mine) {
      if (p.possibleTypes.length === 1) {
        const t = p.possibleTypes[0];
        if (!remaining[t]) return null;
        remaining[t] -= 1;
      } else {
        ambiguous.push(p.possibleTypes);
      }
    }
    // Enumerate seatings of the ambiguous pieces; accept the first whose
    // open-slot multiset keeps every (piece, type) branch feasible.
    let chosen = null;
    const seats = new Array(ambiguous.length).fill(null);
    let iterations = 0;
    const enumerate = (k) => {
      if (chosen || ++iterations > 400) return;
      if (k === ambiguous.length) {
        const open = {};
        for (const t of seats) open[t] = (open[t] || 0) + 1;
        for (let i = 0; i < ambiguous.length && !chosen; i++) {
          for (const t of ambiguous[i]) {
            if (!canSeat(ambiguous, open, i, t)) return; // this grouping strands a branch
          }
        }
        chosen = { ...open };
        return;
      }
      for (const t of SLOT_TYPES) {
        if (chosen) return;
        if (remaining[t] > 0 && ambiguous[k].includes(t)) {
          remaining[t] -= 1;
          seats[k] = t;
          enumerate(k + 1);
          remaining[t] += 1;
        }
      }
    };
    enumerate(0);
    if (ambiguous.length > 0 && !chosen) return null;
    const open = chosen || {};
    // padding = pool − confirmed − open slots
    const padTypes = [];
    for (const t of SLOT_TYPES) {
      const n = remaining[t] - (open[t] || 0);
      if (n < 0) return null;
      for (let i = 0; i < n; i++) padTypes.push(t);
    }
    if (padTypes.includes('k')) return null; // a captured king = finished game
    if (mine.length + padTypes.length !== 16) return null;
    padTypes.forEach((t, i) => {
      const cp = P(side, null, t);
      cp.square = null;
      cp.captured = true;
      cp.captureIndex = i;
      out.push(cp);
    });
  }
  return out;
}

// ----------------------------------------------------------------- verifier

// Candidate shape from recipes:
// { pieces, lastMove?, plies: [{ subgoal, ctx?, goalText, preCheck?, reply? }] }
// reply = scripted Black move played AFTER this ply's solution ({from,to}).
function verifyCandidate(cand, recipe, stats = null) {
  const why = (reason) => {
    if (stats) stats[reason] = (stats[reason] || 0) + 1;
    return null;
  };
  // Complete both sides to their real-game 16 pieces before anything else.
  const padded = padCapturedSides(cand.pieces);
  if (!padded) return why('pad');
  const constrained = applyQuantumConstraints(padded);
  // Construction must already be a fixed point — if the solver reshapes it,
  // the recipe's census math was wrong for this seed.
  if (typesSig(constrained) !== typesSig(padded)) return why('fixedpoint');
  if (!positionSane(constrained)) return why('sanity');

  let position = constrained;
  let lastMove = cand.lastMove || null;
  const outPlies = [];

  for (let k = 0; k < cand.plies.length; k++) {
    const ply = cand.plies[k];
    const predicate = SUBGOALS[ply.subgoal];
    if (!predicate) return why(`p${k}:badSubgoal`);
    if (ply.preCheck && !ply.preCheck(position)) return why(`p${k}:preCheck`);

    const moves = enumerateWhiteMoves(position, lastMove);
    const minChoices = k === 0 ? (recipe.minChoices || 8) : (recipe.minChoicesLater || 6);
    if (moves.length < minChoices) return why(`p${k}:minChoices`);

    let hit = null;
    for (const m of moves) {
      if (predicate(position, m, ply.ctx || {})) {
        if (hit) return why(`p${k}:multiHit`); // not unique — reject
        hit = m;
      }
    }
    if (!hit) return why(`p${k}:noHit`);

    // Soundness: after the solution, no legal Black reply may capture the
    // piece that just moved. A "solved" position where the obvious recapture
    // refutes the star move reads as broken, even when the trade would be
    // objectively fine. Mate plies pass vacuously (no legal replies).
    const blackReplies = generateLegalReplies(hit.after, 'black', hit.nextCC, hit.nextLastMove);
    for (const r of blackReplies) {
      const moved = r.resultPieces.find((p) => p.id === hit.pieceId);
      if (moved && moved.captured) return why(`p${k}:unsound`);
    }

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
      if (!ply.reply) return why(`p${k}:noReply`);
      const applied = applyBlackReply(hit.after, ply.reply);
      if (!applied) return why(`p${k}:replyIllegal`);
      record.reply = { from: ply.reply.from, to: ply.reply.to };
      position = applied.pieces;
      lastMove = applied.lastMove;
    }

    outPlies.push(record);
  }

  return { pieces: constrained, lastMove: cand.lastMove || null, plies: outPlies };
}
// Probe targets are partial collapses chosen so they CANNOT strike back
// along the ray they sit on ({p,n,b} on straight rays, {p,n,r} on diagonals
// at distance 2+): the probe measures them safely, which keeps the solution
// sound under the no-immediate-recapture rule. `mode` fixes the ray family
// so the targets form one CLOSED ambiguity group under the full-16 census
// (same type-set, one open slot each).
function placeProbeTargets(rng, b, pieces, Lf, Lr, count, mode) {
  const dirs = [...DIRS];
  const spots = [];
  for (let k = 0; k < count; k++) {
    let placed = false;
    for (let tries = 0; tries < 14 && !placed; tries++) {
      const di = randInt(rng, 0, dirs.length - 1);
      const [df, dr] = dirs[di];
      const diagonal = df !== 0 && dr !== 0;
      if (mode === 'straight' && diagonal) continue;
      if (mode === 'diag' && !diagonal) continue;
      const dist = diagonal ? randInt(rng, 2, 3) : randInt(rng, 1, 3);
      const f = Lf + df * dist;
      const r = Lr + dr * dist;
      if (!b.free(f, r)) continue;
      let clear = true;
      for (let s = 1; s < dist; s++) if (!b.free(Lf + df * s, Lr + dr * s)) { clear = false; break; }
      if (!clear) continue;
      dirs.splice(di, 1);
      for (let s = 1; s < dist; s++) b.take(Lf + df * s, Lr + dr * s);
      pieces.push(P('black', b.take(f, r), diagonal ? 'pnr' : 'pnb'));
      spots.push([f, r, diagonal ? 'pnr' : 'pnb']);
      placed = true;
    }
    if (!placed) return null;
  }
  b._probeDirs = dirs; // leftover rays for the mover
  return spots;
}

function placeProbeMover(rng, b, Lf, Lr) {
  const dirs = b._probeDirs || [...DIRS];
  for (let tries = 0; tries < 14; tries++) {
    const [df, dr] = pick(rng, dirs);
    const dist = randInt(rng, 2, 4);
    const f = Lf + df * dist;
    const r = Lr + dr * dist;
    if (!b.free(f, r)) continue;
    let clear = true;
    for (let s = 1; s < dist; s++) if (!b.free(Lf + df * s, Lr + dr * s)) { clear = false; break; }
    if (!clear) continue;
    return P('white', b.take(f, r), 'q');
  }
  return null;
}

export {
  pick,
  randInt,
  P,
  resetPieceSeq,
  sq,
  inBoard,
  boardCtx,
  whiteKingHolder,
  atkKnight,
  atkLine,
  atkDiag,
  atkQueenly,
  atkNear,
  atkBlackPawn,
  placeKingSafely,
  KNIGHT_OFFS,
  DIRS,
  buildLastMove,
  enumerateWhiteMoves,
  applyBlackReply,
  SUBGOALS,
  typesSig,
  positionSane,
  padCapturedSides,
  verifyCandidate,
  placeProbeTargets,
  placeProbeMover,
};
