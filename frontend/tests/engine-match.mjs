// frontend/tests/engine-match.mjs
// Purpose: Bot-vs-bot strength match — the validation harness for search
// changes (bit-equality can't judge a DIFFERENT search; games can). Plays N
// games between two engines at a fixed per-move budget on the REFERENCE game
// path (advanceCore arbitrates: every chosen move must be legal, terminals
// and threefold are the game's own). Colors alternate; openings are played
// by both engines' own openingVariety. Reports W/D/L and an Elo estimate.
//   docker exec quantumchess-frontend-1 node tests/engine-match.mjs [games] [msPerMove]
// Imports From: ../src/chessboard/advanceCore.js, ../src/ai/fast/*
// Exported To: None (CLI)

import { makeInitialSnapshot, advanceEntry } from '../src/chessboard/advanceCore.js';
import { searchBestMoveFast } from '../src/ai/fast/fastSearch.js';
import { searchBestMoveV2 } from '../src/ai/fast/fastSearch2.js';
import { setFastDebug } from '../src/ai/fast/fastBoard.js';

setFastDebug(true);

const GAMES = Number(process.argv[2]) || 30;
const MS = Number(process.argv[3]) || 400;
const MAX_PLIES = 140;

const ENGINES = {
  v1: searchBestMoveFast,
  v2: searchBestMoveV2,
};

function toEntry(mv) {
  if (mv.type === 'castle') {
    return { type: 'castle', piece1_from: mv.plan.piece1_from, piece2_from: mv.plan.piece2_from };
  }
  return { type: 'move', from: mv.from, to: mv.to, enPassant: mv.type === 'enpassant' };
}

const depthStats = { v1: { sum: 0, n: 0 }, v2: { sum: 0, n: 0 } };

function playGame(whiteName, blackName, gameIdx) {
  let snap = makeInitialSnapshot();
  const sigs = new Map();
  let plies = 0;
  while (!snap.gameOver && plies < MAX_PLIES) {
    const name = snap.sideToMove === 'white' ? whiteName : blackName;
    const engine = ENGINES[name];
    const res = engine({
      pieces: snap.pieces,
      sideToMove: snap.sideToMove,
      lastMove: snap.lastMove,
      bot: { search: { maxDepth: 3, widths: [22, 14, 10], timeMs: MS, noise: 0 } },
      repetitionSigs: sigs,
      openingVariety: true,
      adaptiveDepth: true,
    });
    if (!res.move) break; // no legal moves — terminal handled by arbiter next
    if (res.depth > 0) { depthStats[name].sum += res.depth; depthStats[name].n += 1; }
    const adv = advanceEntry(snap, toEntry(res.move), []);
    if (!adv.ok) {
      console.error(`ILLEGAL MOVE by ${name} in game ${gameIdx} ply ${plies}:`, JSON.stringify(toEntry(res.move)), adv.reason);
      process.exit(1);
    }
    snap = adv.snap;
    sigs.set(snap.positionSig, (sigs.get(snap.positionSig) || 0) + 1);
    if ((sigs.get(snap.positionSig) || 0) >= 3) {
      return { winner: null, reason: 'threefold', plies };
    }
    plies += 1;
  }
  return { winner: snap.gameOver ? snap.winner : null, reason: snap.gameOverReason || 'move cap', plies };
}

let v2Wins = 0;
let v1Wins = 0;
let draws = 0;
const t0 = performance.now();
for (let g = 0; g < GAMES; g++) {
  const v2IsWhite = g % 2 === 0;
  const white = v2IsWhite ? 'v2' : 'v1';
  const black = v2IsWhite ? 'v1' : 'v2';
  const r = playGame(white, black, g);
  const v2Result = r.winner === null ? 'draw' : (r.winner === 'white') === v2IsWhite ? 'win' : 'loss';
  if (v2Result === 'win') v2Wins += 1;
  else if (v2Result === 'loss') v1Wins += 1;
  else draws += 1;
  console.log(`game ${g}: v2 as ${v2IsWhite ? 'white' : 'black'} -> ${v2Result} (${r.reason}, ${r.plies} plies) [running v2 ${v2Wins}-${draws}-${v1Wins}]`);
}

const score = (v2Wins + draws / 2) / GAMES;
const elo = score <= 0 ? -Infinity : score >= 1 ? Infinity : Math.round(-400 * Math.log10(1 / score - 1));
const secs = ((performance.now() - t0) / 1000).toFixed(0);
console.log(`\n=== MATCH: V2 vs V1, ${GAMES} games @ ${MS}ms/move ===`);
console.log(`V2: ${v2Wins} wins, ${draws} draws, ${v1Wins} losses — score ${(100 * score).toFixed(1)}%  (${elo >= 0 ? '+' : ''}${elo} Elo)  [${secs}s]`);
console.log(`avg completed depth: v1 ${(depthStats.v1.sum / Math.max(1, depthStats.v1.n)).toFixed(2)}  v2 ${(depthStats.v2.sum / Math.max(1, depthStats.v2.n)).toFixed(2)}`);
