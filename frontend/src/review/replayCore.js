// frontend/src/review/replayCore.js
// Purpose: Rebuild a finished game's full snapshot timeline from the move
// list stored in qc_games.moves, for the premium game-review feature. Pure
// functions (no React); the per-move rules live in chessboard/advanceCore.js
// so review, live play, fixtures and the miner can't drift apart.
// Imports From: ../chessboard/advanceCore.js
// Exported To: ./ReviewModal.jsx

import { advanceEntry, makeInitialSnapshot } from '../chessboard/advanceCore.js';

// Stored moves are one record per half-move: { from, to, side, enPassant }
// plus castle: true on both halves of a castle (the only action that
// records twice in one turn). The flags make replay lossless — see
// store/gameSlice.js addMove.
function toReplayEntries(storedMoves) {
  const moves = Array.isArray(storedMoves) ? storedMoves : [];
  const entries = [];
  let i = 0;
  while (i < moves.length) {
    const m = moves[i];
    if (!m || typeof m.from !== 'string' || typeof m.to !== 'string') { i += 1; continue; }
    const next = moves[i + 1];
    const isCastlePair = next && next.side === m.side &&
      typeof next.from === 'string' && typeof next.to === 'string';
    if (isCastlePair) {
      entries.push({ type: 'castle', piece1_from: m.from, piece2_from: next.from });
      i += 2;
    } else {
      entries.push({ type: 'move', from: m.from, to: m.to, enPassant: m.enPassant === true });
      i += 1;
    }
  }
  return entries;
}

// Rebuilds the timeline. Returns { snapshots, entries, incomplete } —
// snapshots[0] is the starting position, snapshots[k] the position after
// entries[k-1]. incomplete is true when a malformed record could not be
// replayed; the timeline then covers the game up to that point.
export function buildReviewTimeline(storedMoves) {
  const entries = toReplayEntries(storedMoves);
  let snap = makeInitialSnapshot();
  const snapshots = [snap];
  let incomplete = false;

  for (const e of entries) {
    const adv = advanceEntry(snap, e, snapshots);
    if (!adv.ok) { incomplete = true; break; }
    snap = adv.snap;
    snapshots.push(snap);
    if (snap.gameOver) break;
  }

  return { snapshots, entries: entries.slice(0, snapshots.length - 1), incomplete };
}
