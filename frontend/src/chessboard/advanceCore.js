// frontend/src/chessboard/advanceCore.js
// Purpose: THE single implementation of "apply one move and derive the next
// game snapshot" — lastMove construction (with the double-step / en passant
// window), the fifty-move progress test, terminal evaluation, position
// signatures, and threefold repetition. Live play (useQuantumGameState),
// game review (review/replayCore.js), the fixture generator
// (tests/generate-engine-fixtures.mjs) and the puzzle miner
// (tools/puzzle-miner.mjs) all advance state through here, so the rules
// cannot silently diverge between them. Pure functions, no React.
// Imports From: ./boardUtils.js, ./gameConstants.js, ./quantumEngine.js
// Exported To: ./useQuantumGameState.js, ../review/replayCore.js,
//   ../../tests/generate-engine-fixtures.mjs, ../../../tools/puzzle-miner.mjs

import { fromAlgebraic, toAlgebraic } from './boardUtils.js';
import { createStartingPieces } from './gameConstants.js';
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
} from './quantumEngine.js';

export const FIFTY_MOVE_HALFMOVES = 100;

export function makeInitialSnapshot() {
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

export function countPossibilities(pieces) {
  let sum = 0;
  for (const p of pieces) sum += (p.possibleTypes || []).length;
  return sum;
}

// Build the lastMove record for a move that just landed: identity, the
// squares the measurement pulse touched, and double-step detection so the
// opponent's en passant window opens. A double-step is a first move, two
// ranks straight ahead, by a piece that can still be a pawn.
export function buildLastMoveRecord({ finalPieces, moverId, from, to, side, usedEnPassant = false, wasFirstMove = false, measuredSquares = [] }) {
  const lastMove = {
    side,
    pieceId: moverId,
    from,
    to,
    isDoubleStep: false,
    crossedSquare: null,
    measuredSquares: measuredSquares || [],
  };
  if (!usedEnPassant && wasFirstMove) {
    const fromPos = fromAlgebraic(from);
    const toPos = fromAlgebraic(to);
    const dir = side === 'white' ? 1 : -1;
    const movedFinal = finalPieces.find((p) => p.id === moverId && !p.captured) || null;
    if (
      fromPos && toPos && movedFinal &&
      fromPos.fileIndex === toPos.fileIndex &&
      toPos.rankIndex - fromPos.rankIndex === 2 * dir &&
      movedFinal.possibleTypes.includes('p')
    ) {
      lastMove.isDoubleStep = true;
      lastMove.crossedSquare = toAlgebraic(fromPos.fileIndex, fromPos.rankIndex + dir);
    }
  }
  return lastMove;
}

// The tail every move path shares, given a SUCCESSFUL simulation: final
// pieces, capture counter, lastMove (with double-step detection so the
// opponent's en passant window opens), fifty-move progress, and terminal
// evaluation. `prev` is the snapshot the move was played from; `info`
// identifies the move: { moverId, from, to, isCastle, usedEnPassant,
// wasFirstMove, moverWasPromoted }.
export function moveOutcome(prev, sim, info) {
  const {
    moverId, from, to,
    isCastle = false, usedEnPassant = false,
    wasFirstMove = false, moverWasPromoted = false,
  } = info;
  const prevPieces = prev.pieces;
  const side = prev.sideToMove;

  const finalPieces = isCastle ? applyQuantumConstraints(sim.pieces) : sim.pieces;
  const didCapture = Boolean(sim.didCapture);
  const nextCaptureCounter = didCapture ? prev.captureCounter + 1 : prev.captureCounter;

  const nextLastMove = buildLastMoveRecord({
    finalPieces,
    moverId,
    from,
    to,
    side,
    usedEnPassant,
    wasFirstMove, // castles pass false, so the double-step check is skipped

    measuredSquares: sim.measuredSquares || [],
  });
  const movedFinal = finalPieces.find((p) => p.id === moverId && !p.captured) || null;

  // Fifty-move clock: "progress" is a capture, a definite pawn move, a
  // promotion, or any net loss of possibilities (information gained — the
  // quantum analog of irreversibility). A castle can only make progress by
  // gaining information: it never captures, and its movers can't be
  // definite pawns or promote.
  let progress;
  const informationGained = countPossibilities(finalPieces) < countPossibilities(prevPieces);
  if (isCastle) {
    progress = informationGained;
  } else {
    const definitePawnMove = Boolean(movedFinal && movedFinal.possibleTypes.length === 1 && movedFinal.possibleTypes[0] === 'p');
    const promotedNow = Boolean(movedFinal && movedFinal.wasPromoted && !moverWasPromoted);
    progress = didCapture || definitePawnMove || promotedNow || informationGained;
  }
  const nextHalfmoveClock = progress ? 0 : (prev.halfmoveClock || 0) + 1;

  const terminal = evaluateTerminalAfterMove(finalPieces, side, nextCaptureCounter, nextLastMove);
  let gameOver = false;
  let winner = null;
  let gameOverReason = null;
  if (terminal === 'checkmate') { gameOver = true; winner = side; gameOverReason = 'checkmate'; }
  else if (terminal === 'stalemate') { gameOver = true; gameOverReason = 'stalemate'; }
  else if (nextHalfmoveClock >= FIFTY_MOVE_HALFMOVES) { gameOver = true; gameOverReason = 'fifty-move rule'; }

  return {
    finalPieces,
    didCapture,
    nextCaptureCounter,
    nextLastMove,
    nextHalfmoveClock,
    gameOver,
    winner,
    gameOverReason,
  };
}

// Turn a moveOutcome into the next full snapshot, including the position
// signature and — when the prior snapshots are provided — the threefold
// repetition check.
export function outcomeToSnapshot(prev, outcome, priorSnaps) {
  const nextSide = prev.sideToMove === 'white' ? 'black' : 'white';
  let { gameOver, winner, gameOverReason } = outcome;
  const positionSig = computePositionSignature(outcome.finalPieces, nextSide, outcome.nextLastMove);
  if (!gameOver && Array.isArray(priorSnaps)) {
    let repeats = 1;
    for (const s of priorSnaps) if (s.positionSig === positionSig) repeats += 1;
    if (repeats >= 3) { gameOver = true; winner = null; gameOverReason = 'threefold repetition'; }
  }
  return {
    pieces: clonePieces(outcome.finalPieces),
    sideToMove: nextSide,
    captureCounter: outcome.nextCaptureCounter,
    gameOver,
    winner,
    gameOverReason,
    lastMove: outcome.nextLastMove,
    halfmoveClock: outcome.nextHalfmoveClock,
    positionSig,
  };
}

// Advance a snapshot by one stored/relayed entry — { type: 'castle',
// piece1_from, piece2_from } or { type: 'move', from, to, enPassant } — the
// shape both qc_games.moves replay and online-rejoin history use. Returns
// { ok: true, snap, records } where records are the move's gameSlice-format
// records ({ from, to, side, enPassant } / castle pairs), or { ok: false }
// when the entry is malformed or does not replay as a legal move.
export function advanceEntry(snap, entry, priorSnaps) {
  const prevPieces = snap.pieces;
  const side = snap.sideToMove;
  const occ = buildOccupancy(prevPieces);

  if (entry && entry.type === 'castle') {
    const p1 = occ.get(entry.piece1_from);
    const p2 = occ.get(entry.piece2_from);
    if (!p1 || !p2) return { ok: false };
    const res = computeCastlePlanInPosition(prevPieces, side, p1.id, p2.id);
    if (!res.canCastle || !res.plan) return { ok: false };
    const sim = simulateCastle(prevPieces, res.plan);
    if (!sim.ok) return { ok: false };
    const outcome = moveOutcome(snap, sim, {
      moverId: res.plan.piece1_id,
      from: res.plan.piece1_from,
      to: res.plan.piece1_to,
      isCastle: true,
    });
    return {
      ok: true,
      snap: outcomeToSnapshot(snap, outcome, priorSnaps),
      records: [
        { from: res.plan.piece1_from, to: res.plan.piece1_to, side, enPassant: false, castle: true },
        { from: res.plan.piece2_from, to: res.plan.piece2_to, side, enPassant: false, castle: true },
      ],
    };
  }

  if (!entry || typeof entry.from !== 'string' || typeof entry.to !== 'string') return { ok: false };
  const piece = occ.get(entry.from);
  if (!piece) return { ok: false };

  let sim;
  let usedEnPassant = false;
  if (entry.enPassant) {
    // A flagged en passant must replay as en passant — records are lossless.
    const ep = listEnPassantCaptures(prevPieces, side, snap.lastMove)
      .find((x) => x.pieceId === piece.id && x.to === entry.to);
    if (!ep) return { ok: false };
    sim = simulateEnPassant(prevPieces, piece.id, entry.to, ep.victimId, snap.captureCounter);
    if (!sim.ok) return { ok: false };
    usedEnPassant = true;
  } else {
    sim = simulateStandardMove(prevPieces, piece.id, entry.to, snap.captureCounter);
    if (!sim.ok) return { ok: false };
  }

  const outcome = moveOutcome(snap, sim, {
    moverId: piece.id,
    from: entry.from,
    to: entry.to,
    usedEnPassant,
    wasFirstMove: (piece.moveCount || 0) === 0,
    moverWasPromoted: Boolean(piece.wasPromoted),
  });
  return {
    ok: true,
    snap: outcomeToSnapshot(snap, outcome, priorSnaps),
    records: [{ from: entry.from, to: entry.to, side, enPassant: usedEnPassant }],
  };
}
