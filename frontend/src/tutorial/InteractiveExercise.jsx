// frontend/src/tutorial/InteractiveExercise.jsx
// Purpose: A hands-on tutorial step: the player makes real moves on a small
// position and the REAL game engine resolves them — collapses, pulses,
// entanglement and check threats all behave exactly as in a live game.
// Imports From: ./MiniBoard.jsx, ../theme.js, ../chessboard/quantumEngine.js
// Exported To: ./TutorialModal.jsx

import React, { useMemo, useState } from 'react';
import theme from '../theme.js';
import MiniBoard from './MiniBoard.jsx';
import {
  simulateStandardMove,
  simulateCastle,
  computeCastlePlanInPosition,
  generateLegalReplies,
  listCheckThreats,
} from '../chessboard/quantumEngine.js';

function buildPieces(specs) {
  return specs.map((s) => ({
    id: s.id,
    side: s.side,
    square: s.square,
    possibleTypes: s.types.split(''),
    baseTypes: s.types.split(''),
    promoTypes: [],
    captured: false,
    moveCount: s.moved ? 1 : 0,
    wasPromoted: false,
    coherence: 3,
    recohere: 0,
    entangledWith: null,
    castled: false,
    observed: false,
  }));
}

export default function InteractiveExercise({ spec, svgStyleBySide = null }) {
  const [pieces, setPieces] = useState(() => buildPieces(spec.pieces));
  const [selectedId, setSelectedId] = useState(null);
  const [marks, setMarks] = useState([]);
  const [status, setStatus] = useState('ready'); // ready | wrong | done
  const [msg, setMsg] = useState(spec.prompt);

  const live = pieces.filter((p) => !p.captured && p.square);
  const selected = live.find((p) => p.id === selectedId) || null;
  const threats = useMemo(() => listCheckThreats(pieces), [pieces]);

  const targets = useMemo(() => {
    if (!selected || status === 'done') return [];
    const replies = generateLegalReplies(pieces, 'white', 0, null);
    return replies.filter((r) => r.type === 'move' && r.from === selected.square).map((r) => r.to);
  }, [pieces, selected, status]);

  const reset = () => {
    setPieces(buildPieces(spec.pieces));
    setSelectedId(null);
    setMarks([]);
    setStatus('ready');
    setMsg(spec.prompt);
  };

  const handleSquareClick = (sq) => {
    if (status === 'done') return;
    const pc = live.find((p) => p.square === sq);

    if (pc && pc.side === 'white') {
      if (spec.goal.kind === 'castle' && selected && selected.id !== pc.id) {
        const res = computeCastlePlanInPosition(pieces, 'white', selected.id, pc.id);
        if (!res.canCastle) {
          setMsg(res.reason || 'These two pieces cannot castle.');
          setSelectedId(pc.id);
          return;
        }
        const sim = simulateCastle(pieces, res.plan);
        if (!sim.ok) {
          setMsg(sim.reason || 'Castling failed.');
          setSelectedId(null);
          return;
        }
        setPieces(sim.pieces);
        setMarks(sim.measuredSquares || []);
        setSelectedId(null);
        setStatus('done');
        setMsg(spec.success);
        return;
      }
      setSelectedId(pc.id);
      return;
    }

    if (!selected) return;
    const fromSq = selected.square;
    const sim = simulateStandardMove(pieces, selected.id, sq, 0);
    if (!sim.ok) {
      setMsg('Not a legal move for that piece — the dots show where it can go.');
      return;
    }
    setPieces(sim.pieces);
    setMarks(sim.measuredSquares || []);
    setSelectedId(null);
    const g = spec.goal;
    const isGoal = g.kind === 'any' || (g.kind === 'move' && g.from === fromSq && g.to === sq);
    if (isGoal) {
      setStatus('done');
      setMsg(spec.success);
    } else {
      setStatus('wrong');
      setMsg(spec.retry || 'A perfectly legal move — but not this exercise. Hit Reset and try the goal.');
    }
  };

  const mbPieces = live.map((p) => ({
    sq: p.square,
    side: p.side,
    types: p.possibleTypes.join(''),
    pips: p.coherence,
    regain: Math.max(0, p.recohere || 0),
    chain: Boolean(p.entangledWith),
    chevrons: Boolean(p.wasPromoted),
    mark: marks.includes(p.square),
    ring: threats.some((t) => t.to === p.square),
  }));
  const arrows = threats.map((t) => ({ from: t.from, to: t.to, side: t.side }));

  const statusColor = status === 'done' ? '#7ee787' : status === 'wrong' ? '#ffcf6e' : theme.textSecondary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <MiniBoard
        files={spec.files || 8}
        ranks={spec.ranks || 8}
        cell={spec.cell || 42}
        pieces={mbPieces}
        arrows={arrows}
        highlights={selected ? [selected.square] : []}
        targets={targets}
        onSquareClick={handleSquareClick}
        svgStyleBySide={svgStyleBySide}
      />
      <div
        className="qc-tutorial-exercise-status"
        style={{ maxWidth: 500, textAlign: 'center', fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: statusColor }}
      >
        {status === 'done' ? '✓ ' : ''}{msg}
      </div>
      <button
        type="button"
        className="qc-tutorial-exercise-reset"
        onClick={reset}
        style={{
          padding: '5px 12px',
          borderRadius: 7,
          border: `1px solid ${theme.border}`,
          background: 'transparent',
          color: theme.textSecondary,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Reset exercise
      </button>
    </div>
  );
}
