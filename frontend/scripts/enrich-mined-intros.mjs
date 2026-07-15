// Add the true pre-mistake snapshot to the current mined preview fixture.
// Usage: node scripts/enrich-mined-intros.mjs [--write]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReviewTimeline } from '../src/review/replayCore.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewPath = path.join(frontendRoot, 'src/puzzle/minedPreviewData.json');
const gamesPath = path.join(frontendRoot, 'src/puzzle/minedGamesData.json');
const preview = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
const gameData = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));

const mirrorSide = (side) => (side === 'white' ? 'black' : 'white');
const mirrorSquare = (square) => (square ? `${square[0]}${9 - Number(square[1])}` : square);

function mirrorLastMove(move) {
  if (!move) return null;
  return {
    ...move,
    side: mirrorSide(move.side),
    from: mirrorSquare(move.from),
    to: mirrorSquare(move.to),
    crossedSquare: mirrorSquare(move.crossedSquare),
    zappedSquares: (move.zappedSquares || []).map(mirrorSquare),
    healedSquares: (move.healedSquares || []).map(mirrorSquare),
    fizzledSquares: (move.fizzledSquares || []).map(mirrorSquare),
  };
}

function mirrorSnapshot(snapshot) {
  return {
    pieces: snapshot.pieces.map((piece) => ({
      ...piece,
      side: mirrorSide(piece.side),
      square: mirrorSquare(piece.square),
      possibleTypes: [...(piece.possibleTypes || [])],
      baseTypes: [...(piece.baseTypes || [])],
      promoTypes: [...(piece.promoTypes || [])],
    })),
    lastMove: mirrorLastMove(snapshot.lastMove),
    captureCounter: snapshot.captureCounter,
    sideToMove: mirrorSide(snapshot.sideToMove),
  };
}

function positionKey(pieces) {
  return pieces
    .map((piece) => `${piece.id}:${piece.side}:${piece.square || '-'}:${(piece.possibleTypes || []).join('')}:${Boolean(piece.captured)}`)
    .sort()
    .join('|');
}

const timelines = new Map();
for (const chain of preview.chains) {
  const game = gameData.games.find((candidate) => candidate.gameIdx === chain.game);
  if (!game) throw new Error(`Missing source game ${chain.game}`);
  if (!timelines.has(game.gameIdx)) timelines.set(game.gameIdx, buildReviewTimeline(game.moves));
  const timeline = timelines.get(game.gameIdx);
  if (timeline.incomplete || !timeline.snapshots[chain.startPly]) {
    throw new Error(`Could not replay game ${chain.game} through ply ${chain.startPly}`);
  }

  const transform = chain.mirrored ? mirrorSnapshot : (snapshot) => snapshot;
  const before = transform(timeline.snapshots[chain.startPly - 1]);
  const after = transform(timeline.snapshots[chain.startPly]);
  if (positionKey(after.pieces) !== positionKey(chain.start.pieces)) {
    throw new Error(`Replayed start mismatch for game ${chain.game} ply ${chain.startPly}`);
  }
  if (after.lastMove?.from !== chain.mistake.from || after.lastMove?.to !== chain.mistake.to) {
    throw new Error(`Mistake move mismatch for game ${chain.game} ply ${chain.startPly}`);
  }

  chain.intro = {
    pieces: before.pieces,
    lastMove: before.lastMove,
    captureCounter: before.captureCounter,
    sideToMove: 'black',
  };
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(previewPath, `${JSON.stringify(preview, null, 1)}\n`);
  console.log(`Wrote ${preview.chains.length} pre-mistake snapshots to ${previewPath}`);
} else {
  console.log(`Verified ${preview.chains.length} pre-mistake snapshots; pass --write to update the fixture.`);
}

