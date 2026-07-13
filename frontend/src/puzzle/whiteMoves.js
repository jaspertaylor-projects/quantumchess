// frontend/src/puzzle/whiteMoves.js
// Purpose: The white-move scanner — every legal white move with its fully
// resolved result, mirroring live-game legality. Extracted from
// puzzleBoardKit.js (2026-07-12) so the LIVE mined-puzzle surface
// (usePuzzleBoard, minedPreview, MinedPuzzleModal) doesn't import through
// the PARKED classic-era construction kit, whose recipe code references
// engine exports deleted with the classic ruleset.
// Imports From: ../chessboard/advanceCore.js, ../chessboard/quantumEngine.js
// Exported To: ./puzzleBoardKit.js (re-export), ./usePuzzleBoard.js,
//   ./minedPreview.js

import { buildLastMoveRecord } from '../chessboard/advanceCore.js';
import {
  buildOccupancy,
  hasCollapsedKingCapturable,
  listEnPassantCaptures,
  mergedDestinations,
  simulateEnPassant,
  simulateStandardMove,
} from '../chessboard/quantumEngine.js';

// buildLastMoveRecord signature adapter for the scanner's call sites.
export function buildLastMove(afterPieces, mover, from, to, enPassant, measuredSquares, side = 'white') {
  return buildLastMoveRecord({
    finalPieces: afterPieces,
    moverId: mover.id,
    from,
    to,
    side,
    usedEnPassant: enPassant,
    wasFirstMove: (mover.moveCount || 0) === 0,
    measuredSquares,
  });
}

// Every legal white move with its fully-resolved result. Mirrors the game's
// legality (including the collapsed-king filter); castling is omitted —
// recipes mark pieces moved, so none exists.
export function enumerateWhiteMoves(pieces, lastMove = null, captureCounter = 0) {
  const out = [];

  for (const ep of listEnPassantCaptures(pieces, 'white', lastMove)) {
    const sim = simulateEnPassant(pieces, ep.pieceId, ep.to, ep.victimId, captureCounter);
    if (!sim.ok) continue;
    if (hasCollapsedKingCapturable(sim.pieces, 'white')) continue;
    const mover = pieces.find((p) => p.id === ep.pieceId);
    out.push({
      from: mover.square,
      to: ep.to,
      enPassant: true,
      pieceId: mover.id,
      after: sim.pieces,
      didCapture: true,
      nextCC: captureCounter + 1,
      measuredSquares: sim.measuredSquares || [],
      zappedSquares: sim.zappedSquares || [],
      healedSquares: sim.healedSquares || [],
      fizzledSquares: sim.fizzledSquares || [],
      nextLastMove: buildLastMove(sim.pieces, mover, mover.square, ep.to, true, sim.measuredSquares),
    });
  }

  const occ = buildOccupancy(pieces);
  for (const p of pieces) {
    if (p.captured || p.side !== 'white' || !p.square) continue;
    const merged = mergedDestinations(p, occ, { isFirstMove: (p.moveCount || 0) === 0 });
    for (const to of merged) {
      const sim = simulateStandardMove(pieces, p.id, to, captureCounter);
      if (!sim.ok) continue;
      if (hasCollapsedKingCapturable(sim.pieces, 'white')) continue;
      out.push({
        from: p.square,
        to,
        enPassant: false,
        pieceId: p.id,
        after: sim.pieces,
        didCapture: Boolean(sim.didCapture),
        nextCC: captureCounter + (sim.didCapture ? 1 : 0),
        measuredSquares: sim.measuredSquares || [],
        zappedSquares: sim.zappedSquares || [],
        healedSquares: sim.healedSquares || [],
        fizzledSquares: sim.fizzledSquares || [],
        nextLastMove: buildLastMove(sim.pieces, p, p.square, to, false, sim.measuredSquares),
      });
    }
  }

  return out;
}
