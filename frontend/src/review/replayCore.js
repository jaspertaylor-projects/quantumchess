// frontend/src/review/replayCore.js
// Purpose: Rebuild a finished game's full snapshot timeline from the move
// list stored in qc_games.moves, for the premium game-review feature. Pure
// functions (no React) mirroring useQuantumGameState's replayMoves.
// Imports From: ../chessboard/boardUtils.js, ../chessboard/gameConstants.js, ../chessboard/quantumEngine.js
// Exported To: ./ReviewModal.jsx

import { fromAlgebraic, toAlgebraic } from '../chessboard/boardUtils.js';
import { createStartingPieces } from '../chessboard/gameConstants.js';
import {
  applyQuantumConstraints,
  buildOccupancy,
  clonePieces,
  computeCastlePlanInPosition,
  computePositionSignature,
  evaluateTerminalAfterMove,
  listEnPassantCaptures,
  simulateCastle,
  simulateEnPassant,
  simulateStandardMove,
} from '../chessboard/quantumEngine.js';

const FIFTY_MOVE_HALFMOVES = 100;

function makeInitialSnapshot() {
  const pieces = createStartingPieces();
  return {
    pieces,
    sideToMove: 'white',
    captureCounter: 0,
    gameOver: false,
    winner: null,
    gameOverReason: null,
    lastMove: null,
    halfmoveClock: 0,
    positionSig: computePositionSignature(pieces, 'white', null),
  };
}

function countPossibilities(pieces) {
  let sum = 0;
  for (const p of pieces) sum += (p.possibleTypes || []).length;
  return sum;
}

// Stored moves are one record per half-move: { from, to, side } plus
// optional lossless flags added 2026-07: castle (a castle is two flagged
// records of the same side) and enPassant. Legacy records lack the flags,
// but a two-in-a-row same side can only ever be a castle, since castling is
// the only action that records twice in one turn.
export function toReplayEntries(storedMoves) {
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
      // Records without an explicit enPassant field predate lossless
      // recording; replay treats them as ambiguous rather than as "not ep".
      entries.push({
        type: 'move', from: m.from, to: m.to,
        enPassant: m.enPassant === true,
        legacy: !('enPassant' in m),
      });
      i += 1;
    }
  }
  return entries;
}

// Rebuilds the timeline. Returns { snapshots, entries, incomplete } —
// snapshots[0] is the starting position, snapshots[k] the position after
// entries[k-1]. incomplete is true when a (legacy, lossy) record could not
// be replayed; the timeline then covers the game up to that point.
export function buildReviewTimeline(storedMoves) {
  const entries = toReplayEntries(storedMoves);
  let snap = makeInitialSnapshot();
  const snapshots = [snap];
  let incomplete = false;

  for (const e of entries) {
    const prevPieces = snap.pieces;
    const side = snap.sideToMove;
    const cc = snap.captureCounter;
    const occ = buildOccupancy(prevPieces);
    let finalPieces = null;
    let nextLastMove = null;
    let nextCaptureCounter = cc;
    let progress = false;

    if (e.type === 'castle') {
      const p1 = occ.get(e.piece1_from);
      const p2 = occ.get(e.piece2_from);
      if (!p1 || !p2) { incomplete = true; break; }
      const res = computeCastlePlanInPosition(prevPieces, side, p1.id, p2.id);
      if (!res.canCastle || !res.plan) { incomplete = true; break; }
      const sim = simulateCastle(prevPieces, res.plan);
      if (!sim.ok) { incomplete = true; break; }
      finalPieces = applyQuantumConstraints(sim.pieces);
      nextLastMove = {
        side,
        pieceId: res.plan.piece1_id,
        from: res.plan.piece1_from,
        to: res.plan.piece1_to,
        isDoubleStep: false,
        crossedSquare: null,
        measuredSquares: sim.measuredSquares || [],
      };
      progress = countPossibilities(finalPieces) < countPossibilities(prevPieces);
    } else {
      const piece = occ.get(e.from);
      if (!piece) { incomplete = true; break; }
      const wasFirstMove = (piece.moveCount || 0) === 0;
      const findEp = () => listEnPassantCaptures(prevPieces, side, snap.lastMove)
        .find((x) => x.pieceId === piece.id && x.to === e.to);
      let sim = null;
      let usedEnPassant = false;
      // Flagged records are authoritative. Legacy records dropped the ep
      // marker, and a quantum piece can often make the same diagonal step as
      // a quiet queen/bishop move — so when an ep capture was available at
      // exactly this from→to, that reading is overwhelmingly the real one.
      if (e.enPassant || e.legacy) {
        const ep = findEp();
        if (ep) {
          sim = simulateEnPassant(prevPieces, piece.id, e.to, ep.victimId, cc);
          usedEnPassant = sim.ok;
        }
      }
      if (!sim || !sim.ok) {
        if (e.enPassant) { incomplete = true; break; } // flagged ep must replay as ep
        sim = simulateStandardMove(prevPieces, piece.id, e.to, cc);
        usedEnPassant = false;
      }
      if (!sim || !sim.ok) { incomplete = true; break; }
      finalPieces = sim.pieces;
      nextCaptureCounter = sim.didCapture ? cc + 1 : cc;
      nextLastMove = {
        side,
        pieceId: piece.id,
        from: e.from,
        to: e.to,
        isDoubleStep: false,
        crossedSquare: null,
        measuredSquares: sim.measuredSquares || [],
      };
      const movedFinal = finalPieces.find((p) => p.id === piece.id && !p.captured) || null;
      if (!usedEnPassant && wasFirstMove) {
        const fromPos = fromAlgebraic(e.from);
        const toPos = fromAlgebraic(e.to);
        const dir = side === 'white' ? 1 : -1;
        if (
          fromPos && toPos && movedFinal &&
          fromPos.fileIndex === toPos.fileIndex &&
          toPos.rankIndex - fromPos.rankIndex === 2 * dir &&
          movedFinal.possibleTypes.includes('p')
        ) {
          nextLastMove.isDoubleStep = true;
          nextLastMove.crossedSquare = toAlgebraic(fromPos.fileIndex, fromPos.rankIndex + dir);
        }
      }
      const definitePawnMove = Boolean(movedFinal && movedFinal.possibleTypes.length === 1 && movedFinal.possibleTypes[0] === 'p');
      const promotedNow = Boolean(movedFinal && movedFinal.wasPromoted && !piece.wasPromoted);
      progress = sim.didCapture || definitePawnMove || promotedNow ||
        countPossibilities(finalPieces) < countPossibilities(prevPieces);
    }

    const nextSide = side === 'white' ? 'black' : 'white';
    const nextHalfmove = progress ? 0 : (snap.halfmoveClock || 0) + 1;
    const terminal = evaluateTerminalAfterMove(finalPieces, side, nextCaptureCounter, nextLastMove);
    let over = false;
    let win = null;
    let reason = null;
    if (terminal === 'checkmate') { over = true; win = side; reason = 'checkmate'; }
    else if (terminal === 'stalemate') { over = true; reason = 'stalemate'; }
    else if (nextHalfmove >= FIFTY_MOVE_HALFMOVES) { over = true; reason = 'fifty-move rule'; }

    const positionSig = computePositionSignature(finalPieces, nextSide, nextLastMove);
    if (!over) {
      let repeats = 1;
      for (const s of snapshots) if (s.positionSig === positionSig) repeats += 1;
      if (repeats >= 3) { over = true; reason = 'threefold repetition'; }
    }

    snap = {
      pieces: clonePieces(finalPieces),
      sideToMove: nextSide,
      captureCounter: nextCaptureCounter,
      gameOver: over,
      winner: win,
      gameOverReason: reason,
      lastMove: nextLastMove,
      halfmoveClock: nextHalfmove,
      positionSig,
    };
    snapshots.push(snap);
    if (over) break;
  }

  return { snapshots, entries: entries.slice(0, snapshots.length - 1), incomplete };
}
