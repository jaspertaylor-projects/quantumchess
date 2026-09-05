// Purpose: Select and apply one jointly census-safe contact-zap volley.
// Collapse propagation is intentional; only impossible census combinations
// and removal of the final royal branch are rejected.
// Imports From: ./gameConstants.js, ./engineTypes.js, ./engineConservation.js
// Exported To: ./quantumEngine.js

import { CONTACT_ZAP_ORDER } from './gameConstants.js';
import { clonePieces, restrictTypes } from './engineTypes.js';
import { applyQuantumConstraints, isCensusConsistent } from './engineConservation.js';

const otherSide = (side) => (side === 'white' ? 'black' : 'white');

export function applyCensusSafeZapVolley(pieces, moverSide, contacts) {
  const targetSide = otherSide(moverSide);
  const zapTargets = [];
  for (const target of contacts) {
    if (target.side === moverSide) continue;
    const live = pieces.find((piece) => (
      piece.id === target.id && !piece.captured && piece.square
    ));
    if (!live || (live.possibleTypes || []).length <= 1) continue;
    const options = CONTACT_ZAP_ORDER.filter((type) => live.possibleTypes.includes(type));
    if (options.length) zapTargets.push({ id: live.id, square: live.square, options });
  }

  const kingHolderIds = pieces
    .filter((piece) => (
      !piece.captured && piece.square && piece.side === targetSide &&
      (piece.possibleTypes || []).includes('k')
    ))
    .map((piece) => piece.id);
  const kingShedIds = new Set(
    zapTargets.filter((target) => target.options[0] === 'k').map((target) => target.id),
  );
  const wouldEraseFinalKing = (
    kingHolderIds.length > 0 && kingHolderIds.every((id) => kingShedIds.has(id))
  );

  // When every royal holder was about to shed King, all affected targets
  // start one rung lower. The joint search never reintroduces that King shed.
  if (wouldEraseFinalKing) {
    for (const target of zapTargets) {
      if (target.options[0] === 'k') target.options = target.options.slice(1);
    }
  }

  let bestSelection = new Array(zapTargets.length).fill(null);
  let bestCount = -1;
  let bestVolley = pieces;
  const selection = new Array(zapTargets.length).fill(null);
  const mustKeepKing = kingHolderIds.length > 0;
  const stateIsSafe = (trial) => (
    (!mustKeepKing || trial.some((piece) => (
      !piece.captured && piece.square && piece.side === targetSide &&
      (piece.possibleTypes || []).includes('k')
    ))) &&
    isCensusConsistent(trial, targetSide)
  );

  // Maximize successful contacts. High-to-low options and algebraic contact
  // order provide the deterministic tie-break; null (shield) is tried last.
  const search = (index, count, trial) => {
    if (bestCount === zapTargets.length) return;
    if (count + (zapTargets.length - index) < bestCount) return;
    if (index === zapTargets.length) {
      if (count > bestCount) {
        bestCount = count;
        bestSelection = [...selection];
        bestVolley = trial;
      }
      return;
    }

    const target = zapTargets[index];
    for (const shed of target.options) {
      const nextTrial = clonePieces(trial);
      const trialTarget = nextTrial.find((piece) => piece.id === target.id);
      restrictTypes(
        trialTarget,
        (trialTarget.possibleTypes || []).filter((type) => type !== shed),
      );
      if (!stateIsSafe(nextTrial)) continue;
      selection[index] = shed;
      search(index + 1, count + 1, nextTrial);
      if (bestCount === zapTargets.length) return;
    }

    selection[index] = null;
    search(index + 1, count, trial);
  };

  search(0, 0, pieces);
  if (bestCount <= 0) return { pieces, zappedSquares: [] };

  return {
    pieces: applyQuantumConstraints(bestVolley),
    zappedSquares: zapTargets
      .filter((_, index) => Boolean(bestSelection[index]))
      .map((target) => target.square),
  };
}
