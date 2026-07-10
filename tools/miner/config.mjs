// tools/miner/config.mjs
// Purpose: Puzzle-miner CLI config, search beam widths, and the seeded-rng
// determinism patch (searchBestMove uses Math.random for opening variety;
// patching it makes a run fully reproducible from --seed). Split out of
// puzzle-miner.mjs.
// Imports From: ../../frontend/src/utils/rng.js
// Exported To: ../puzzle-miner.mjs, ./gameplay.mjs, ./swing.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../../frontend/src/utils/rng.js';

// ------------------------------------------------------------------- config

const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return def;
  return args[i + 1];
}
const QUICK = args.includes('--quick');

const CFG = {
  games: Number(argVal('games', QUICK ? 2 : 8)),
  seed: Number(argVal('seed', 1)),
  maxPlies: Number(argVal('maxPlies', QUICK ? 70 : 90)), // 45 full moves, then adjudicate (Jasper 2026-07-09): past that it's classical endgame territory — no puzzles there, and probing it isn't free
  playMs: Number(argVal('playMs', QUICK ? 250 : 900)), // per-move time; strong bots need thinking room
  strongMs: Number(argVal('strongMs', QUICK ? 400 : 2000)), // the post-handoff WHITE capitalizer's per-move time; the opening seats all play --playMs (Jasper, 2026-07-10: 2000ms, main seat only)
  minPly: Number(argVal('minPly', 14)), // plies (half-moves): mid-game starts at the ply-14 handoff (seed-11: was 20 — fast post-handoff wins were erring below the floor)
  handoffPly: Number(argVal('handoffPly', 20)), // bot handoff: opening controllers play plies 0..handoffPly-1, main controllers after
  mineDepth: Number(argVal('mineDepth', 4)),
  probeMs: Number(argVal('probeMs', 8000)), // per-ply balance probe budget (timeouts poison the streak)
  mineMs: Number(argVal('mineMs', QUICK ? 10000 : 45000)), // deep budget, only for probe survivors
  confirmMs: Number(argVal('confirmMs', QUICK ? 30000 : 120000)), // depth-stability confirm
  verifyDepth: Number(argVal('verifyDepth', 6)), // gate must sit above confirm (mineDepth+1); falls back one level on timeout
  verifyMs: Number(argVal('verifyMs', QUICK ? 45000 : 120000)),
  verifyCap: Number(argVal('verifyCap', 120)), // max par plies to re-verify
  minChoices: Number(argVal('minChoices', 10)), // fewer legal moves = not a real search
  maxChoices: Number(argVal('maxChoices', 10000)), // no hard cap (2026-07-09: seed-8 swings sat at 78-158 moves — width is inherent to winning quantum positions); numChoices is curation metadata
  // --- swing detection (2026-07-08 rework: mistakes, not only-moves) ---
  // The puzzle moment is Black's FIRST MISTAKE FROM BALANCE: the eval sat
  // near 0, Black moved, and now White's best line reaches swingMin. The
  // player is shown Black's move and must capitalize.
  balanceBand: Number(argVal('balanceBand', 1.25)), // |eval| <= band counts as balanced
  balanceStreak: Number(argVal('balanceStreak', 2)), // consecutive balanced white-to-move probes required before the swing
  swingMin: Number(argVal('swingMin', 2.0)), // post-mistake advantage floor (deep eval; 2.5 rejected every seed-9 candidate — deep bests clustered 1.3-2.3)
  swingDelta: Number(argVal('swingDelta', 1.5)), // and the JUMP from the last balanced eval must be at least this
  // Perishability: an advantage that survives lazy play is no puzzle. The
  // MEDIAN legal move must keep less than this fraction of the best move's
  // advantage — most moves must leak the win.
  perishFrac: Number(argVal('perishFrac', 0.34)),
  // --- par line (all puzzles are 3-movers) ---
  parPlies: Number(argVal('parPlies', 3)), // white moves in the certified par line
  minPlyTrick: Number(argVal('minPlyTrick', 4.0)), // every par ply must stay this interesting (sustained trickiness)
  outDir: argVal('out', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mined')),
};

// Root widths must NEVER truncate — quantum midgames reach 60-80 legal
// moves, and a root-pruned move silently corrupts evals (a graph point drew
// 0.8 where the true value was 3.45 because the root beam was 40).
const PROBE_WIDTHS = [176, 8, 6]; // balance probes: full root, narrow tail — speed comes from the inner beams
const MINE_WIDTHS = [176, 16, 12, 9, 7]; // certification beams — a beam too narrow can miss a refutation
const CONFIRM_WIDTHS = [176, 10, 8, 6, 6]; // depth+1 stability check: narrow inner beams or it times out
const VERIFY_WIDTHS = [176, 16, 12, 10, 8, 6];

// ------------------------------------------------- determinism (seeded rng)

// searchBestMove uses Math.random for opening variety; patch it (with the
// shared seeded rng from tests/fixtureUtil.mjs) so a run is fully
// reproducible from --seed.
const rng = mulberry32(CFG.seed * 2654435761);
Math.random = rng;

export { args, QUICK, CFG, PROBE_WIDTHS, MINE_WIDTHS, CONFIRM_WIDTHS, VERIFY_WIDTHS, rng };
