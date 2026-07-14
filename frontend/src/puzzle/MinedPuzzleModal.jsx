// frontend/src/puzzle/MinedPuzzleModal.jsx
// Purpose: The mined-puzzle experience in PAR MODE (dev preview via
// ?mined=N; the shape of the future mined daily). Black just made the
// game's first mistake — the board shows that move — and the player gets
// puzzle.recipe.moves FREE moves to capitalize, the engine answering as
// Black live. Every move lands the needle on its eval and earns a graded
// square; the final result scores how much of the maximum possible advantage
// the player retained, with a Wordle-style share text.
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
  computePositionSignature,
  generateLegalReplies,
  evaluateTerminalAfterMove,
  simulateStandardMove,
} from '../chessboard/quantumEngine.js';
import { fromAlgebraic, toAlgebraic } from '../chessboard/boardUtils.js';
import { capturedPieces } from '../chessboard/boardUtils.js';
import { evaluatePosition } from '../ai/alphaBetaEngine.js';
import { devDebug } from '../devlog.js';
import { gradeOfStanding, puzzleFinalScore, puzzleLetterGrade } from './puzzleScoring.js';

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

// The verdict preserves the move's exact standing ("3rd best of 45") while
// its color matches the same relative/absolute gates as the move square.
function RankLine({ rank }) {
  if (!rank) return null;
  const grade = gradeOfStanding(rank);
  const color = grade === 's' ? '#aab2bd' : GRADE_COLORS[grade];
  return (
    <div style={{ textAlign: 'center', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ fontSize: 15, fontWeight: 800, color }}>
        {rank.rank === 1 ? '★ Best move' : `${ordinal(rank.rank)} best move`}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
        {` of ${rank.total}`}
      </span>
    </div>
  );
}

const GRADE_COLORS = { '*': '#f6c445', g: '#2ea043', y: '#d4a72c', o: '#db6d28', r: '#da3633', s: '#14171c', x: '#30363d' };
const GRADE_EMOJI = { '*': '⭐', g: '🟩', y: '🟨', o: '🟧', r: '🟥', s: '💀', x: '⬛' };
const GRADE_GLYPH = { '*': '★', s: '💀' };

function MoveSquares({ grades, total }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }} aria-label="Move grades">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: 26, height: 26, borderRadius: 5,
            background: grades[i] ? GRADE_COLORS[grades[i]] : 'rgba(255,255,255,0.07)',
            border: `1px solid ${grades[i] ? (grades[i] === 's' ? 'rgba(255,255,255,0.28)' : 'transparent') : 'rgba(255,255,255,0.22)'}`,
            transition: 'background 300ms',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: grades[i] === '*' ? 18 : 13, lineHeight: 1,
            color: '#1b1205',
          }}
        >
          {GRADE_GLYPH[grades[i]] || ''}
        </div>
      ))}
    </div>
  );
}

function QuantumThinkingIndicator() {
  return (
    <div className="qc-quantum-thinking-bounds" role="status" aria-label="The Stranger is thinking">
      <div className="qc-quantum-thinking-bounce-x">
        <div className="qc-quantum-thinking-bounce-y">
          <div className="qc-quantum-thinking">
            <div className="qc-quantum-thinking__sprite" aria-hidden="true" />
          </div>
        </div>
      </div>
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
  onComplete = () => {},
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
  const [phase, setPhase] = useState('playing'); // intro-before | intro-move | playing | landing | thinking | replying | final-effects | done
  const [grades, setGrades] = useState([]);
  const [finalLanding, setFinalLanding] = useState(null);
  const [deepEvals, setDeepEvals] = useState(null); // moveKey -> depth-3 score, from the worker
  const [needleValue, setNeedleValue] = useState(null);
  const [moveRank, setMoveRank] = useState(null);
  const [replyArrow, setReplyArrow] = useState(null); // Black's live answer
  // Effect replay: bumps per beat so repeat squares re-animate; origin is
  // the mover's landing square (particle motes fly from it).
  const [fx, setFx] = useState({ key: 0, origin: null });
  const bumpFx = (origin) => setFx((f) => ({ key: f.key + 1, origin }));
  const [suggestedMove, setSuggestedMove] = useState(null); // best-move confirmation/correction for the position just played
  const [revealArrow, setRevealArrow] = useState(null); // par move 1, shown on a rough run
  const [showThinkingBrain, setShowThinkingBrain] = useState(false);
  const [totalCollapse, setTotalCollapse] = useState(false);
  const [copied, setCopied] = useState(false);
  const aliveRef = useRef(0); // bumps on reset; async work checks it
  const collapseRef = useRef(false);
  const completionReportedRef = useRef(false);
  const roundRef = useRef(0);
  roundRef.current = round;
  // Black's in-flight reply search. computeBlackReply runs in a Promise, not
  // an effect, so the modal closing mid-think would otherwise leave the
  // worker searching until its own timeout — this ref lets the
  // close/unmount effect kill it immediately.
  const replyWorkerRef = useRef(null);
  const replyPrefetchRef = useRef(null); // { worker, round, replyKey, map }
  const killReplyWorker = () => {
    if (!replyWorkerRef.current) return;
    try { replyWorkerRef.current.terminate(); } catch (_) {}
    replyWorkerRef.current = null;
  };
  const killReplyPrefetch = () => {
    const active = replyPrefetchRef.current;
    if (!active) return;
    try { active.worker.terminate(); } catch (_) {}
    replyPrefetchRef.current = null;
  };

  const {
    display, setDisplay, setMarks, setEffects, selectedSq, setSelectedSq,
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
    const hasIntro = Boolean(puzzle.intro && Array.isArray(puzzle.intro.pieces));
    setCur({ pieces: puzzle.start.pieces, lastMove: puzzle.start.lastMove, cc: puzzle.start.captureCounter || 0 });
    setRound(0);
    setPhase(hasIntro ? 'intro-before' : 'playing');
    setGrades([]);
    setFinalLanding(null);
    setDisplay(hasIntro ? puzzle.intro.pieces : puzzle.start.pieces);
    setMarks([]);
    setEffects({ zaps: [], heals: [], shields: [] });
    setSelectedSq(null);
    setNeedleValue(null);
    setMoveRank(null);
    setReplyArrow(null);
    setSuggestedMove(null);
    setRevealArrow(null);
    setShowThinkingBrain(false);
    setTotalCollapse(false);
    setCopied(false);
    collapseRef.current = false;
    completionReportedRef.current = false;
    moveMadeRef.current = null;
    killReplyPrefetch();
    return () => { clearTimers(); killReplyWorker(); killReplyPrefetch(); };
  }, [open, puzzle]);

  // Start the context clock only after React has committed the pre-mistake
  // board and the browser has had two animation frames to paint it. Loading
  // and mounting time therefore never eats into the visible 1.5-second hold.
  useEffect(() => {
    if (!open || !puzzle || phase !== 'intro-before') return undefined;
    const token = aliveRef.current;
    let timer = 0;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        timer = setTimeout(() => {
          if (aliveRef.current !== token) return;
          const last = puzzle.start.lastMove || {};
          setDisplay(puzzle.start.pieces);
          setEffects({
            zaps: last.zappedSquares || [],
            heals: last.healedSquares || [],
            shields: last.fizzledSquares || [],
          });
          bumpFx(puzzle.mistake?.to || last.to || null);
          setPhase('intro-move');
        }, 1500);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      clearTimeout(timer);
    };
  }, [open, puzzle, phase]);

  // The move/effects beat also starts from its own committed render. White
  // stays locked until the longest contact animation has had time to read.
  useEffect(() => {
    if (!open || !puzzle || phase !== 'intro-move') return undefined;
    const token = aliveRef.current;
    const timer = setTimeout(() => {
      if (aliveRef.current !== token) return;
      clearEffects();
      setPhase('playing');
    }, 1400);
    return () => clearTimeout(timer);
  }, [open, puzzle, phase]);

  // The hint gets a quiet reading beat before the old bouncing-brain search
  // animation arrives. If Black answers sooner, the brain never flashes.
  useEffect(() => {
    setShowThinkingBrain(false);
    if (phase !== 'thinking' || !suggestedMove) return undefined;
    const timer = setTimeout(() => setShowThinkingBrain(true), 3500);
    return () => clearTimeout(timer);
  }, [phase, suggestedMove]);

  useEffect(() => {
    if (phase !== 'done' || !puzzle?.isDaily || completionReportedRef.current) return;
    completionReportedRef.current = true;
    onComplete({ date: puzzle.date, totalCollapse });
  }, [phase, puzzle, totalCollapse, onComplete]);

  const keyOf = (m) => `${m.from}>${m.to}${m.enPassant ? 'ep' : ''}`;

  // Mined chains ship precomputed gauge tables (tools/miner/swing.mjs
  // buildEvalTable — SAME depth/widths ruler as the worker request below),
  // keyed by position signature. A hit loads the certified evals instantly;
  // a miss (player diverged from the recorded line) falls through to the
  // worker.
  const savedTableFor = (pos) => {
    const tables = puzzle && puzzle.evalTables;
    if (!tables || !tables.length || !pos) return null;
    const sig = computePositionSignature(pos.pieces, 'white', pos.lastMove || null);
    const hit = tables.find((t) => t && t.sig === sig);
    return hit ? hit.evals : null;
  };

  // Ruler alignment: the miner certifies par at search depth, so the gauge
  // must measure with a comparable ruler. A worker scores every root move at
  // depth 3; until it answers, the instant 1-ply reply-aware evals stand in.
  useEffect(() => {
    if (!open || !cur) return undefined;
    const saved = savedTableFor(cur);
    if (saved) {
      setDeepEvals(saved);
      return undefined;
    }
    const prefetched = replyPrefetchRef.current;
    if (prefetched && prefetched.round === round) {
      setDeepEvals(prefetched.map || null);
      return undefined;
    }
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
      // Same ruler as the shipped tables: exhaustive replies, even parity.
      // On wide positions the 25s budget times out and the exhaustive-d2
      // stand-in (also even parity) stands — both outcomes stay sober.
      payload: { pieces: cur.pieces, sideToMove: 'white', lastMove: cur.lastMove || null, depth: 4, widths: [176, 176, 12, 8], timeMs: 25000 },
    });
    return () => { worker.terminate(); };
  }, [open, cur, round]);

  // Each completed depth of Black's iterative search exposes its current
  // best reply. Speculatively score White's resulting root moves in a second
  // worker; if that reply survives as Black's final choice, the next gauge
  // adopts this work instead of starting cold.
  const prefetchNextGauge = (afterMove, reply, nextRound, token) => {
    if (!reply || reply.type === 'castle') return;
    const replyKey = `${reply.from}>${reply.to}`;
    const active = replyPrefetchRef.current;
    if (active && active.round === nextRound && active.replyKey === replyKey) return;
    killReplyPrefetch();

    const mover = afterMove.after.find((p) =>
      !p.captured && p.side === 'black' && p.square === reply.from);
    const wasFirstMove = mover ? (mover.moveCount || 0) === 0 : false;
    const lastMove = blackLastMove(
      reply.resultPieces,
      mover ? mover.id : null,
      reply.from,
      reply.to,
      wasFirstMove,
      []
    );
    // A saved table already covers this reply position (the recorded line):
    // the round effect will load it instantly — no speculative worker needed.
    if (savedTableFor({ pieces: reply.resultPieces, lastMove })) return;
    const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
    const record = { worker, round: nextRound, replyKey, map: null };
    replyPrefetchRef.current = record;
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type !== 'analysis' || d.id !== `prefetch-${nextRound}` || !d.moves) return;
      if (aliveRef.current !== token || replyPrefetchRef.current !== record) return;
      const map = {};
      for (const m of d.moves) map[`${m.from}>${m.to}${m.enPassant ? 'ep' : ''}`] = m.score;
      record.map = map;
      if (roundRef.current === nextRound) setDeepEvals(map);
      try { worker.terminate(); } catch (_) {}
    };
    worker.onerror = () => {
      if (replyPrefetchRef.current === record) replyPrefetchRef.current = null;
      try { worker.terminate(); } catch (_) {}
    };
    worker.postMessage({
      type: 'analyze',
      id: `prefetch-${nextRound}`,
      payload: {
        pieces: reply.resultPieces,
        sideToMove: 'white',
        lastMove,
        // Same ruler as the shipped tables: exhaustive replies, even parity.
        // On wide positions the 25s budget times out and the exhaustive-d2
        // stand-in (also even parity) stands — both outcomes stay sober.
        depth: 4,
        widths: [176, 176, 12, 8],
        timeMs: 25000,
      },
    });
  };

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
    let best = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      let s;
      if (deepEvals && deepEvals[keyOf(moves[i])] !== undefined) s = deepEvals[keyOf(moves[i])];
      else {
        if (evalRef.current[i] === undefined) evalRef.current[i] = replyAwareEval(moves[i]);
        s = evalRef.current[i];
      }
      best = Math.max(best, s);
      if (s > landed + 1e-9) better++;
    }
    return {
      rank: better + 1,
      total: moves.length,
      best,
      loss: Math.max(0, best - landed),
      landed,
    };
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
    const standing = rankOfMove(landed);
    const revisedGrade = gradeOfStanding(standing);
    const deepScored = moves.filter((m) => deepEvals[keyOf(m)] !== undefined);
    const deepBest = deepScored.length ? deepScored.reduce((best, m) =>
      (deepEvals[keyOf(m)] > deepEvals[keyOf(best)] ? m : best)) : null;
    const confirmedMove = standing?.rank === 1 ? made.move : deepBest;
    setNeedleValue(Number(landed.toFixed(2)));
    setMoveRank(standing);
    setSuggestedMove((previous) => {
      if (!confirmedMove) return null;
      const next = {
        from: confirmedMove.from,
        to: confirmedMove.to,
        enPassant: Boolean(confirmedMove.enPassant),
      };
      return previous?.from === next.from && previous?.to === next.to
        && Boolean(previous.enPassant) === next.enPassant ? previous : next;
    });
    setGrades((g) => {
      const next = [...g];
      if (next[made.roundIdx] && next[made.roundIdx] !== 'x') {
        next[made.roundIdx] = revisedGrade;
      }
      return next;
    });
    if (made.roundIdx === totalMoves - 1) setFinalLanding(Number(landed.toFixed(2)));
    if (revisedGrade === 's' && phase !== 'done') {
      finishOnSkull(landed, {
        pieces: made.move.after,
        effects: effectsOfMove(made.move),
      });
    }
  }, [deepEvals]); // eslint-disable-line react-hooks/exhaustive-deps

  const whiteLossPawns = useMemo(() => capturedPieces(display || [], 'white', true), [display]);
  const whiteLossOthers = useMemo(() => capturedPieces(display || [], 'white', false), [display]);
  const blackLossPawns = useMemo(() => capturedPieces(display || [], 'black', true), [display]);
  const blackLossOthers = useMemo(() => capturedPieces(display || [], 'black', false), [display]);

  // Black's live answer: the worker searches the reply position; a one-shot
  // greedy fallback (min static eval over legal replies — the same ruler the
  // ticks' lookahead uses) covers timeouts and castle-only answers, which
  // this preview doesn't apply.
  const computeBlackReply = (afterMove, nextRound, token) => new Promise((resolve) => {
    const replies = generateLegalReplies(afterMove.after, 'black', afterMove.nextCC, afterMove.nextLastMove);
    if (!replies.length) { resolve(null); return; }
    const pool = replies.filter((r) => r.type !== 'castle');
    const greedy = () => (pool.length ? pool : replies).reduce((best, r) =>
      (evaluatePosition(r.resultPieces) < evaluatePosition(best.resultPieces) ? r : best));
    const finish = (reply) => {
      const chosen = reply || greedy();
      prefetchNextGauge(afterMove, chosen, nextRound, token);
      resolve(chosen);
    };

    killReplyWorker(); // at most one reply search in flight
    const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
    replyWorkerRef.current = worker;
    const searchStartedAt = performance.now();
    let lastCompletedDepth = 0;
    const settle = (reply) => {
      clearTimeout(timer);
      try { worker.terminate(); } catch (_) {}
      if (replyWorkerRef.current === worker) replyWorkerRef.current = null;
      finish(reply);
    };
    const timer = setTimeout(() => {
      devDebug('[Mined puzzle · Black search]', {
        status: 'safety-timeout',
        requestedDepth: 5,
        completedDepth: lastCompletedDepth,
        elapsedMs: Math.round(performance.now() - searchStartedAt),
        fallback: 'greedy',
      });
      settle(null);
    }, 16000);
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'error') {
        devDebug('[Mined puzzle · Black search]', {
          status: 'worker-error',
          requestedDepth: 5,
          completedDepth: lastCompletedDepth,
          elapsedMs: Math.round(performance.now() - searchStartedAt),
          message: d.message,
          fallback: 'greedy',
        });
        settle(null);
        return;
      }
      if (d.type === 'bestMoveProgress') {
        lastCompletedDepth = Math.max(lastCompletedDepth, d.depth || 0);
        const candidate = d.move && d.move.type !== 'castle'
          ? replies.find((r) => r.from === d.move.from && r.to === d.move.to)
          : null;
        if (candidate) prefetchNextGauge(afterMove, candidate, nextRound, token);
        return;
      }
      if (d.type !== 'bestMove') return;
      const best = d.move && d.move.type !== 'castle'
        ? replies.find((r) => r.from === d.move.from && r.to === d.move.to)
        : null;
      const completedDepth = d.depth || lastCompletedDepth;
      devDebug('[Mined puzzle · Black search]', {
        status: completedDepth >= 5 ? 'depth-complete' : 'search-budget-timeout',
        requestedDepth: 5,
        completedDepth,
        elapsedMs: Math.round(performance.now() - searchStartedAt),
        nodes: d.nodes || 0,
        move: d.move ? `${d.move.from || '?'}→${d.move.to || '?'}` : null,
        fallback: best ? null : 'greedy',
      });
      if (best) prefetchNextGauge(afterMove, best, nextRound, token);
      settle(best || null);
    };
    worker.onerror = (error) => {
      devDebug('[Mined puzzle · Black search]', {
        status: 'worker-error',
        requestedDepth: 5,
        completedDepth: lastCompletedDepth,
        elapsedMs: Math.round(performance.now() - searchStartedAt),
        message: error && error.message,
        fallback: 'greedy',
      });
      settle(null);
    };
    worker.postMessage({
      type: 'bestMove',
      id: 'black-reply',
      payload: {
        pieces: afterMove.after,
        sideToMove: 'black',
        lastMove: afterMove.nextLastMove,
        depth: 5,
        widths: [176, 12, 8, 6, 4],
        timeMs: 15000,
      },
    });
  });

  const effectsOfMove = (mv) => ({
    zaps: mv.zappedSquares || [],
    heals: mv.healedSquares || [],
    shields: mv.fizzledSquares || [],
  });
  const clearEffects = () => setEffects({ zaps: [], heals: [], shields: [] });

  const finishPuzzle = (landed, landing = null, collapsed = false) => {
    if (collapsed) setTotalCollapse(true);
    setFinalLanding(landed !== null ? Number(landed.toFixed(2)) : null);
    if (landing) {
      setDisplay(landing.pieces);
      setEffects(landing.effects || { zaps: [], heals: [], shields: [] });
    }
    setPhase('final-effects');
  };

  const finishOnSkull = (landed, landing) => {
    if (collapseRef.current) return;
    collapseRef.current = true;
    aliveRef.current += 1; // invalidate any queued reply/search continuation
    killReplyWorker();
    killReplyPrefetch();
    finishPuzzle(landed, landing, true);
  };

  const setRevealArrowIfRough = () => {
    setGrades((g) => {
      if (g[0] !== '*' && g[0] !== 'g' && puzzle.parFirstMove) {
        setRevealArrow({ from: puzzle.parFirstMove.from, to: puzzle.parFirstMove.to });
        setDisplay(puzzle.start.pieces);
        setMarks([]);
        clearEffects();
      }
      return g;
    });
  };

  // The result card waits for a committed final board plus two browser paint
  // frames. Its delay therefore belongs entirely to the particle-effects
  // beat instead of being consumed by React's final render.
  useEffect(() => {
    if (phase !== 'final-effects') return undefined;
    const token = aliveRef.current;
    let timer = 0;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        timer = setTimeout(() => {
          if (aliveRef.current !== token) return;
          setRevealArrowIfRough();
          setPhase('done');
        }, 1400);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      clearTimeout(timer);
    };
  }, [phase]);

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
    const certifiedMove = puzzle.parMoves?.[roundIdx]
      || (roundIdx === 0 ? puzzle.parFirstMove : null);
    const legalCertifiedMove = certifiedMove && moves.find((m) =>
      m.from === certifiedMove.from && m.to === certifiedMove.to
      && Boolean(m.enPassant) === Boolean(certifiedMove.enPassant));
    // A completed current-position depth-3 analysis outranks the static
    // certified line. After a divergence, the certified round move may no
    // longer exist; never draw an arrow unless its move is legal right now.
    const deepScored = deepEvals ? moves.filter((m) => deepEvals[keyOf(m)] !== undefined) : [];
    const deepBest = deepScored.length ? deepScored.reduce((best, m) =>
      (deepEvals[keyOf(m)] > deepEvals[keyOf(best)] ? m : best)) : null;
    const progressivelyScored = moves.filter((_, i) => evalRef.current[i] !== undefined);
    const progressiveBest = progressivelyScored.length ? progressivelyScored.reduce((best, m) => {
      const mi = moves.indexOf(m);
      const bi = moves.indexOf(best);
      return evalRef.current[mi] > evalRef.current[bi] ? m : best;
    }) : null;
    const positionBest = deepBest || legalCertifiedMove || progressiveBest || null;
    const landed = evalOfMove(move);
    const standing = rankOfMove(landed);
    const moveGrade = gradeOfStanding(standing);
    setReplyArrow(null); // the player moved — Black's trail comes off
    // A best move gets the same positive-confirmation arrow as a correction.
    // It appears AFTER the move's contact effects have had their beat.
    const arrowMove = standing?.rank === 1 ? move : positionBest;
    setSuggestedMove(arrowMove ? {
      from: arrowMove.from,
      to: arrowMove.to,
      enPassant: Boolean(arrowMove.enPassant),
    } : null);
    moveMadeRef.current = { move, roundIdx };
    // The move plays IMMEDIATELY — board shows the resolved result with its
    // zap/heal/shield effects, exactly like live play. No rewinding.
    setDisplay(move.after);
    setEffects(effectsOfMove(move));
    bumpFx(move.to);
    setNeedleValue(landed !== null ? Number(landed.toFixed(2)) : null);
    setMoveRank(standing);
    setGrades((g) => {
      const next = [...g];
      next[roundIdx] = moveGrade;
      return next;
    });
    setPhase('landing');

    if (moveGrade === 's') {
      finishOnSkull(landed, { pieces: move.after, effects: effectsOfMove(move) });
      return;
    }

    const replies = generateLegalReplies(move.after, 'black', move.nextCC, move.nextLastMove);
    if (roundIdx === totalMoves - 1 || replies.length === 0) {
      // Last move — or the game just ended under the player's move.
      if (replies.length === 0 && roundIdx < totalMoves - 1) {
        const terminal = evaluateTerminalAfterMove(move.after, 'white', move.nextCC, move.nextLastMove);
        const mate = terminal === 'checkmate';
        setGrades((g) => {
          const next = [...g];
          for (let i = roundIdx + 1; i < totalMoves; i++) next[i] = mate ? '*' : 'x';
          return next;
        });
      }
      finishPuzzle(landed, { pieces: move.after, effects: effectsOfMove(move) });
      return;
    }

    // Mid-line: the effects beat (1.4s), then the hint arrow while Black
    // thinks, then Black answers and the board re-arms.
    later(() => {
      if (aliveRef.current !== token) return;
      setPhase('thinking');
      computeBlackReply(move, roundIdx + 1, token).then((reply) => {
        if (aliveRef.current !== token || !reply) {
          if (aliveRef.current === token) finishPuzzle(landed);
          return;
        }
        const mover = move.after.find((p) => !p.captured && p.side === 'black' && p.square === reply.from);
        const wasFirstMove = mover ? (mover.moveCount || 0) === 0 : false;
        // Re-simulate standard replies to recover Black's contact effects;
        // ep replies use the reply's own result (effects skipped —
        // vanishingly rare here).
        let afterPieces = reply.resultPieces;
        let replyEffects = { zaps: [], heals: [], shields: [] };
        if (reply.type === 'move' && mover) {
          const sim = simulateStandardMove(move.after, mover.id, reply.to, move.nextCC);
          if (sim.ok) {
            afterPieces = sim.pieces;
            replyEffects = { zaps: sim.zappedSquares || [], heals: sim.healedSquares || [], shields: sim.fizzledSquares || [] };
          }
        }
        const lastMove = blackLastMove(afterPieces, mover ? mover.id : null, reply.from, reply.to, wasFirstMove, []);
        // Hold the position Black is moving FROM for a beat, then commit the
        // reply with its own zap/heal effects so captures read as an actual
        // before/after board change.
        setPhase('replying');
        setReplyArrow(null);
        clearEffects();
        later(() => {
          if (aliveRef.current !== token) return;
          setDisplay(afterPieces);
          setEffects(replyEffects);
          bumpFx(reply.to);
          setReplyArrow({ from: reply.from, to: reply.to });
          later(() => {
            if (aliveRef.current !== token) return;
            const nextCur = { pieces: afterPieces, lastMove, cc: move.nextCC };
            clearEffects();
            setNeedleValue(null);
            setMoveRank(null);
            moveMadeRef.current = null;
            setCur(nextCur);
            setRound(roundIdx + 1);
            setDisplay(afterPieces);
            setPhase('playing');
          }, 1800);
        }, 300);
      });
    }, 1400);
  };

  if (!open || !puzzle) return null;

  const startingTableEvals = Object.values(puzzle.evalTables?.[0]?.evals || {})
    .filter(Number.isFinite);
  const startingMaxEval = startingTableEvals.length
    ? Math.max(...startingTableEvals)
    : puzzle.parEvals[0];
  const finalScore = phase === 'done'
    ? puzzleFinalScore(finalLanding, startingMaxEval)
    : null;
  const letterGrade = finalScore === null ? null : puzzleLetterGrade(finalScore);
  const squaresText = Array.from({ length: totalMoves }, (_, i) => GRADE_EMOJI[grades[i] || 'x']).join('');
  const shareText = phase === 'done'
    ? [
      `⚛️ Quantum Chess · mined ${puzzle.date}`,
      `${squaresText} ${finalScore}/100 · Grade ${letterGrade}`,
      ...(totalCollapse ? ['Complete and total collapse 💀'] : []),
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
    Math.floor((window.innerHeight * 0.94 - 455) / 8)
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
    boardWrap: { display: 'flex', justifyContent: 'center', margin: '4px 0', position: 'relative' },
    // The result floats OVER the board (the done-state card was too tall
    // with banner + share stacked underneath).
    doneOverlay: {
      position: 'absolute', inset: 0, zIndex: 55,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 8, pointerEvents: 'none',
    },
    doneCard: {
      pointerEvents: 'auto', width: 'min(88%, 360px)',
      background: 'rgba(13, 16, 23, 0.93)', border: '1px solid rgba(255,255,255,0.22)',
      borderRadius: 12, padding: '10px 12px', boxShadow: '0 12px 34px rgba(0,0,0,0.55)',
      backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
    },
    barWrap: { margin: '4px 0', position: 'relative' },
    share: (kind) => ({
      margin: '10px auto 0', maxWidth: 340, background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${kind === 'good' ? 'rgba(126,231,135,0.7)' : kind === 'mid' ? 'rgba(255,209,102,0.7)' : 'rgba(255,107,107,0.7)'}`,
      borderRadius: 10, padding: '10px 12px',
      fontSize: 13, whiteSpace: 'pre', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
      position: 'relative', color: '#e8e6e1',
    }),
  };

  // Computer moves read like live play: a from/to trail of highlighted
  // squares (cyan origin, gold landing), not an arrow. The arrow is reserved
  // for the par-line HINT revealed after a rough run.
  // Sequence: the landing beat belongs to the move's zap/heal effects; the
  // best-move confirmation/correction only appears AFTER it (through Black's
  // think and the short pre-move beat), clearing when replyArrow lands.
  const landingBestMove = (phase === 'thinking'
    || (phase === 'replying' && !replyArrow))
    ? suggestedMove
    : null;
  const arrows = revealArrow ? [{ ...revealArrow, side: 'white' }]
    : landingBestMove ? [{ ...landingBestMove, kind: 'hint', opacity: 0.8 }]
      : [];
  const trail = replyArrow
    || ((phase === 'intro-move' || phase === 'playing')
      && round === 0 && puzzle.mistake ? puzzle.mistake : null);
  const boardHighlights = [
    ...(selectedSq ? [selectedSq] : []),
    ...(trail && !revealArrow ? [
      { sq: trail.from, color: 'rgba(79, 195, 247, 0.42)' },
      { sq: trail.to, color: 'rgba(246, 196, 69, 0.5)' },
    ] : []),
  ];

  const bannerKind = totalCollapse ? 'bad'
    : letterGrade === null ? null
      : letterGrade === 'A' || letterGrade === 'B' ? 'good'
        : letterGrade === 'C' ? 'mid' : 'bad';

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      zIndex={1001}
      ariaLabel={puzzle.isDaily ? 'Daily puzzle' : 'Mined puzzle'}
      backdropClassName="qc-mined-backdrop"
      panelClassName="qc-mined-card"
      panelStyle={styles.card}
    >
        <div style={styles.headRow}>
          <div style={styles.kicker}>
            <Pickaxe size={13} /> {puzzle.isDaily ? 'Daily puzzle' : 'Mined puzzle'} · {totalMoves} moves
            {phase === 'intro-before' ? ' · one move earlier…'
                : phase === 'intro-move' ? ' · Black makes the mistake…'
                  : phase === 'thinking' ? ' · the Stranger is thinking…'
                    : phase === 'final-effects' ? ' · resolving…'
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
          {showThinkingBrain ? (
            <div style={{
              position: 'absolute', top: 0, left: 'calc(50% + 8px)',
              width: cell * 8, height: cell * 8, transform: 'translateX(-50%)',
              zIndex: 60, pointerEvents: 'none', overflow: 'hidden', borderRadius: 8,
            }}>
              <QuantumThinkingIndicator />
            </div>
          ) : null}
          {phase === 'done' ? (
            <div style={styles.doneOverlay}>
              <div style={styles.doneCard}>
                <div style={{ ...styles.share(bannerKind), margin: 0 }}>
                  {shareText}
                  <div style={{ marginTop: 8 }}>
                    <IconButton icon={CopyIcon} label="Copy share text" onClick={copyShare} />
                    {copied ? <span style={{ marginLeft: 8, fontSize: 12, color: '#7ee787' }}>copied ✓</span> : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <MiniBoard
            files={8}
            ranks={8}
            cell={cell}
            squareColors={boardColors}
            pieces={boardPieces}
            arrows={arrows}
            highlights={boardHighlights}
            targets={targets}
            onSquareClick={handleSquareClick}
            canDrag={phase === 'playing' ? canDragFrom : null}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            svgStyleBySide={svgStyleBySide}
            effectKey={fx.key}
            pulseOrigin={fx.origin}
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
        <MoveSquares grades={grades} total={totalMoves} />
        <RankLine rank={moveRank} />


    </ModalShell>
  );
}
