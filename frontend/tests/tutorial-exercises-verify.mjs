// Verifies every interactive tutorial exercise against the REAL engine: the
// goal move must be legal in the lesson's position, and each success-text
// claim (zaps, heals, shields, collapses, mate, wave-function collapse) must
// actually happen. Run on demand after touching lessons.js or the engine:
//   docker exec -u 1000:1000 -w /app quantumchess-frontend-1 node tests/tutorial-exercises-verify.mjs
import { LESSONS } from '../src/tutorial/lessons.js';
import {
  simulateStandardMove,
  simulateEnPassant,
  simulateCastle,
  computeCastlePlanInPosition,
  listEnPassantCaptures,
  evaluateTerminalAfterMove,
} from '../src/chessboard/quantumEngine.js';
import { buildLastMoveRecord } from '../src/chessboard/advanceCore.js';

let fails = 0;
const assert = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } };

// Mirror InteractiveExercise.buildPieces exactly.
function buildPieces(specs) {
  return specs.map((s, i) => ({
    id: s.id || `cap-${i}`,
    side: s.side,
    square: s.captured ? null : s.square,
    possibleTypes: s.types.split(''),
    baseTypes: s.promoted ? [] : s.types.split(''),
    promoTypes: s.promoted ? s.types.split('') : [],
    captured: Boolean(s.captured),
    captureIndex: s.captured ? i : null,
    moveCount: s.moved || s.captured ? 1 : 0,
    wasPromoted: Boolean(s.promoted),
    castled: Boolean(s.castled),
  }));
}

const types = (pieces, sq) => {
  const p = pieces.find((x) => !x.captured && x.square === sq);
  return p ? p.possibleTypes.join('') : '(none)';
};

// Per-exercise claims, keyed by "<lessonId>/<stepTitle>". Each gets
// (sim, pieces) after the goal move resolves.
const CLAIMS = {
  'the-zap/Touch is a zap': (sim) => {
    assert(sim.zappedSquares.join(',') === 'e5', `zap e5 (got ${sim.zappedSquares})`);
    assert(types(sim.pieces, 'e5') === 'pnbrq', `e5 lost king (${types(sim.pieces, 'e5')})`);
  },
  'the-zap/The zap walks down': (sim) => {
    assert(sim.zappedSquares.join(',') === 'e5', `zap e5 (got ${sim.zappedSquares})`);
    assert(types(sim.pieces, 'e5') === 'r', `e5 walked down to rook (${types(sim.pieces, 'e5')})`);
  },
  'the-zap/You touch as your cheapest self': (sim) => {
    assert(sim.zappedSquares.join(',') === 'e7', `zap e7 (got ${sim.zappedSquares})`);
    assert(!types(sim.pieces, 'e7').includes('k'), `e7 lost king (${types(sim.pieces, 'e7')})`);
    assert(types(sim.pieces, 'g5') === 'bq', `mover is bishop-queen (${types(sim.pieces, 'g5')})`);
  },
  'the-heal/Protection regrows possibility': (sim) => {
    assert(sim.healedSquares.join(',') === 'e4', `heal e4 (got ${sim.healedSquares})`);
    assert(types(sim.pieces, 'e4') === 'pnr', `e4 regrew knight (${types(sim.pieces, 'e4')})`);
  },
  'the-heal/Heals obey the ledger': (sim) => {
    assert(sim.healedSquares.join(',') === 'e4', `heal e4 (got ${sim.healedSquares})`);
    assert(types(sim.pieces, 'e4') === 'pb', `pawn-bishop overflow (${types(sim.pieces, 'e4')})`);
  },
  'captures/The pessimistic collapse': (sim) => {
    const dead = sim.pieces.find((p) => p.captured && p.id === 'BV');
    assert(dead && dead.possibleTypes.join('') === 'n', `victim died as knight (${dead && dead.possibleTypes})`);
    assert(sim.zappedSquares.join(',') === 'd8', `landing zapped d8 (got ${sim.zappedSquares})`);
  },
  'the-census/Claims propagate': (sim) => {
    assert(types(sim.pieces, 'f3') === 'n', `second knight claimed (${types(sim.pieces, 'f3')})`);
    assert(types(sim.pieces, 'e4') === 'pr', `census stripped e4 (${types(sim.pieces, 'e4')})`);
    assert(!types(sim.pieces, 'a1').includes('n'), `census stripped a1 (${types(sim.pieces, 'a1')})`);
  },
  'the-shield/Census-locked': (sim) => {
    assert(sim.zappedSquares.length === 0, `no zap lands (got ${sim.zappedSquares})`);
    assert(sim.fizzledSquares.join(',') === 'd5', `shield on d5 (got ${sim.fizzledSquares})`);
    assert(types(sim.pieces, 'd5') === 'rk', `d5 untouched (${types(sim.pieces, 'd5')})`);
  },
  'winning/Wave function collapse': (sim) => {
    assert(sim.zappedSquares.join(',') === 'e5', `zap e5 (got ${sim.zappedSquares})`);
    const kingless = !sim.pieces.some((p) => !p.captured && p.square && p.side === 'black' && p.possibleTypes.includes('k'));
    assert(kingless, 'black is kingless — wave function collapse');
    const lm = buildLastMoveRecord({ finalPieces: sim.pieces, moverId: 'WN', from: 'd2', to: 'f3', side: 'white', zappedSquares: sim.zappedSquares, healedSquares: sim.healedSquares, fizzledSquares: sim.fizzledSquares });
    assert(evaluateTerminalAfterMove(sim.pieces, 'white', 0, lm) === 'checkmate', 'terminal: game over');
  },
  'winning/The revealed king': (sim) => {
    const lm = buildLastMoveRecord({ finalPieces: sim.pieces, moverId: 'WR', from: 'a1', to: 'a8', side: 'white', zappedSquares: sim.zappedSquares, healedSquares: sim.healedSquares, fizzledSquares: sim.fizzledSquares });
    assert(evaluateTerminalAfterMove(sim.pieces, 'white', 0, lm) === 'checkmate', 'back-rank mate stands');
  },
  'castling/Two maybe-kings': (sim) => {
    assert(types(sim.pieces, 'd5') === 'r', `d1 resolved as rook (${types(sim.pieces, 'd5')})`);
    assert(types(sim.pieces, 'e1') === 'rk', `partner keeps both faces (${types(sim.pieces, 'e1')})`);
  },
  'enpassant/The measurement cuts both ways': (sim) => {
    assert(types(sim.pieces, 'b4') === 'p', `capturer collapsed to pawn (${types(sim.pieces, 'b4')})`);
    const dead = sim.pieces.find((p) => p.captured && p.id === 'BV');
    assert(dead && dead.possibleTypes.join('') === 'p', `victim died as pawn (${dead && dead.possibleTypes})`);
  },
  'promotion/The branch': (sim) => {
    const p = sim.pieces.find((x) => x.square === 'c8');
    assert(p && p.wasPromoted && p.possibleTypes.join('') === 'nbrq', `promoted to nbrq (${p && p.possibleTypes})`);
  },
  'promotion/The service stripe': (sim) => {
    assert(sim.healedSquares.join(',') === 'c5', `heal c5 (got ${sim.healedSquares})`);
    const p = sim.pieces.find((x) => x.square === 'c5');
    assert(p && p.possibleTypes.includes('b') && !p.possibleTypes.includes('p'),
      `regrew bishop, never pawn (${p && p.possibleTypes})`);
  },
};

let exercises = 0;
for (const lesson of LESSONS) {
  for (const step of lesson.steps) {
    const ex = step.interactive;
    if (!ex) continue;
    exercises += 1;
    const key = `${lesson.id}/${step.title}`;
    const pieces = buildPieces(ex.pieces);
    const g = ex.goal;

    let sim = null;
    if (g.kind === 'castle') {
      const [a, b] = pieces.filter((p) => p.side === 'white' && !p.captured);
      const res = computeCastlePlanInPosition(pieces, 'white', a.id, b.id);
      assert(res.canCastle, `${key}: castle available (${res.reason || ''})`);
      if (res.canCastle) sim = simulateCastle(pieces, res.plan);
    } else if (g.kind === 'move') {
      const mover = pieces.find((p) => !p.captured && p.square === g.from);
      assert(mover, `${key}: mover on ${g.from}`);
      if (g.ep) {
        const ep = listEnPassantCaptures(pieces, 'white', ex.lastMove || null)
          .find((e) => mover && e.pieceId === mover.id && e.to === g.to);
        assert(ep, `${key}: en passant available`);
        if (ep) sim = simulateEnPassant(pieces, mover.id, g.to, ep.victimId, 0);
      } else if (mover) {
        sim = simulateStandardMove(pieces, mover.id, g.to, 0);
      }
    } else {
      continue; // kind 'any': nothing specific to pin
    }

    assert(sim && sim.ok, `${key}: goal move legal (${sim && sim.reason})`);
    if (sim && sim.ok && CLAIMS[key]) CLAIMS[key](sim);
    else if (sim && sim.ok) {
      console.log(`note: ${key} has no claim checks (zaps=${sim.zappedSquares.join(',') || '-'} heals=${sim.healedSquares.join(',') || '-'})`);
    }
  }
}

console.log(`${exercises} exercises checked`);
console.log(fails === 0 ? 'TUTORIAL OK' : `TUTORIAL FAILED (${fails})`);
process.exit(fails ? 1 : 0);
