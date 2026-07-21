// frontend/tools/bot-showcase.mjs
// Purpose: Play one reproducible bot-vs-bot showcase through the production
// strong-bot search and advanceCore rules, then write a replay-ready JSON
// record that can be rendered by the social replay video pipeline.
// Usage: node tools/bot-showcase.mjs [whiteBotId] [blackBotId] [output.json] [maxPlies]

import fs from 'node:fs/promises';
import path from 'node:path';
import { makeInitialSnapshot, advanceEntry } from '../src/chessboard/advanceCore.js';
import { searchBestMoveV2 } from '../src/ai/fast/fastSearch2.js';
import { getBotById } from '../src/ai/bots.js';

const whiteId = process.argv[2] || 'ernest-smyslov';
const blackId = process.argv[3] || 'cecilia-chigorin';
const outputPath = path.resolve(process.argv[4] || '../artifacts/ernest-smyslov-vs-cecilia-chigorin.json');
const maxPlies = Math.max(1, Number(process.argv[5]) || 180);
const whiteBot = getBotById(whiteId);
const blackBot = getBotById(blackId);

if (!whiteBot || !blackBot) {
  throw new Error(`Unknown bot id: ${!whiteBot ? whiteId : blackId}`);
}

// Strong bots have no evaluation noise, but their first two moves use the
// product's opening-variety picker. Seed only that choice so this exact game
// can be regenerated for a future higher-resolution render.
let randomState = 0x51a7c0de;
Math.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x100000000;
};

function toEntry(move) {
  if (move?.type === 'castle') {
    return {
      type: 'castle',
      piece1_from: move.plan.piece1_from,
      piece2_from: move.plan.piece2_from,
    };
  }
  return {
    type: 'move',
    from: move.from,
    to: move.to,
    enPassant: move.type === 'enpassant',
  };
}

function moveLabel(entry) {
  if (entry.type === 'castle') return `${entry.piece1_from} ⇄ ${entry.piece2_from}`;
  return `${entry.from} → ${entry.to}${entry.enPassant ? ' ep' : ''}`;
}

let snap = makeInitialSnapshot();
const snapshots = [snap];
const moves = [];
const searchLog = [];
const repetitionSigs = new Map([[snap.positionSig, 1]]);
const startedAt = performance.now();

console.log(`Showcase: ${whiteBot.name} (${whiteBot.rating}) vs ${blackBot.name} (${blackBot.rating})`);
console.log(`Full bot profiles · maximum ${maxPlies} plies · seeded opening`);

for (let ply = 1; !snap.gameOver && ply <= maxPlies; ply += 1) {
  const bot = snap.sideToMove === 'white' ? whiteBot : blackBot;
  const moveStartedAt = performance.now();
  const result = searchBestMoveV2({
    pieces: snap.pieces,
    sideToMove: snap.sideToMove,
    difficulty: bot.tier,
    bot,
    lastMove: snap.lastMove,
    repetitionSigs,
    openingVariety: true,
    adaptiveDepth: true,
  });
  if (!result.move) {
    throw new Error(`${bot.name} returned no move at ply ${ply}.`);
  }

  const entry = toEntry(result.move);
  const advanced = advanceEntry(snap, entry, snapshots);
  if (!advanced.ok) {
    throw new Error(`${bot.name} produced an illegal move at ply ${ply}: ${JSON.stringify(entry)}`);
  }

  snap = advanced.snap;
  snapshots.push(snap);
  moves.push(...advanced.records);
  repetitionSigs.set(snap.positionSig, (repetitionSigs.get(snap.positionSig) || 0) + 1);
  const elapsedMs = Math.round(performance.now() - moveStartedAt);
  searchLog.push({
    ply,
    side: advanced.records[0]?.side || (ply % 2 ? 'white' : 'black'),
    botId: bot.id,
    move: entry,
    depth: result.depth,
    score: result.score,
    nodes: result.nodes,
    elapsedMs,
  });
  console.log(`${String(ply).padStart(3)}. ${bot.name.padEnd(18)} ${moveLabel(entry).padEnd(12)} depth ${String(result.depth).padStart(2)} · ${(elapsedMs / 1000).toFixed(1)}s`);
}

const hitMoveCap = !snap.gameOver;
const reason = hitMoveCap ? `move cap (${maxPlies} plies)` : snap.gameOverReason;
const result = snap.winner === 'white' ? '1-0' : snap.winner === 'black' ? '0-1' : '½-½';
const record = {
  generatedAt: new Date().toISOString(),
  seed: '0x51a7c0de',
  white: { id: whiteBot.id, name: whiteBot.name, rating: whiteBot.rating },
  black: { id: blackBot.id, name: blackBot.name, rating: blackBot.rating },
  result,
  winner: snap.winner,
  reason,
  plies: snapshots.length - 1,
  durationMs: Math.round(performance.now() - startedAt),
  moves,
  searchLog,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
console.log(`Result: ${result} · ${reason} · ${record.plies} plies`);
console.log(`Replay: ${outputPath}`);
