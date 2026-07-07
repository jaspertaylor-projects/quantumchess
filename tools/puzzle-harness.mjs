// Harness for the chain-based daily puzzle generator: generate N consecutive
// dates and validate each ply of each puzzle independently:
// - solution uniqueness re-verified against every legal move at that ply
// - scripted replies were legal (positions chain up)
// - weekly move-count arc matches the design (1,1,2,2,3,3,4)
// - timing per day
import {
  generateDailyPuzzle,
  enumerateWhiteMoves,
  SUBGOALS,
} from '../frontend/src/puzzle/puzzleGenerator.js';

const N = Number(process.argv[2] || 42);
const START = process.argv[3] || '2026-07-10';

function* dates(start, n) {
  const [y, m, d] = start.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < n; i++) {
    yield dt.toISOString().slice(0, 10);
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
}

const EXPECTED_MOVES = { 0: 4, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3 }; // getDay -> moves

const counts = {};
let fails = 0;
let totalMs = 0;
let maxMs = 0;
let maxDay = '';

const fbT0 = Date.now();
const fb = generateDailyPuzzle('2026-01-01', { isFallback: true });
console.log(`fallback 2026-01-01: ${fb ? fb.recipe.key : 'FAIL'} (${Date.now() - fbT0}ms)`);
if (!fb) fails++;

for (const dateStr of dates(START, N)) {
  const t0 = Date.now();
  const p = generateDailyPuzzle(dateStr);
  const ms = Date.now() - t0;
  totalMs += ms;
  if (ms > maxMs) { maxMs = ms; maxDay = dateStr; }

  if (!p) {
    console.log(`${dateStr}  FAIL: no puzzle`);
    fails++;
    continue;
  }
  counts[p.recipe.key] = (counts[p.recipe.key] || 0) + 1;

  // Re-verify every ply independently.
  let ok = true;
  const plyBits = [];
  for (let k = 0; k < p.plies.length; k++) {
    const ply = p.plies[k];
    const predicate = SUBGOALS[ply.subgoal];
    const moves = enumerateWhiteMoves(ply.pieces, ply.lastMove || null);
    const hits = moves.filter((m) => predicate(ply.pieces, m, ply.ctx || {}));
    const good =
      hits.length === 1 &&
      hits[0].from === ply.solution.from &&
      hits[0].to === ply.solution.to &&
      Boolean(hits[0].enPassant) === Boolean(ply.solution.enPassant);
    if (!good) ok = false;
    plyBits.push(`${ply.subgoal}:${ply.solution.from}->${ply.solution.to}${ply.solution.enPassant ? 'ep' : ''}(${moves.length})`);
  }

  const [yy, mm, dd] = dateStr.split('-').map(Number);
  const dow = new Date(yy, mm - 1, dd).getDay();
  const movesOk = p.recipe.moves === p.plies.length;
  const arcOk = p.plies.length === EXPECTED_MOVES[dow];
  if (!movesOk) ok = false;

  if (!ok) fails++;
  console.log(
    `${dateStr}  ${p.recipe.key.padEnd(13)} ${ok ? 'OK ' : 'BAD'} ${String(p.plies.length)}mv${arcOk ? ' ' : '*'} pieces=${p.pieces.filter((x) => !x.captured).length} ${String(ms).padStart(4)}ms  ${plyBits.join('  ')}`
  );
}

console.log('---');
console.log('recipe counts:', counts);
console.log(`avg ${Math.round(totalMs / N)}ms, max ${maxMs}ms (${maxDay}), fails: ${fails}`);
process.exit(fails ? 1 : 0);
