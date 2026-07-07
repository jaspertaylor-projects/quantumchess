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
  generateLegalReplies,
  listCheckThreats,
  listEnPassantCaptures,
  movesForType,
  simulateEnPassant,
  simulateStandardMove,
} from '../chessboard/quantumEngine.js';

// Bump to invalidate cached puzzles after generator changes.
export const PUZZLE_VERSION = 4;

// Puzzle #1 — update to the public launch day before launch.
export const PUZZLE_EPOCH = '2026-07-06';

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


function placeKingSafely(rng, b, pieces, side, fLo, fHi, rLo, rHi, tries = 40) {
  const opp = side === 'white' ? 'black' : 'white';
  for (let i = 0; i < tries; i++) {
    const f = randInt(rng, fLo, fHi);
    const r = randInt(rng, rLo, rHi);
    if (!b.free(f, r)) continue;
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

// Harness/debug helper: run one recipe for a date and report where every
// candidate died. Deterministic, read-only.
export function debugRecipe(dateStr, key) {
  const recipe = recipeByKey(key);
  if (!recipe) return null;
  const rng = mulberry32(hashString(`qc-puzzle-v${PUZZLE_VERSION}:${dateStr}:${recipe.key}`));
  const stats = { buildNull: 0, ok: 0 };
  for (let i = 0; i < TRIES_PER_RECIPE; i++) {
    PIECE_SEQ = 0;
    let cand = null;
    try { cand = recipe.build(rng); } catch (_) { cand = null; }
    if (!cand) { stats.buildNull += 1; continue; }
    let verified = null;
    try { verified = verifyCandidate(cand, recipe, stats); } catch (e) { stats[`throw:${e.message}`] = (stats[`throw:${e.message}`] || 0) + 1; }
    if (verified) stats.ok += 1;
  }
  return stats;
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
    // three {n,b,q} blurs: a closed group over open slots {n, b, q} (the
    // pair holds the open r and k), consistent with the full-16 census.
    // Their queen branch sees far, so keep them off the capture square's
    // and the white king's lines and jumps.
    const wkf = pf < 4 ? 7 : 0;
    for (let k = 0; k < 3; k++) {
      const spot = b.findFree(rng, 0, 7, 5, 7, 20, (f, r) =>
        atkQueenly(pf, pr, f, r) || atkKnight(pf, pr, f, r) ||
        atkQueenly(wkf, 0, f, r) || atkKnight(wkf, 0, f, r));
      if (!spot) return null;
      pieces.push(P('black', b.take(spot[0], spot[1]), 'nbq'));
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
    const pf = randInt(rng, 2, 3);
    // pair on the 8th rank, TWO apart: the revealed king (E2) is never
    // adjacent to the capture square, so no refuting recapture exists
    const e1 = P('black', b.take(pf, 7), 'rk', { entangledWith: 'TBD' });
    const e2 = P('black', b.take(pf + 2, 7), 'rk', { entangledWith: 'TBD' });
    e1.entangledWith = e2.id;
    e2.entangledWith = e1.id;
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
          goalText: 'Step 1 of 2 — Break the entangled pair: one capture forces both partners to resolve. Watch where the King appears…',
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
    // knight lands here, so the square must be off every black reach — T's
    // queen-lines included.
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
    // the auditor: a white knight a hop away from X1 — but blind to T1 and
    // the blur (their capture-collapse is 'n' too: taking either would be a
    // second census solution)
    let att = null;
    for (let tries = 0; tries < 12 && !att; tries++) {
      const [df, dr] = pick(rng, KNIGHT_OFFS);
      const f = Xf + df;
      const r = Xr + dr;
      if (!b.free(f, r)) continue;
      if (atkKnight(t1[0], t1[1], f, r)) continue;
      att = P('white', b.take(f, r), 'n');
    }
    if (!att) return bfail('led-att');
    pieces.push(att);
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
      reaches(f, r, ['n', 'file', 'diag']) || reaches(f, r - 1, ['n', 'file', 'diag']));
    if (!blur) return bfail('led-blur');
    pieces.push(P('black', b.take(blur[0], blur[1]), 'nbr'));

    // decoy rook: off both X files/ranks so it can never be a second census
    // capture (which would break uniqueness at either ply)
    const dec = b.findFree(rng, 0, 7, 1, 2, 30, (f, r) => reaches(f, r, ['line']));
    if (!dec) return bfail('led-dec');
    pieces.push(P('white', b.take(dec[0], dec[1]), 'r'));
    // kings last, on provably safe squares
    if (!placeKingSafely(rng, b, pieces, 'black', 0, 7, 6, 7)) return bfail('led-bk');
    if (!placeKingSafely(rng, b, pieces, 'white', 0, 7, 0, 1)) return bfail('led-wk');

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
  // extra pretenders — the unmask cascade strips their crowns. They carry
  // knight/bishop/king branches, so keep them off the white corner king.
  const wkf = mirror ? 7 : 0;
  for (const tp of ['nk', 'bk']) {
    const spot = b.findFree(rng, mirror ? 4 : 0, mirror ? 7 : 3, 0, 2, 20, (f, r) =>
      f === pf || f === kfile || r === r0 ||
      atkKnight(wkf, 0, f, r) || atkDiag(wkf, 0, f, r) || atkNear(wkf, 0, f, r));
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
  // texture blur, kept off the corridors and the white king's lines
  const blur = b.findFree(rng, mirror ? 5 : 0, mirror ? 7 : 2, 2, 3, 14, (f, r) =>
    f === pf || f === kfile || f === rf || r >= r0 ||
    atkQueenly(wkf, 0, f, r) || atkKnight(wkf, 0, f, r));
  if (blur) pieces.push(P('black', b.take(blur[0], blur[1]), 'nbr'));
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
    const fourth = b.findFree(rng, 0, 7, 6, 7, 20, (f, r) =>
      Math.abs(f - Lf) <= 1 || spots.some(([f2]) => f === f2));
    if (!fourth) return bfail('inv2b-fourth');
    pieces.push(P('black', b.take(fourth[0], fourth[1]), 'pnr'));
    spots.push([fourth[0], fourth[1], 'pnr']); // participates in risk checks
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
    if (!placeKingSafely(rng, b, pieces, 'white', 0, 7, 0, 1)) return bfail('inv8-wk');

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

const TRIES_PER_RECIPE = 150;

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
