// frontend/src/puzzle/usePuzzleBoard.js
// Purpose: Shared board wiring for the puzzle modals — display/marks/selection
// state, the live/threat/target memos, the click & drag-to-move handlers, the
// MiniBoard piece list, and the timers/later helper. The modals keep their own
// outcome UX (attempts + streak vs one-shot + gauge): the hook calls onMove
// with (from, to) once a legal-looking destination is chosen, and the modal's
// own attempt logic drives the returned setters.
// Imports From: ../chessboard/quantumEngine.js, ./puzzleGenerator.js
// Exported To: ./DailyPuzzleModal.jsx, ./MinedPuzzleModal.jsx

import { useMemo, useRef, useState } from 'react';
import { listCheckThreats } from '../chessboard/quantumEngine.js';
import { enumerateWhiteMoves } from './whiteMoves.js';

// ply: the current puzzle ply ({ pieces, lastMove, ... }) or null.
// playing: true while the player may move (each modal's phase === 'playing').
// onMove(from, to): the modal's attempt logic. May be defined after the hook
//   call in the component body — it is only invoked from event handlers.
// onSelect: optional; fires when a piece is selected by click or drag start
//   (DailyPuzzleModal clears its banner there).
export default function usePuzzleBoard({ ply, playing, onMove, onSelect = null }) {
  const [display, setDisplay] = useState(null); // pieces currently shown
  const [marks, setMarks] = useState([]);
  const [selectedSq, setSelectedSq] = useState(null);
  const timersRef = useRef([]);
  const later = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const live = useMemo(() => (display || []).filter((p) => !p.captured && p.square), [display]);

  // Threat arrows/rings are shown only on move RESULTS — drawing them on the
  // rest position would literally point at the solution.
  const atRest = Boolean(ply && display === ply.pieces && playing);
  const threats = useMemo(
    () => (display && !atRest ? listCheckThreats(display) : []),
    [display, atRest]
  );

  // Every legal White move in the rest position. Feeds the target dots here
  // and MinedPuzzleModal's gauge ticks.
  const moves = useMemo(
    () => (ply ? enumerateWhiteMoves(ply.pieces, ply.lastMove || null) : []),
    [ply]
  );

  const selected = selectedSq ? live.find((p) => p.side === 'white' && p.square === selectedSq) : null;
  const targets = useMemo(() => {
    if (!selected || !playing) return [];
    return Array.from(new Set(moves.filter((m) => m.from === selected.square).map((m) => m.to)));
  }, [selected, playing, moves]);

  const handleSquareClick = (alg) => {
    if (!playing || !ply) return;
    const pc = live.find((p) => p.square === alg);
    if (pc && pc.side === 'white') {
      setSelectedSq(alg);
      if (onSelect) onSelect();
      return;
    }
    if (!selected) return;
    onMove(selected.square, alg);
  };

  // Drag-to-move: picking a piece up selects it (showing its targets), and
  // releasing over another square plays the same move a click pair would.
  const canDragFrom = (alg) => playing
    && live.some((p) => p.square === alg && p.side === 'white');
  const handleDragStart = (alg) => {
    setSelectedSq(alg);
    if (onSelect) onSelect();
  };
  const handleDrop = (from, to) => {
    if (!playing || !ply) return;
    const pc = live.find((p) => p.square === to);
    if (pc && pc.side === 'white') { setSelectedSq(to); return; }
    onMove(from, to);
  };

  // The MiniBoard piece list for the shown position.
  const boardPieces = useMemo(() => live.map((p) => ({
    sq: p.square,
    side: p.side,
    types: p.possibleTypes.join(''),
    pips: p.coherence,
    regain: Math.max(0, p.recohere || 0),
    chevrons: Boolean(p.wasPromoted),
    // Sealed (recoherence-starved) pieces died with the classic ruleset —
    // contact rules have no recoherence clock, so no solid-line pips.
    sealed: false,
    mark: marks.includes(p.square),
    ring: threats.some((t) => t.to === p.square),
  })), [live, display, marks, threats]);

  return {
    display, setDisplay,
    marks, setMarks,
    selectedSq, setSelectedSq,
    live, atRest, threats, selected, targets, moves,
    boardPieces,
    handleSquareClick, canDragFrom, handleDragStart, handleDrop,
    later, clearTimers,
  };
}
