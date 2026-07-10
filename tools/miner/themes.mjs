// tools/miner/themes.mjs
// Purpose: Quantum theme tagging over mined moves (the composed generator's
// SUBGOALS recast as detectors: measure3, censusCollapse, seal, unmask,
// epCheck, mate, promo/quiet) and the trickiness score that rates how hard a
// solution is to FIND. Split out of puzzle-miner.mjs.
// Imports From: ../../frontend/src/chessboard/*
// Exported To: ./swing.mjs

import {
  applyQuantumConstraints,
  canPieceRecohere,
  evaluateTerminalAfterMove,
  listCheckThreats,
  simulateCastle,
  simulateEnPassant,
  simulateStandardMove,
} from '../../frontend/src/chessboard/quantumEngine.js';
import { buildLastMoveRecord } from '../../frontend/src/chessboard/advanceCore.js';

// ------------------------------------------------------------ theme tagging

// Re-simulate an analysis move to recover measuredSquares + resolved pieces.
function simulateAnalysisMove(position, move) {
  const { pieces, captureCounter } = position;
  if (move.type === 'castle') {
    const sim = simulateCastle(pieces, move.plan);
    if (!sim.ok) return null;
    return {
      after: applyQuantumConstraints(sim.pieces),
      measuredSquares: sim.measuredSquares || [],
      didCapture: false,
      moverId: move.plan.piece1_id,
      from: move.plan.piece1_from,
      to: move.plan.piece1_to,
      enPassant: false,
      nextCC: captureCounter,
    };
  }
  const mover = pieces.find((p) => !p.captured && p.side === 'white' && p.square === move.from);
  if (!mover) return null;
  const sim = move.type === 'enpassant'
    ? simulateEnPassant(pieces, mover.id, move.to, move.victimId, captureCounter)
    : simulateStandardMove(pieces, mover.id, move.to, captureCounter);
  if (!sim.ok) return null;
  return {
    after: sim.pieces,
    measuredSquares: sim.measuredSquares || [],
    didCapture: Boolean(sim.didCapture),
    moverId: mover.id,
    from: move.from,
    to: move.to,
    enPassant: move.type === 'enpassant',
    nextCC: captureCounter + (sim.didCapture ? 1 : 0),
  };
}

// The composed generator's SUBGOALS, recast as detectors over a mined move:
// instead of demanding a goal, we report which quantum phenomena the move
// exhibits. Names match the daily-puzzle themes for continuity.
function tagThemes(position, moveSim) {
  const before = position.pieces;
  const { after, measuredSquares } = moveSim;
  const themes = [];

  if (measuredSquares.length >= 3) themes.push('measure3'); // The Instrument

  const touched = new Set([moveSim.to, moveSim.from, ...measuredSquares]);
  for (const prev of before) {
    if (prev.captured || !prev.square || prev.side !== 'black') continue;
    const now = after.find((p) => p.id === prev.id);
    if (!now || now.captured) continue;
    if (prev.possibleTypes.length > 1 && now.possibleTypes.length === 1 && !touched.has(prev.square)) {
      themes.push('censusCollapse'); // The Census: collapsed without being touched
      break;
    }
  }

  for (const prev of before) {
    if (prev.captured || !prev.square) continue;
    const now = after.find((p) => p.id === prev.id);
    if (!now || now.captured || now.possibleTypes.length > 2) continue;
    if (prev.possibleTypes.length > 1 && canPieceRecohere(before, prev.id) && !canPieceRecohere(after, prev.id)) {
      themes.push('seal'); // The Seal
      break;
    }
  }

  const holdersBefore = before.filter((p) => !p.captured && p.side === 'black' && p.square && p.possibleTypes.includes('k'));
  const holdersAfter = after.filter((p) => !p.captured && p.side === 'black' && p.square && p.possibleTypes.includes('k'));
  const unmaskedBefore = holdersBefore.length === 1 && holdersBefore[0].possibleTypes.length === 1;
  if (!unmaskedBefore && holdersAfter.length === 1 && holdersAfter[0].possibleTypes.length === 1) {
    themes.push('unmask');
  }

  const givesCheck = listCheckThreats(after).some((t) => t.side === 'white');
  if (moveSim.enPassant && givesCheck) themes.push('epCheck'); // The Phantom
  if (givesCheck) themes.push('check');

  const lastMove = buildLastMoveRecord({
    finalPieces: after,
    moverId: moveSim.moverId,
    from: moveSim.from,
    to: moveSim.to,
    side: 'white',
    usedEnPassant: moveSim.enPassant,
    wasFirstMove: (before.find((p) => p.id === moveSim.moverId)?.moveCount || 0) === 0,
    measuredSquares,
  });
  if (givesCheck && evaluateTerminalAfterMove(after, 'white', moveSim.nextCC, lastMove) === 'checkmate') {
    themes.push('mate'); // Collapse Mate
  }

  // A definite pawn marching into promotion (to the 7th/8th) is the loudest
  // "quiet" move there is — no capture, no check, but the eval sees most of
  // a queen. Tag it 'promo' and keep it OUT of 'quiet', which feeds a
  // trickiness bonus it does not deserve (seed-4 games 93/98 were mislabeled
  // quiet gems this way).
  const moverBefore = before.find((p) => p.id === moveSim.moverId);
  const toRank = Number(moveSim.to && moveSim.to[1]);
  const promoPush = Boolean(moverBefore
    && moverBefore.possibleTypes.length === 1 && moverBefore.possibleTypes[0] === 'p'
    && toRank >= 7);
  if (promoPush) themes.push('promo');
  if (!moveSim.didCapture && !givesCheck && !promoPush) themes.push('quiet');
  return themes;
}

// How hard is the solution to FIND? The BASELINE is how quantum the position
// is — the density of superposed pieces plus how much de/recoherence is in
// flight (pieces mid-transition are exactly where the eye slides off; a
// RUNNING recoherence clock counts here). On top of that: real search
// space, how deep the move is buried
// in the static ordering, a bonus when the SOLUTION'S MOVER is itself
// decohering/recohering (hard to spot, per playtesting), and quiet/theme
// bonuses.
function pieceInFlux(p) {
  const n = (p.possibleTypes || []).length;
  return (p.recohere || 0) > 0 || (n > 1 && (p.coherence ?? 3) < 3);
}

function quantumBaseline(pieces) {
  let alive = 0;
  let superposed = 0;
  let flux = 0;
  for (const p of pieces) {
    if (p.captured || !p.square) continue;
    alive++;
    if ((p.possibleTypes || []).length > 1) superposed++;
    if (pieceInFlux(p)) flux++;
  }
  const density = alive ? superposed / alive : 0;
  return density * 2 + Math.min(flux, 6) * 0.4; // 0 .. ~4.4
}

function plyTrickiness(step) {
  const pieces = step.position.pieces;
  const base = quantumBaseline(pieces);
  const mover = pieces.find((p) => !p.captured && p.square === step.bestMove.from);
  const moverFlux = mover && pieceInFlux(mover) ? 1.5 : 0;
  const hidden = Math.min(step.shallowRank, 8) * 1.2;
  const space = Math.min(step.numChoices, 24) / 8;
  // 'recohere' counts in the theme bonus deliberately: a line where an
  // identity grows back mid-sequence is hard to read ahead of time.
  const themeBonus = step.themes.filter((t) => t !== 'check' && t !== 'quiet' && t !== 'promo').length;
  const quietBonus = step.themes.includes('quiet') ? 1.5 : 0;
  return Number((base + moverFlux + hidden + space + themeBonus + quietBonus).toFixed(2));
}

export { simulateAnalysisMove, tagThemes, pieceInFlux, quantumBaseline, plyTrickiness };
