import { createStartingPieces } from '../src/chessboard/gameConstants.js';
import { generateLegalReplies, evaluateTerminalAfterMove } from '../src/chessboard/quantumEngine.js';
import { buildReviewTimeline } from '../src/review/replayCore.js';
import { mulberry32 } from './fixtureUtil.mjs';

const pieces = createStartingPieces();
let t = Date.now();
const replies = generateLegalReplies(pieces, 'white', 0, null);
console.log(`generateLegalReplies(start): ${replies.length} replies in ${Date.now() - t}ms`);

t = Date.now();
evaluateTerminalAfterMove(replies[0].resultPieces, 'white', 0, null);
console.log(`evaluateTerminalAfterMove: ${Date.now() - t}ms`);

// crude 12-half-move random game, then time its replay
const rng = mulberry32(42);
const moves = [];
let snapPieces = pieces, side = 'white', cc = 0, last = null;
for (let i = 0; i < 12; i++) {
  const rs = generateLegalReplies(snapPieces, side, cc, last);
  if (!rs.length) break;
  const r = rs[Math.floor(rng() * rs.length)].type === 'castle' ? rs.find(x=>x.type==='move') : rs[Math.floor(rng() * rs.length)];
  if (!r || r.type !== 'move') break;
  moves.push({ from: r.from, to: r.to, side, enPassant: false });
  snapPieces = r.resultPieces;
  cc = snapPieces.filter(p=>p.captured).length;
  last = null;
  side = side === 'white' ? 'black' : 'white';
}
t = Date.now();
const tl = buildReviewTimeline(moves);
console.log(`buildReviewTimeline(${moves.length} moves): ${Date.now() - t}ms, snapshots=${tl.snapshots.length}, incomplete=${tl.incomplete}`);
