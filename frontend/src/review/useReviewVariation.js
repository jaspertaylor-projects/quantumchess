// frontend/src/review/useReviewVariation.js
// Purpose: Timeline position + alternate variation lines for the review
// modal. Click a piece of the side to move and a destination to branch off
// the game; the line extends move by move through the shared advanceEntry,
// so quantum rules, repetition, and game-over all behave exactly like live
// play. Owns the seek helpers and the modal's keyboard navigation.
// Extracted from ReviewModal.jsx.
// Imports From: ../chessboard/advanceCore.js, ../chessboard/quantumEngine.js
// Exported To: ./ReviewModal.jsx

import { useEffect, useMemo, useState } from 'react';
import { advanceEntry } from '../chessboard/advanceCore.js';
import { generateLegalReplies } from '../chessboard/quantumEngine.js';

export default function useReviewVariation({ open, snapshots, onClose }) {
  const [idx, setIdx] = useState(0);
  const [variation, setVariation] = useState(null); // { baseIdx, snaps, vIdx } — snaps[0] is the branch point
  const [varSel, setVarSel] = useState(null); // selected from-square

  useEffect(() => {
    if (open) setIdx(snapshots.length > 0 ? snapshots.length - 1 : 0);
    setVariation(null);
    setVarSel(null);
  }, [open, snapshots.length]);

  const bounded = Math.max(0, Math.min(idx, snapshots.length - 1));
  const mainSnap = snapshots[bounded] || null;
  const snap = variation ? variation.snaps[variation.vIdx] : mainSnap;

  // Variation move generation for the viewed position (either side).
  const varMoves = useMemo(
    () => (snap && !snap.gameOver
      ? generateLegalReplies(snap.pieces, snap.sideToMove, snap.captureCounter, snap.lastMove)
      : []),
    [snap],
  );

  const goMainline = (i) => {
    setVariation(null);
    setVarSel(null);
    setIdx(i);
  };
  const seekPrev = () => {
    if (!variation) { setIdx((i) => Math.max(0, i - 1)); return; }
    if (variation.vIdx > 0) setVariation({ ...variation, vIdx: variation.vIdx - 1 });
    else goMainline(variation.baseIdx);
    setVarSel(null);
  };
  const seekNext = () => {
    if (!variation) { setIdx((i) => Math.min(snapshots.length - 1, i + 1)); return; }
    setVariation({ ...variation, vIdx: Math.min(variation.snaps.length - 1, variation.vIdx + 1) });
    setVarSel(null);
  };
  const seekStart = () => (variation ? setVariation({ ...variation, vIdx: 0 }) : setIdx(0));
  const seekEnd = () => (variation
    ? setVariation({ ...variation, vIdx: variation.snaps.length - 1 })
    : setIdx(snapshots.length - 1));

  // Click a side-to-move piece to select it, a legal destination to play it.
  // Playing from a mainline position opens a variation; playing mid-variation
  // truncates the tail and continues from there. (Castling: not in v1.)
  const playVariationMove = (from, to) => {
    if (!snap || snap.gameOver || !from || !to) return false;
    const cand = varMoves.filter((m) => m.from === from && m.to === to && m.type !== 'castle');
    if (!cand.length) return false;
    const mv = cand.find((m) => m.type === 'move') || cand[0];
    const entry = { from: mv.from, to: mv.to, enPassant: mv.type === 'enpassant' };
    const prior = variation
      ? [...snapshots.slice(0, variation.baseIdx + 1), ...variation.snaps.slice(1, variation.vIdx + 1)]
      : snapshots.slice(0, bounded + 1);
    const adv = advanceEntry(snap, entry, prior);
    if (!adv.ok) return false;
    setVarSel(null);
    if (variation) {
      const snaps = [...variation.snaps.slice(0, variation.vIdx + 1), adv.snap];
      setVariation({ ...variation, snaps, vIdx: snaps.length - 1 });
    } else {
      setVariation({ baseIdx: bounded, snaps: [mainSnap, adv.snap], vIdx: 1 });
    }
    return true;
  };
  const handleBoardClick = ({ square }) => {
    if (!snap || snap.gameOver || !square) return;
    const pc = snap.pieces.find((p) => !p.captured && p.square === square);
    if (pc && pc.side === snap.sideToMove) {
      // Always select (no toggle): a click's own pointerdown already
      // selected via drag-start, and a toggle here would immediately undo it.
      setVarSel(square);
      return;
    }
    if (!varSel) return;
    playVariationMove(varSel, square);
  };
  const varSelPiece = varSel && snap ? snap.pieces.find((p) => !p.captured && p.square === varSel) : null;
  const varTargets = varSel ? [...new Set(varMoves.filter((m) => m.from === varSel && m.type !== 'castle').map((m) => m.to))] : [];

  // Keyboard navigation while the modal is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); seekPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seekNext(); }
      else if (e.key === 'Home') { e.preventDefault(); seekStart(); }
      else if (e.key === 'End') { e.preventDefault(); seekEnd(); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bound each render: the seek helpers close over live variation state

  return {
    bounded,
    mainSnap,
    snap,
    variation,
    setVariation,
    varSel,
    setVarSel,
    playVariationMove,
    handleBoardClick,
    varSelPiece,
    varTargets,
    goMainline,
    seekPrev,
    seekNext,
    seekStart,
    seekEnd,
  };
}
