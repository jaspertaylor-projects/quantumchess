// frontend/src/tutorial/InteractiveExercise.jsx
// Purpose: A hands-on tutorial step: the player makes real moves on a small
// position and the REAL game engine resolves them — collapses, zaps, heals,
// shields, en passant, promotion and revealed-king checks all behave exactly
// as in a live game. Supports scripted Black replies (autoReply) so lessons
// can land an enemy zap right before the player's eyes.
// Imports From: ./MiniBoard.jsx, ../theme.js, ../chessboard/quantumEngine.js
// Exported To: ./TutorialModal.jsx

import React, { useMemo, useState } from 'react';
import theme from '../theme.js';
import MiniBoard from './MiniBoard.jsx';
import {
  simulateStandardMove,
  simulateEnPassant,
  simulateCastle,
  computeCastlePlanInPosition,
  generateLegalReplies,
  listEnPassantCaptures,
  listCheckThreats,
} from '../chessboard/quantumEngine.js';

function buildPieces(specs) {
  return specs.map((s, i) => ({
    id: s.id || `cap-${i}`,
    side: s.side,
    // Captured spec pieces let a lesson pin the census (e.g. a shield needs
    // the right pieces already off the board).
    square: s.captured ? null : s.square,
    possibleTypes: s.types.split(''),
    // A promoted piece carries its identities as pawn-funded branches.
    baseTypes: s.promoted ? [] : s.types.split(''),
    promoTypes: s.promoted ? s.types.split('') : [],
    captured: Boolean(s.captured),
    captureIndex: s.captured ? i : null,
    moveCount: s.moved || s.captured ? 1 : 0,
    wasPromoted: Boolean(s.promoted),
    castled: Boolean(s.castled),
  }));
}

const EMPTY_MARKS = { zaps: [], heals: [], shields: [] };
const marksFromSim = (sim) => ({
  zaps: sim.zappedSquares || [],
  heals: sim.healedSquares || [],
  shields: sim.fizzledSquares || [],
});

export default function InteractiveExercise({ spec, svgStyleBySide = null }) {
  const [pieces, setPieces] = useState(() => buildPieces(spec.pieces));
  const [lastMove, setLastMove] = useState(() => spec.lastMove || null);
  const [selectedId, setSelectedId] = useState(null);
  const [marks, setMarks] = useState(EMPTY_MARKS);
  const [status, setStatus] = useState('ready'); // ready | wrong | done
  const [msg, setMsg] = useState(spec.prompt);

  const live = pieces.filter((p) => !p.captured && p.square);
  const selected = live.find((p) => p.id === selectedId) || null;
  const threats = useMemo(() => listCheckThreats(pieces), [pieces]);

  const targets = useMemo(() => {
    if (!selected || status === 'done') return [];
    const replies = generateLegalReplies(pieces, 'white', 0, lastMove);
    // A square can be both a quiet move and an en passant capture — dedupe.
    return Array.from(new Set(
      replies
        .filter((r) => (r.type === 'move' || r.type === 'enpassant') && r.from === selected.square)
        .map((r) => r.to)
    ));
  }, [pieces, selected, status, lastMove]);

  const reset = () => {
    setPieces(buildPieces(spec.pieces));
    setLastMove(spec.lastMove || null);
    setSelectedId(null);
    setMarks(EMPTY_MARKS);
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
        setMarks(marksFromSim(sim));
        setLastMove(null);
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
    const g = spec.goal;

    // En passant first when the goal asks for it; otherwise a standard move,
    // falling back to en passant if that is the only legal reading.
    const ep = listEnPassantCaptures(pieces, 'white', lastMove)
      .find((e) => e.pieceId === selected.id && e.to === sq);
    let sim = null;
    let usedEp = false;
    if (ep && g.ep) {
      sim = simulateEnPassant(pieces, selected.id, sq, ep.victimId, 0);
      usedEp = sim.ok;
    }
    if (!sim || !sim.ok) {
      sim = simulateStandardMove(pieces, selected.id, sq, 0);
      usedEp = false;
    }
    if ((!sim || !sim.ok) && ep) {
      sim = simulateEnPassant(pieces, selected.id, sq, ep.victimId, 0);
      usedEp = sim.ok;
    }
    if (!sim || !sim.ok) {
      setMsg('Not a legal move for that piece — the dots show where it can go.');
      return;
    }

    const isGoal =
      g.kind === 'any' ||
      (g.kind === 'move' && g.from === fromSq && g.to === sq && (!g.ep || usedEp));

    let finalPieces = sim.pieces;
    let finalMarks = marksFromSim(sim);

    // Scripted Black reply: lessons use it to land deferred measurement
    // damage or a Zeno reset right before the player's eyes.
    if (isGoal && spec.autoReply) {
      const bp = finalPieces.find((p) => !p.captured && p.square === spec.autoReply.from && p.side === 'black');
      if (bp) {
        const sim2 = simulateStandardMove(finalPieces, bp.id, spec.autoReply.to, 0);
        if (sim2.ok) {
          finalPieces = sim2.pieces;
          finalMarks = marksFromSim(sim2);
        }
      }
    }

    setPieces(finalPieces);
    setMarks(finalMarks);
    setLastMove(null);
    setSelectedId(null);
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
    chevrons: Boolean(p.wasPromoted),
    zap: marks.zaps.includes(p.square),
    heal: marks.heals.includes(p.square),
    shield: marks.shields.includes(p.square),
    ring: threats.some((t) => t.to === p.square),
  }));
  const arrows = threats.map((t) => ({ from: t.from, to: t.to, side: t.side }));

  const statusColor = status === 'done' ? '#7ee787' : status === 'wrong' ? '#ffcf6e' : theme.textSecondary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <MiniBoard
        files={spec.files || 8}
        ranks={spec.ranks || 8}
        cell={Math.max(
          26,
          Math.min(
            spec.cell || 42,
            // Fit the board inside the tutorial panel on narrow screens
            // (94vw panel minus padding and the rank-label gutter).
            Math.floor((window.innerWidth * 0.94 - 70) / (spec.files || 8))
          )
        )}
        pieces={mbPieces}
        arrows={arrows}
        highlights={(selected ? [selected.square] : []).concat(spec.highlights || [])}
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
