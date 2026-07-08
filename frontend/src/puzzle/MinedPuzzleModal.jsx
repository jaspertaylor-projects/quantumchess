// frontend/src/puzzle/MinedPuzzleModal.jsx
// Purpose: The mined-puzzle experience (dev preview via ?mined=N; the shape
// of the future mined daily). One chance, no attempt dots: the player bars
// (you as White vs the Stranger) frame the board exactly like a live game —
// user piece colors, board colors, and capture trays — and an EvalGauge
// below the board wobbles until the player commits a move, then lands on
// that move's evaluation. Ticks mark the eval of every legal move.
// Imports From: ../theme.js, ../components/ModalShell.jsx, ../tutorial/MiniBoard.jsx,
//   ../components/PlayerBar.jsx, ./EvalGauge.jsx, ./usePuzzleBoard.js,
//   ./puzzleGenerator.js, ../ai/alphaBetaEngine.js
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import ModalShell from '../components/ModalShell.jsx';
import { X as XIcon, Pickaxe } from 'lucide-react';
import MiniBoard from '../tutorial/MiniBoard.jsx';
import PlayerBar from '../components/PlayerBar.jsx';
import EvalGauge from './EvalGauge.jsx';
import usePuzzleBoard from './usePuzzleBoard.js';
import { generateLegalReplies, evaluateTerminalAfterMove } from '../chessboard/quantumEngine.js';
import { checkPuzzleMove } from './puzzleGenerator.js';
import { evaluatePosition } from '../ai/alphaBetaEngine.js';

// A move's honest worth is what it leaves you AFTER Black's best answer —
// static eval alone rates "hangs the queen" as fine. One ply of lookahead
// (min over Black's replies) is what the gauge ticks show. ~20-60ms per move.
function replyAwareEval(move) {
  const replies = generateLegalReplies(move.after, 'black', move.nextCC, move.nextLastMove);
  if (replies.length === 0) {
    const terminal = evaluateTerminalAfterMove(move.after, 'white', move.nextCC, move.nextLastMove);
    return terminal === 'checkmate' ? 30 : 0; // mate | stalemate
  }
  let worst = Infinity;
  for (const r of replies) worst = Math.min(worst, evaluatePosition(r.resultPieces));
  return worst;
}

function capturedOf(pieces, side, pawns) {
  return (pieces || [])
    .filter((p) => p.captured && p.side === side && Array.isArray(p.possibleTypes)
      && (pawns ? p.possibleTypes[0] === 'p' : p.possibleTypes[0] !== 'p'))
    .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
}

// The share score: fill is LINEAR from a floor of −5 up to the maximum
// possible score (the best move's eval on the needle's ruler). Land the
// max → full bar; −5 or worse → empty.
const SCORE_FLOOR = -5;
const SCORE_BLOCKS = 7;

function ScoreBar({ landed, maxScore }) {
  if (landed === null || !Number.isFinite(maxScore)) return null;
  const span = Math.max(0.01, maxScore - SCORE_FLOOR);
  const fill = Math.max(0, Math.min(1, (landed - SCORE_FLOOR) / span));
  const filled = Math.round(fill * SCORE_BLOCKS);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 3 }} aria-label={`Score ${landed} of a possible ${maxScore.toFixed(1)}`}>
        {Array.from({ length: SCORE_BLOCKS }, (_, i) => (
          <div
            key={i}
            style={{
              width: 22, height: 14, borderRadius: 3,
              background: i < filled ? '#e8e6e1' : 'rgba(255,255,255,0.10)',
              border: `1px solid ${i < filled ? '#e8e6e1' : 'rgba(255,255,255,0.22)'}`,
              boxShadow: i < filled ? '0 0 6px rgba(232,230,225,0.45)' : 'none',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#e8e6e1', fontVariantNumeric: 'tabular-nums' }}>
        {`${landed >= 0 ? '+' : ''}${landed.toFixed(1)} of +${maxScore.toFixed(1)}`}
      </span>
    </div>
  );
}

export default function MinedPuzzleModal({
  open = false,
  onClose = () => {},
  puzzle = null,
  svgStyleBySide = null,
  boardColors = null,
  playerBarColors = { background: '#000', text: '#fff' },
  selfAvatar = null,
  selfRating = '????',
  strangerAvatar = null,
}) {
  const [plyIdx, setPlyIdx] = useState(0);
  const [phase, setPhase] = useState('playing'); // playing | landing | done
  const [deepEvals, setDeepEvals] = useState(null); // moveKey -> depth-3 score, from the worker
  const workerRef = useRef(null);
  const [needleValue, setNeedleValue] = useState(null);
  const [outcome, setOutcome] = useState(null); // { solved }
  const [revealArrow, setRevealArrow] = useState(null);

  const ply = puzzle ? puzzle.plies[plyIdx] : null;

  // Shared board wiring: display/marks/selection state, memos, handlers, the
  // MiniBoard piece list, and timers. attemptMove is defined below — it only
  // runs from user events, well after render.
  const {
    display, setDisplay, setMarks, selectedSq, setSelectedSq,
    targets, moves, boardPieces,
    handleSquareClick, canDragFrom, handleDragStart, handleDrop,
    later, clearTimers,
  } = usePuzzleBoard({
    ply,
    playing: phase === 'playing',
    onMove: (from, to) => attemptMove(from, to),
  });

  useEffect(() => {
    if (!open || !puzzle) return undefined;
    setPlyIdx(0);
    setPhase('playing');
    setDisplay(puzzle.plies[0].pieces);
    setMarks([]);
    setSelectedSq(null);
    setNeedleValue(null);
    setOutcome(null);
    setRevealArrow(null);
    return () => { clearTimers(); };
  }, [open, puzzle]);

  const keyOf = (m) => `${m.from}>${m.to}${m.enPassant ? 'ep' : ''}`;

  // Ruler alignment: the miner certifies at search depth, so the gauge must
  // measure with the same ruler. A worker scores every root move at depth 3;
  // until it answers, the instant 1-ply reply-aware evals below stand in.
  useEffect(() => {
    if (!open || !ply) return undefined;
    setDeepEvals(null);
    const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type !== 'analysis' || d.id !== plyIdx || !d.moves) return;
      const map = {};
      for (const m of d.moves) map[`${m.from}>${m.to}${m.enPassant ? 'ep' : ''}`] = m.score;
      setDeepEvals(map);
    };
    worker.postMessage({
      type: 'analyze',
      id: plyIdx,
      payload: { pieces: ply.pieces, sideToMove: 'white', lastMove: ply.lastMove || null, depth: 3, timeMs: 25000 },
    });
    return () => { worker.terminate(); workerRef.current = null; };
  }, [open, ply, plyIdx]);

  // Gauge ticks compute progressively (a few moves per frame) so the needle
  // wobbles while the red lines fade in — the dial reads as "scanning".
  const [evalByIdx, setEvalByIdx] = useState({});
  const evalRef = useRef({});
  useEffect(() => {
    evalRef.current = {};
    setEvalByIdx({});
    if (!moves.length || phase === 'done') return undefined;
    let alive = true;
    let i = 0;
    const CHUNK = 3;
    const step = () => {
      if (!alive) return;
      const upto = Math.min(i + CHUNK, moves.length);
      for (; i < upto; i++) evalRef.current[i] = replyAwareEval(moves[i]);
      setEvalByIdx({ ...evalRef.current });
      if (i < moves.length) later(step, 0);
    };
    step();
    return () => { alive = false; };
  }, [moves]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = useMemo(
    () => (deepEvals ? Object.values(deepEvals) : Object.values(evalByIdx)),
    [deepEvals, evalByIdx]
  );

  const evalOfMove = (move) => {
    if (deepEvals && deepEvals[keyOf(move)] !== undefined) return deepEvals[keyOf(move)];
    const idx = moves.findIndex((m) => m.from === move.from && m.to === move.to
      && Boolean(m.enPassant) === Boolean(move.enPassant));
    if (idx === -1) return null;
    if (evalRef.current[idx] === undefined) evalRef.current[idx] = replyAwareEval(moves[idx]);
    return evalRef.current[idx];
  };

  const whiteLossPawns = useMemo(() => capturedOf(display, 'white', true), [display]);
  const whiteLossOthers = useMemo(() => capturedOf(display, 'white', false), [display]);
  const blackLossPawns = useMemo(() => capturedOf(display, 'black', true), [display]);
  const blackLossOthers = useMemo(() => capturedOf(display, 'black', false), [display]);

  const attemptMove = (fromSq, toSq) => {
    const { correct, move } = checkPuzzleMove(puzzle, plyIdx, fromSq, toSq);
    setSelectedSq(null);
    if (!move) return; // not a legal destination

    // One chance: the needle lands on the eval of the move made.
    const landed = evalOfMove(move);
    setDisplay(move.after);
    setMarks(move.measuredSquares || []);
    setNeedleValue(landed !== null ? Number(landed.toFixed(2)) : null);
    setPhase('landing');

    if (correct && plyIdx < puzzle.plies.length - 1) {
      // Multi-move chain: brief pause, Black replies, gauge re-arms.
      later(() => {
        setPlyIdx(plyIdx + 1);
        setDisplay(puzzle.plies[plyIdx + 1].pieces);
        setMarks([]);
        setNeedleValue(null);
        setPhase('playing');
      }, 1600);
      return;
    }

    later(() => {
      if (!correct) {
        // Teach the payoff: show what the only move does, with an arrow.
        setDisplay(ply.solutionAfter);
        setMarks(ply.solutionMeasured || []);
        setRevealArrow({ from: ply.solution.from, to: ply.solution.to });
      }
      setOutcome({ solved: correct });
      setPhase('done');
    }, 1400);
  };

  if (!open || !puzzle) return null;

  // Fit width AND height: bars + gauge + chrome need ~430px of the card.
  const cell = Math.max(30, Math.min(
    52,
    Math.floor((Math.min(window.innerWidth * 0.94, 560) - 66) / 8),
    Math.floor((window.innerHeight * 0.94 - 475) / 8)
  ));
  const styles = {
    card: {
      background: theme.cardBackground, border: `1px solid ${theme.border}`,
      borderRadius: 14, boxShadow: `0 18px 50px ${theme.shadow}`,
      padding: '14px 16px 16px', width: 'min(96vw, 600px)',
      maxHeight: '94vh', overflowY: 'auto', boxSizing: 'border-box',
    },
    headRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    kicker: {
      fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: 6,
    },
    boardWrap: { display: 'flex', justifyContent: 'center', margin: '4px 0' },
    barWrap: { margin: '4px 0' },
    banner: (kind) => ({
      textAlign: 'center', fontWeight: 700, borderRadius: 10, padding: '8px 12px', margin: '8px 0 0',
      background: kind === 'good' ? 'rgba(126,231,135,0.12)' : 'rgba(255,107,107,0.12)',
      border: `1px solid ${kind === 'good' ? 'rgba(126,231,135,0.5)' : 'rgba(255,107,107,0.5)'}`,
      color: kind === 'good' ? '#7ee787' : '#ff8f8f',
    }),
  };

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      zIndex={1001}
      ariaLabel="Mined puzzle"
      backdropClassName="qc-mined-backdrop"
      panelClassName="qc-mined-card"
      panelStyle={styles.card}
    >
        <div style={styles.headRow}>
          <div style={styles.kicker}>
            <Pickaxe size={13} /> Mined puzzle · {puzzle.recipe.moves} move{puzzle.recipe.moves > 1 ? 's' : ''} · one chance
          </div>
          <IconButton icon={XIcon} label="Close mined puzzle" onClick={onClose} />
        </div>

        <div style={styles.barWrap}>
          <PlayerBar
            side="black"
            playerName={(strangerAvatar && strangerAvatar.name) || 'Stranger'}
            rating="????"
            avatar={strangerAvatar}
            tagline={strangerAvatar ? strangerAvatar.tagline : null}
            playerBarColors={playerBarColors}
            svgStyles={svgStyleBySide || { white: {}, black: {} }}
            showClock={false}
            capturedPawns={whiteLossPawns}
            capturedOthers={whiteLossOthers}
          />
        </div>

        <div style={styles.boardWrap}>
          <MiniBoard
            files={8}
            ranks={8}
            cell={cell}
            squareColors={boardColors}
            pieces={boardPieces}
            arrows={revealArrow ? [{ ...revealArrow, side: 'white' }] : []}
            highlights={selectedSq ? [selectedSq] : []}
            targets={targets}
            onSquareClick={handleSquareClick}
            canDrag={phase === 'playing' ? canDragFrom : null}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            svgStyleBySide={svgStyleBySide}
          />
        </div>

        <div style={styles.barWrap}>
          <PlayerBar
            side="white"
            playerName={(selfAvatar && selfAvatar.name) || 'Anonymous'}
            rating={selfRating}
            avatar={selfAvatar}
            tagline={selfAvatar ? selfAvatar.tagline : null}
            playerBarColors={playerBarColors}
            svgStyles={svgStyleBySide || { white: {}, black: {} }}
            showClock={false}
            capturedPawns={blackLossPawns}
            capturedOthers={blackLossOthers}
          />
        </div>

        <EvalGauge ticks={ticks} value={needleValue} width={290} />

        {outcome ? (
          <>
            <ScoreBar landed={needleValue} maxScore={Math.max(...ticks, needleValue ?? 0)} />
            <div style={styles.banner(outcome.solved ? 'good' : 'bad')}>
              {outcome.solved
                ? '✓ The only move. The needle knew.'
                : `✗ It collapsed. The only move was ${puzzle.plies[plyIdx].solution.from} → ${puzzle.plies[plyIdx].solution.to}.`}
            </div>
          </>
        ) : null}
    </ModalShell>
  );
}
