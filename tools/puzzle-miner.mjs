// tools/puzzle-miner.mjs
// Purpose: Mine daily-puzzle candidates from bot self-play. Pipeline (the
// 2026-07-08 SWING rework — mistakes, not only-moves): (1) simulate games
// between STRONG top-tier bots (blunder noise off; the stronger seats as
// White), (2) probe every White-to-move position and find Black's first
// MISTAKE FROM BALANCE, (3) roll a fixed-length PAR LINE in which every ply
// must stay quantum-tricky, (4) tag quantum themes and trickiness, (5) GATE:
// re-search each par ply at a higher depth — par must hold. High agreement
// (95%+) is the go signal for feeding mined puzzles into the daily rotation.
// The machinery lives in tools/miner/{config,gameplay,themes,swing}.mjs;
// this file is the CLI driver: run games, mine, gate, report.
//
// Run INSIDE Docker (see README):
//   docker compose run --rm --no-deps -v "$PWD":/repo -w /repo frontend \
//     node tools/puzzle-miner.mjs --games 8 --seed 1
// Quick smoke: node tools/puzzle-miner.mjs --quick
//
// Output: tools/mined/mined-seed<seed>.json (positions are full serialized
// game states — pieces array + lastMove + captureCounter — so they replay on
// the real engine with conservation behaving exactly as in a live game).
// Imports From: ./miner/*.mjs
// Exported To: none (CLI)

import fs from 'node:fs';
import path from 'node:path';

import { args, CFG, rng } from './miner/config.mjs';
import { minerBot, mirrorGame, twinBots, BY_RATING, MID_STRONG, MID_WEAK, playGame } from './miner/gameplay.mjs';
import { mineGame, verifyParPly } from './miner/swing.mjs';

// -------------------------------------------------------------------- main

console.log(`puzzle-miner  games=${CFG.games} seed=${CFG.seed} playMs=${CFG.playMs} strongMs=${CFG.strongMs} mineDepth=${CFG.mineDepth} verifyDepth=${CFG.verifyDepth}`);
console.log(`swing bar: balanced |eval|<=${CFG.balanceBand} for ${CFG.balanceStreak} probes (one developing probe allowed), then best>=${CFG.swingMin} & jump>=${CFG.swingDelta}, medianFrac<${CFG.perishFrac}, ${CFG.minChoices}<=choices<${CFG.maxChoices}, ply>=${CFG.minPly}; par line: ${CFG.parPlies} white moves, every ply trickiness>=${CFG.minPlyTrick}; filters: plain recaptures, classical/inert lines\n`);

const stats = { scanned: 0, swings: 0, balancedEligible: 0, weakSwingRejects: 0, funnelSurvivors: 0, prefilterTimeouts: 0, timeouts: 0, insane: 0, censusBug: 0, sizeRejects: 0, perishRejects: 0, dullRejects: 0, shortLineRejects: 0, confirmRejects: 0, confirmTimeouts: 0, filteredRecapture: 0, filteredClassical: 0, mineMsTotal: 0, verifyMsTotal: 0 };
const games = [];
const allChains = [];
const verifiable = []; // { gameIdx, startPly, entry } for the gate

// Chains stream to disk AS FOUND (one JSON per line), so a multi-hour run's
// finds are inspectable/previewable before the final report exists.
fs.mkdirSync(CFG.outDir, { recursive: true });
const chainStream = path.join(CFG.outDir, `chains-seed${CFG.seed}.ndjson`);
fs.writeFileSync(chainStream, '');

for (let g = 0; g < CFG.games; g++) {
  // Phased handoff (Jasper, 2026-07-09): the opening pair builds a balanced,
  // slightly White-worse position; at handoffPly the controllers swap — the
  // STRONGEST bot takes White to capitalize, a mid-weak bot takes Black to
  // err. Random picks per game keep positional variety.
  let roles;
  if (args.includes('--twins')) {
    // Twin mains (identical, until-timeout; the strong twin gets +4 per
    // beam width AND the longer --strongMs clock vs --playMs). Roster bots
    // still play the varied opening.
    const { weak, strong } = twinBots(CFG.playMs, CFG.strongMs);
    const openW = MID_STRONG[Math.floor(rng() * MID_STRONG.length)];
    roles = {
      openW: minerBot(openW),
      openB: minerBot(BY_RATING[0]),
      mainW: strong,
      mainB: weak,
    };
  } else if (args.includes('--selfPlay')) {
    // Diagnostic: the same strongest bot everywhere.
    const top = BY_RATING[0];
    roles = { openW: minerBot(top), openB: minerBot(top), mainW: minerBot(top), mainB: minerBot(top) };
  } else {
    const openW = MID_STRONG[Math.floor(rng() * MID_STRONG.length)];
    const mainB = MID_WEAK[Math.floor(rng() * MID_WEAK.length)];
    // The post-handoff White capitalizer thinks longer (--strongMs): flat
    // --playMs neutralized its roster edge — wider beams complete FEWER
    // iterative-deepening levels on the same budget. Opening seats play
    // --playMs; the time edge switches on WITH the seat swap.
    roles = {
      openW: minerBot(openW),
      openB: minerBot(BY_RATING[0]),
      mainW: minerBot(BY_RATING[0], CFG.strongMs),
      mainB: minerBot(mainB),
    };
  }

  const t0 = performance.now();
  const game = playGame(g, roles);
  const playSec = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`game ${g}: [open ${game.opening.white} vs ${game.opening.black}] -> ${game.white} vs ${game.black} — ${game.plies} plies, ${game.result.winner || 'draw'} (${game.result.reason}) [${playSec}s]`);
  const t1 = performance.now();
  const mined = mineGame(game, stats);
  // Mirror pass: reflect the board and run the SAME White pipeline, so
  // BLACK's capitalizing windows (White's mistakes from balance) are mined
  // too. Mirrored evals negate back into the original frame for the viewer.
  console.log('  -- mirror pass: mining the black windows --');
  const minedMirror = mineGame(mirrorGame(game), stats);
  const evals = [
    ...mined.evals,
    ...minedMirror.evals.map((e) => ({ ply: e.ply, eval: Number((-e.eval).toFixed(2)), side: 'black' })),
  ].sort((a, b) => a.ply - b.ply);
  games.push({ gameIdx: g, white: game.white, black: game.black, opening: game.opening, plies: game.plies, result: game.result, moves: game.stored, evals });
  const mineSec = ((performance.now() - t1) / 1000).toFixed(1);
  for (const chain of [...mined.chains, ...minedMirror.chains]) {
    for (const entry of chain._verify) verifiable.push({ gameIdx: g, startPly: chain.startPly, entry });
    const { _verify, ...saved } = chain;
    allChains.push(saved);
    fs.appendFileSync(chainStream, JSON.stringify(saved) + '\n');
    console.log(`  chain${chain.mirrored ? ' [mirror]' : ''} @ply ${chain.startPly}: mistake ${chain.mistake.from}->${chain.mistake.to} (${chain.mistake.evalBefore} -> ${chain.mistake.evalAfter})${chain.endsInMate ? ' +mate' : ''} par=[${chain.parEvals.join(', ')}] medianFrac=${chain.spread.medianFrac} trick=${chain.trickiness}/min${chain.trickMin} themes=[${chain.themes.join(',')}]`);
  }
  console.log(`  mined ${mined.chains.length + minedMirror.chains.length} chain(s) (${mined.chains.length} white-window, ${minedMirror.chains.length} mirrored black-window) from ${game.record.filter((r) => r.ply >= CFG.minPly).length} positions [${mineSec}s]`);
}

// GATE: par must hold under a deeper, independent search (capped).
console.log(`\n--- verification gate: re-searching ${Math.min(verifiable.length, CFG.verifyCap)} par plies at depth ${CFG.verifyDepth} ---`);
let agreed = 0;
let checked = 0;
let vTimeouts = 0;
const verdicts = [];
for (const { gameIdx, startPly, entry } of verifiable.slice(0, CFG.verifyCap)) {
  const v = verifyParPly(entry, stats);
  if (v.verdict === 'timeout') { vTimeouts++; continue; }
  checked++;
  if (v.verdict === 'agree') agreed++;
  verdicts.push({ game: gameIdx, startPly, plyIdx: entry.plyIdx, parEval: entry.parEval, ...v });
  if (v.verdict === 'disagree') {
    console.log(`  DISAGREE game ${gameIdx} chain@${startPly} ply ${entry.plyIdx}: par ${entry.parEval} vs deep ${v.deepBest} (${v.deepBestScore}) parHolds=${v.parHolds} swingHolds=${v.swingHolds}`);
  }
}
const rate = checked ? (100 * agreed / checked) : 0;

// ------------------------------------------------------------------ report

const report = {
  generatedForSeed: CFG.seed,
  config: CFG,
  games,
  stats: {
    whitePositionsScanned: stats.scanned,
    funnelSurvivors: stats.funnelSurvivors,
    balancedEligiblePositions: stats.balancedEligible,
    swingsConfirmed: stats.swings,
    chains: allChains.length,
    rejects: {
      weakSwing: stats.weakSwingRejects,
      size: stats.sizeRejects,
      perishability: stats.perishRejects,
      depthConfirm: stats.confirmRejects,
      dullPly: stats.dullRejects,
      shortLine: stats.shortLineRejects,
      plainRecapture: stats.filteredRecapture,
      classicalOrInert: stats.filteredClassical,
    },
    depthConfirmTimeouts: stats.confirmTimeouts,
    prefilterTimeouts: stats.prefilterTimeouts,
    deepAnalysisTimeouts: stats.timeouts,
    insanePositions: stats.insane,
    censusFixedPointFailures: stats.censusBug,
    avgMineMsPerPosition: stats.scanned ? Math.round(stats.mineMsTotal / stats.scanned) : 0,
  },
  gate: {
    verified: checked,
    agreed,
    timeouts: vTimeouts,
    agreementRate: Number(rate.toFixed(1)),
    threshold: 95,
    pass: rate >= 95,
    verdicts,
  },
  chains: allChains,
};

fs.mkdirSync(CFG.outDir, { recursive: true });
const outFile = path.join(CFG.outDir, `mined-seed${CFG.seed}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 1));

console.log(`\n=== SUMMARY ===`);
console.log(`white positions scanned: ${stats.scanned}  (avg ${report.stats.avgMineMsPerPosition}ms each; probe survivors: ${stats.funnelSurvivors}; timeouts: ${stats.prefilterTimeouts} probe / ${stats.timeouts} deep)`);
console.log(`balance-window positions: ${stats.balancedEligible}; swings confirmed: ${stats.swings}  -> chains kept: ${allChains.length} (all ${CFG.parPlies}-movers)`);
console.log(`rejects: ${stats.weakSwingRejects} weak swing, ${stats.perishRejects} not perishable, ${stats.sizeRejects} size, ${stats.confirmRejects} depth-confirm, ${stats.dullRejects} dull ply, ${stats.shortLineRejects} short line, ${stats.filteredRecapture} plain recaptures, ${stats.filteredClassical} classical/inert`);
console.log(`census fixed-point failures (engine-bug detector): ${stats.censusBug}`);
console.log(`GATE — par holds at depth ${CFG.verifyDepth}: ${agreed}/${checked} = ${rate.toFixed(1)}%  (need 95%+ to feed mined puzzles into rotation)${vTimeouts ? `, ${vTimeouts} verify timeouts` : ''}`);
console.log(`report: ${outFile}`);
process.exit(0);

