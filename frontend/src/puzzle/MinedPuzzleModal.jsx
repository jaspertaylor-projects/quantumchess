// frontend/src/puzzle/MinedPuzzleModal.jsx
// Purpose: The mined-puzzle experience in PAR MODE (dev preview via
// ?mined=N; the shape of the future mined daily). Black just made the
// game's first mistake — the board shows that move — and the player gets
// puzzle.recipe.moves FREE moves to capitalize, the engine answering as
// Black live. Every move lands the needle on its eval and earns a graded
// square vs the certified par eval for that ply; the final landing vs par
// is the FIDELITY score, with a Wordle-style share text.
// Imports From: ../theme.js, ../components/ModalShell.jsx, ../tutorial/MiniBoard.jsx,
//   ../components/PlayerBar.jsx, ./EvalGauge.jsx, ./usePuzzleBoard.js,
//   ../chessboard/quantumEngine.js, ../chessboard/boardUtils.js, ../ai/alphaBetaEngine.js
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import ModalShell from '../components/ModalShell.jsx';
import { X as XIcon, Pickaxe, Copy as CopyIcon } from 'lucide-react';
import MiniBoard from '../tutorial/MiniBoard.jsx';
import PlayerBar from '../components/PlayerBar.jsx';
import EvalGauge from './EvalGauge.jsx';
import usePuzzleBoard from './usePuzzleBoard.js';
import {
  generateLegalReplies,
  evaluateTerminalAfterMove,
  simulateStandardMove,
} from '../chessboard/quantumEngine.js';
import { fromAlgebraic, toAlgebraic } from '../chessboard/boardUtils.js';
import { capturedPieces } from '../chessboard/boardUtils.js';
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

const ordinal = (n) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
};

// The verdict is the move's exact standing, not a red/green vibe: "3rd best
// of 45". Green is reserved for the top move; everything else grades by rank.
function RankLine({ rank }) {
  if (!rank) return null;
  const color = rank.rank === 1 ? '#7ee787'
    : rank.rank <= Math.max(2, Math.ceil(rank.total * 0.1)) ? '#ffd166'
      : '#ff8f8f';
  return (
    <div style={{ textAlign: 'center', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ fontSize: 15, fontWeight: 800, color }}>
        {rank.rank === 1 ? 'Best move' : `${ordinal(rank.rank)} best move`}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
        {` of ${rank.total}`}
      </span>
    </div>
  );
}

// Per-move grade vs that ply's certified par eval.
// g = held >=85% of par, y = >=50%, r = below, x = never reached.
function gradeOf(landed, par) {
  if (landed === null || !Number.isFinite(par) || par <= 0) return 'r';
  const frac = landed / par;
  if (frac >= 0.85) return 'g';
  if (frac >= 0.5) return 'y';
  return 'r';
}
const GRADE_COLORS = { g: '#2ea043', y: '#d4a72c', r: '#da3633', x: '#30363d' };
const GRADE_EMOJI = { g: '🟩', y: '🟨', r: '🟥', x: '⬛' };

function MoveSquares({ grades, total }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }} aria-label="Move grades">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: 26, height: 26, borderRadius: 5,
            background: grades[i] ? GRADE_COLORS[grades[i]] : 'rgba(255,255,255,0.07)',
            border: `1px solid ${grades[i] ? 'transparent' : 'rgba(255,255,255,0.22)'}`,
            transition: 'background 300ms',
          }}
        />
      ))}
    </div>
  );
}

// Black's reply as a lastMove record (mirrors the game's own bookkeeping so
// en-passant windows survive into the player's next move).
function blackLastMove(afterPieces, moverId, from, to, wasFirstMove, measuredSquares) {
  const rec = {
    side: 'black', pieceId: moverId, from, to,
    isDoubleStep: false, crossedSquare: null,
    measuredSquares: measuredSquares || [],
  };
  if (wasFirstMove) {
    const fp = fromAlgebraic(from);
    const tp = fromAlgebraic(to);
    const moved = afterPieces.find((p) => p.id === moverId && !p.captured);
    if (fp && tp && moved && fp.fileIndex === tp.fileIndex && fp.rankIndex - tp.rankIndex === 2
      && (moved.possibleTypes || []).includes('p')) {
      rec.isDoubleStep = true;
      rec.crossedSquare = toAlgebraic(fp.fileIndex, fp.rankIndex - 1);
    }
  }
  return rec;
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
  const totalMoves = puzzle ? puzzle.recipe.moves : 3;
  const [cur, setCur] = useState(null); // { pieces, lastMove, cc } — the live position
  const [round, setRound] = useState(0); // which of the player's moves is next (0-based)
  const [phase, setPhase] = useState('playing'); // playing | landing | thinking | replying | done
  const [grades, setGrades] = useState([]);
  const [finalLanding, setFinalLanding] = useState(null);
  const [deepEvals, setDeepEvals] = useState(null); // moveKey -> depth-3 score, from the worker
  const [needleValue, setNeedleValue] = useState(null);
  const [moveRank, setMoveRank] = useState(null);
  const [replyArrow, setReplyArrow] = useState(null); // Black's live answer
  const [revealArrow, setRevealArrow] = useState(null); // par move 1, shown on a rough run
  const [copied, setCopied] = useState(false);
  const aliveRef = useRef(0); // bumps on reset; async work checks it
  // Black's in-flight reply search. computeBlackReply runs in a Promise, not
  // an effect, so the modal closing mid-think would otherwise leave the
  // worker searching until its own 9s timeout — this ref lets the
  // close/unmount effect kill it immediately.
  const replyWorkerRef = useRef(null);
  const killReplyWorker = () => {
    if (!replyWorkerRef.current) return;
    try { replyWorkerRef.current.terminate(); } catch (_) {}
    replyWorkerRef.current = null;
  };

  const {
    display, setDisplay, setMarks, selectedSq, setSelectedSq,
    targets, moves, boardPieces,
    handleSquareClick, canDragFrom, handleDragStart, handleDrop,
    later, clearTimers,
  } = usePuzzleBoard({
    ply: cur,
    playing: phase === 'playing',
    onMove: (from, to) => attemptMove(from, to),
  });

  useEffect(() => {
    if (!open || !puzzle) return undefined;
    aliveRef.current += 1;
    setCur({ pieces: puzzle.start.pieces, lastMove: puzzle.start.lastMove, cc: puzzle.start.captureCounter || 0 });
    setRound(0);
    setPhase('playing');
    setGrades([]);
    setFinalLanding(null);
    setDisplay(puzzle.start.pieces);
    setMarks([]);
    setSelectedSq(null);
    setNeedleValue(null);
    setMoveRank(null);
    setReplyArrow(null);
    setRevealArrow(null);
    setCopied(false);
    moveMadeRef.current = null;
    return () => { clearTimers(); killReplyWorker(); };
  }, [open, puzzle]);

  const keyOf = (m) => `${m.from}>${m.to}${m.enPassant ? 'ep' : ''}`;

  // Ruler alignment: the miner certifies par at search depth, so the gauge
  // must measure with a comparable ruler. A worker scores every root move at
  // depth 3; until it answers, the instant 1-ply reply-aware evals stand in.
  useEffect(() => {
    if (!open || !cur) return undefined;
    setDeepEvals(null);
    const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type !== 'analysis' || d.id !== round || !d.moves) return;
      const map = {};
      for (const m of d.moves) map[`${m.from}>${m.to}${m.enPassant ? 'ep' : ''}`] = m.score;
      setDeepEvals(map);
    };
    worker.postMessage({
      type: 'analyze',
      id: round,
      payload: { pieces: cur.pieces, sideToMove: 'white', lastMove: cur.lastMove || null, depth: 3, widths: [176, 12, 8], timeMs: 25000 },
    });
    return () => { worker.terminate(); };
  }, [open, cur, round]);

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

  // The move's exact standing among ALL legal moves, on the same ruler the
  // ticks use (deep worker scores when in, 1-ply reply-aware otherwise).
  const rankOfMove = (landed) => {
    if (landed === null) return null;
    let better = 0;
    for (let i = 0; i < moves.length; i++) {
      let s;
      if (deepEvals && deepEvals[keyOf(moves[i])] !== undefined) s = deepEvals[keyOf(moves[i])];
      else {
        if (evalRef.current[i] === undefined) evalRef.current[i] = replyAwareEval(moves[i]);
        s = evalRef.current[i];
      }
      if (s > landed + 1e-9) better++;
    }
    return { rank: better + 1, total: moves.length };
  };

  // The 1-ply evals only stand in until the depth-3 worker answers; if the
  // player has already moved, re-land the needle and re-rank and re-grade on
  // the deep ruler.
  const moveMadeRef = useRef(null); // { move, roundIdx }
  useEffect(() => {
    const made = moveMadeRef.current;
    if (!deepEvals || !made) return;
    const landed = deepEvals[keyOf(made.move)];
    if (landed === undefined) return;
    setNeedleValue(Number(landed.toFixed(2)));
    setMoveRank(rankOfMove(landed));
    setGrades((g) => {
      const next = [...g];
      if (next[made.roundIdx] && next[made.roundIdx] !== 'x') {
        next[made.roundIdx] = gradeOf(landed, puzzle.parEvals[made.roundIdx]);
      }
      return next;
    });
    if (made.roundIdx === totalMoves - 1) setFinalLanding(Number(landed.toFixed(2)));
  }, [deepEvals]); // eslint-disable-line react-hooks/exhaustive-deps

  const whiteLossPawns = useMemo(() => capturedPieces(display || [], 'white', true), [display]);
  const whiteLossOthers = useMemo(() => capturedPieces(display || [], 'white', false), [display]);
  const blackLossPawns = useMemo(() => capturedPieces(display || [], 'black', true), [display]);
  const blackLossOthers = useMemo(() => capturedPieces(display || [], 'black', false), [display]);

  // Black's live answer: the worker searches the reply position; a one-shot
  // greedy fallback (min static eval over legal replies — the same ruler the
  // ticks' lookahead uses) covers timeouts and castle-only answers, which
  // this preview doesn't apply.
  const computeBlackReply = (afterMove) => new Promise((resolve) => {
    const replies = generateLegalReplies(afterMove.after, 'black', afterMove.nextCC, afterMove.nextLastMove);
    if (!replies.length) { resolve(null); return; }
    const pool = replies.filter((r) => r.type !== 'castle');
    const greedy = () => (pool.length ? pool : replies).reduce((best, r) =>
      (evaluatePosition(r.resultPieces) < evaluatePosition(best.resultPieces) ? r : best));
    const finish = (reply) => resolve(reply || greedy());

    killReplyWorker(); // at most one reply search in flight
    const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
    replyWorkerRef.current = worker;
    const settle = (reply) => {
      clearTimeout(timer);
      try { worker.terminate(); } catch (_) {}
      if (replyWorkerRef.current === worker) replyWorkerRef.current = null;
      finish(reply);
    };
    const timer = setTimeout(() => settle(null), 9000);
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type !== 'analysis') return;
      const best = (d.moves || []).find((m) => !m.castle
        && replies.some((r) => r.from === m.from && r.to === m.to));
      settle(best ? replies.find((r) => r.from === best.from && r.to === best.to) : null);
    };
    worker.onerror = () => settle(null);
    worker.postMessage({
      type: 'analyze',
      id: 'black-reply',
      payload: { pieces: afterMove.after, sideToMove: 'black', lastMove: afterMove.nextLastMove, depth: 3, widths: [176, 12, 8], timeMs: 8000 },
    });
  });

  const finishPuzzle = (landed) => {
    setFinalLanding(landed !== null ? Number(landed.toFixed(2)) : null);
    later(() => {
      setRevealArrowIfRough();
      setPhase('done');
    }, 1400);
  };

  const setRevealArrowIfRough = () => {
    setGrades((g) => {
      if (g[0] !== 'g' && puzzle.parFirstMove) {
        setRevealArrow({ from: puzzle.parFirstMove.from, to: puzzle.parFirstMove.to });
        setDisplay(puzzle.start.pieces);
        setMarks([]);
      }
      return g;
    });
  };

  const attemptMove = (fromSq, toSq) => {
    setSelectedSq(null);
    // Free play: any legal move counts. If both a standard and an en-passant
    // move share from/to (a superposed mover), score the better one.
    const candidates = moves.filter((m) => m.from === fromSq && m.to === toSq);
    if (!candidates.length) return;
    const move = candidates.length === 1 ? candidates[0]
      : candidates.reduce((a, b) => ((evalOfMove(a) ?? -99) >= (evalOfMove(b) ?? -99) ? a : b));

    const token = aliveRef.current;
    const roundIdx = round;
    const landed = evalOfMove(move);
    moveMadeRef.current = { move, roundIdx };
    setDisplay(move.after);
    setMarks(move.measuredSquares || []);
    setNeedleValue(landed !== null ? Number(landed.toFixed(2)) : null);
    setMoveRank(rankOfMove(landed));
    setGrades((g) => {
      const next = [...g];
      next[roundIdx] = gradeOf(landed, puzzle.parEvals[roundIdx]);
      return next;
    });
    setPhase('landing');

    const replies = generateLegalReplies(move.after, 'black', move.nextCC, move.nextLastMove);
    if (roundIdx === totalMoves - 1 || replies.length === 0) {
      // Last move — or the game just ended under the player's move.
      if (replies.length === 0 && roundIdx < totalMoves - 1) {
        const terminal = evaluateTerminalAfterMove(move.after, 'white', move.nextCC, move.nextLastMove);
        const mate = terminal === 'checkmate';
        setGrades((g) => {
          const next = [...g];
          for (let i = roundIdx + 1; i < totalMoves; i++) next[i] = mate ? 'g' : 'x';
          return next;
        });
      }
      finishPuzzle(landed);
      return;
    }

    // Mid-line: land (1.4s), think, Black answers, re-arm.
    later(() => {
      if (aliveRef.current !== token) return;
      setPhase('thinking');
      computeBlackReply(move).then((reply) => {
        if (aliveRef.current !== token || !reply) {
          if (aliveRef.current === token) finishPuzzle(landed);
          return;
        }
        const mover = move.after.find((p) => !p.captured && p.side === 'black' && p.square === reply.from);
        const wasFirstMove = mover ? (mover.moveCount || 0) === 0 : false;
        // Re-simulate standard replies for measured marks; ep replies use
        // the reply's own result (marks skipped — vanishingly rare here).
        let afterPieces = reply.resultPieces;
        let measured = [];
        if (reply.type === 'move' && mover) {
          const sim = simulateStandardMove(move.after, mover.id, reply.to, move.nextCC);
          if (sim.ok) { afterPieces = sim.pieces; measured = sim.measuredSquares || []; }
        }
        const lastMove = blackLastMove(afterPieces, mover ? mover.id : null, reply.from, reply.to, wasFirstMove, measured);
        setDisplay(afterPieces);
        setMarks(measured);
        setReplyArrow({ from: reply.from, to: reply.to });
        setPhase('replying');
        later(() => {
          if (aliveRef.current !== token) return;
          const nextCur = { pieces: afterPieces, lastMove, cc: move.nextCC };
          setReplyArrow(null);
          setMarks([]);
          setNeedleValue(null);
          setMoveRank(null);
          moveMadeRef.current = null;
          setCur(nextCur);
          setRound(roundIdx + 1);
          setDisplay(afterPieces);
          setPhase('playing');
        }, 1600);
      });
    }, 1400);
  };

  if (!open || !puzzle) return null;

  const finalPar = puzzle.parEvals[puzzle.parEvals.length - 1];
  const fidelity = phase === 'done'
    ? Math.round(100 * Math.max(0, finalLanding ?? 0) / Math.max(0.01, finalPar))
    : null;
  const squaresText = Array.from({ length: totalMoves }, (_, i) => GRADE_EMOJI[grades[i] || 'x']).join('');
  const shareText = phase === 'done'
    ? [
      `⚛️ Quantum Chess · mined ${puzzle.date}`,
      `${squaresText} fidelity ${fidelity}%${fidelity > 100 ? ' ⚡ beyond the line' : ''}`,
      `held ${(finalLanding ?? 0) >= 0 ? '+' : ''}${(finalLanding ?? 0).toFixed(1)} of +${finalPar.toFixed(1)}`,
    ].join('\n')
    : '';

  const copyShare = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(shareText).then(() => {
      setCopied(true);
      later(() => setCopied(false), 1500);
    });
  };

  // Fit width AND height: bars + gauge + chrome need ~470px of the card.
  const cell = Math.max(30, Math.min(
    52,
    Math.floor((Math.min(window.innerWidth * 0.94, 560) - 66) / 8),
    Math.floor((window.innerHeight * 0.94 - 515) / 8)
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
      background: kind === 'good' ? 'rgba(126,231,135,0.12)' : kind === 'mid' ? 'rgba(255,209,102,0.12)' : 'rgba(255,107,107,0.12)',
      border: `1px solid ${kind === 'good' ? 'rgba(126,231,135,0.5)' : kind === 'mid' ? 'rgba(255,209,102,0.5)' : 'rgba(255,107,107,0.5)'}`,
      color: kind === 'good' ? '#7ee787' : kind === 'mid' ? '#ffd166' : '#ff8f8f',
    }),
    share: {
      margin: '10px auto 0', maxWidth: 340, background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '10px 12px',
      fontSize: 13, whiteSpace: 'pre', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
      position: 'relative', color: '#e8e6e1',
    },
  };

  const arrows = revealArrow ? [{ ...revealArrow, side: 'white' }]
    : replyArrow ? [{ ...replyArrow, side: 'black' }]
      : phase === 'playing' && round === 0 && puzzle.mistake
        ? [{ from: puzzle.mistake.from, to: puzzle.mistake.to, side: 'black' }]
        : [];

  const gaugeLabel = round === 0 && phase === 'playing'
    ? `Black slipped: ${puzzle.mistake.from} → ${puzzle.mistake.to}. Capitalize.`
    : phase === 'playing' ? 'Maintain the bar.' : null;

  const bannerKind = fidelity === null ? null : fidelity >= 85 ? 'good' : fidelity >= 50 ? 'mid' : 'bad';
  const bannerText = fidelity === null ? ''
    : fidelity > 100 ? '⚡ Beyond the line. You out-played the certification.'
      : fidelity >= 85 ? 'Clean capitalization.'
        : fidelity >= 50 ? 'You kept some of it. The rest slipped back.'
          : `It collapsed.${revealArrow ? ' The line began with the arrow.' : ''}`;

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
            <Pickaxe size={13} /> Mined puzzle · {totalMoves} moves · maintain the bar
            {phase === 'thinking' ? ' · the Stranger is thinking…'
              : phase !== 'done' ? ` · move ${Math.min(round + 1, totalMoves)} of ${totalMoves}` : ''}
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
            arrows={arrows}
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

        <EvalGauge ticks={ticks} value={needleValue} width={290} label={gaugeLabel} />
        <MoveSquares grades={grades} total={totalMoves} />
        <RankLine rank={moveRank} />

        {phase === 'done' ? (
          <>
            <div style={styles.banner(bannerKind)}>
              {`Fidelity ${fidelity}% — ${bannerText}`}
            </div>
            <div style={styles.share}>
              {shareText}
              <div style={{ marginTop: 8 }}>
                <IconButton icon={CopyIcon} label="Copy share text" onClick={copyShare} />
                {copied ? <span style={{ marginLeft: 8, fontSize: 12, color: '#7ee787' }}>copied ✓</span> : null}
              </div>
            </div>
          </>
        ) : null}
    </ModalShell>
  );
}
