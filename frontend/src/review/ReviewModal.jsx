// frontend/src/review/ReviewModal.jsx
// Purpose: Premium game review — replay a saved game move by move with an
// engine eval bar, move-quality marks, and a best-move suggestion computed
// in a web worker for the position being viewed. The whole-game eval graph
// lives in ./useGameEvalGraph.js + ./EvalTraceGraph.jsx; variations in
// ./useReviewVariation.js; styles in ./reviewStyles.js.
// Imports From: ../theme.js, ../components/*, ../chessboard/*, ../ai/bots.js, ./replayCore.js
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import './review.css';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import ModalShell from '../components/ModalShell.jsx';
import ModalCloseButton from '../components/ModalCloseButton.jsx';
import {
  ChevronDown, ChevronLeft, ChevronRight, SkipBack, SkipForward, History, Microscope,
  Sparkles, Undo2, Gauge, Link2, Play, Pause, Share2, Video,
} from 'lucide-react';
import Board from '../chessboard/Board.jsx';
import { lastMoveHighlights } from '../chessboard/lastMoveHighlights.js';
import PlayerBar from '../components/PlayerBar.jsx';
import { capturedPieces } from '../chessboard/boardUtils.js';
import { getBotById, botAvatarDescriptor } from '../ai/bots.js';
import { buildReviewTimeline } from './replayCore.js';
import useGameEvalGraph from './useGameEvalGraph.js';
import { cacheEval, cacheHints, getCachedHints } from './evalCache.js';
import useReviewVariation from './useReviewVariation.js';
import EvalTraceGraph from './EvalTraceGraph.jsx';
import styles from './reviewStyles.js';
import { staysInSameDecisiveBand } from './reviewMoveMarks.js';
import QuantumOrbit from '../welcome/QuantumOrbit.jsx';
import {
  REPLAY_PLY_INTERVAL_MS,
  canMakeReplayVideo,
  downloadReplayVideo,
  paintReplayVideoFrame,
  startReplayVideoRecorder,
} from './socialReplayVideo.js';
import {
  DEFAULT_REPLAY_MOVES_PER_SECOND,
  REPLAY_SPEED_OPTIONS,
  replayIntervalMs,
} from './replaySpeed.js';

// Mover-perspective eval drop (in pawns) that earns a mark in the move list.
const MISTAKE_DROP = 1.5;
const BLUNDER_DROP = 3;

function formatEval(v) {
  // Mate scores are ply-adjusted (1000 = mate on the board). Show the
  // distance while it's coming — M1, M2 — and '#' once it's delivered, so a
  // game ends "... M1, #" instead of "#, +23.1".
  if (Math.abs(v) >= 999.5) return v > 0 ? '#' : '-#';
  if (Math.abs(v) >= 900) {
    const movesLeft = Math.max(1, Math.ceil((1000 - Math.abs(v)) / 2));
    return `${v > 0 ? '' : '-'}M${movesLeft}`;
  }
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

function describeHintMove(mv) {
  if (!mv) return '';
  if (mv.castle) return `castle ${mv.from}+…`;
  return `${mv.from} → ${mv.to}${mv.enPassant ? ' (en passant)' : ''}`;
}

function normalizeWorkerMove(move, score, depth) {
  if (!move) return null;
  if (move.type === 'castle' && move.plan) {
    return {
      from: move.plan.piece1_from,
      to: move.plan.piece1_to,
      castle: true,
      enPassant: false,
      score,
      depth,
    };
  }
  if (!move.from || !move.to) return null;
  return {
    from: move.from,
    to: move.to,
    castle: false,
    enPassant: move.type === 'enpassant' || Boolean(move.enPassant),
    score,
    depth,
  };
}

export default function ReviewModal({
  open = false,
  page = false,
  onClose = () => {},
  onShareGame = null,
  game = null, // { id, opponent, opponent_rating, user_side, result, created_at, headline? }
  moves = null, // stored qc_games.moves array
  analysisEnabled = true, // false = free replay + variations, with no engine output/work
  initialReplayAction = null,
  loading = false,
  loadError = null,
  showEvalGraph = false, // dev/mined only: show the graph strip; move-list evals always compute
  pieceSvgStyles,
  indicators,
  squareColors,
}) {
  const timeline = useMemo(
    () => (open && Array.isArray(moves) ? buildReviewTimeline(moves) : null),
    [open, moves],
  );
  const snapshots = timeline ? timeline.snapshots : [];

  const graph = useGameEvalGraph({
    open: open && analysisEnabled,
    showEvalGraph: analysisEnabled && showEvalGraph,
    timeline,
    snapshots,
  });
  const { evalAt, nearestEval, resolvePoint } = graph;

  const v = useReviewVariation({ open, snapshots, onClose });
  const { bounded, snap, variation, varSel } = v;
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayMovesPerSecond, setReplayMovesPerSecond] = useState(DEFAULT_REPLAY_MOVES_PER_SECOND);
  const [replayMenuOpen, setReplayMenuOpen] = useState(false);
  const [shareState, setShareState] = useState({ status: 'idle', message: '' });
  const [videoState, setVideoState] = useState({ status: 'idle', progress: 0, message: '' });
  const videoCancelledRef = useRef(false);
  const replayMenuRef = useRef(null);
  const initialReplayActionHandledRef = useRef(null);
  const makingVideo = videoState.status === 'recording';

  useEffect(() => {
    if (!open || !page) return undefined;
    const previousTitle = document.title;
    document.title = analysisEnabled ? 'Game Review | Quantum Chess' : 'Game Replay | Quantum Chess';
    return () => { document.title = previousTitle; };
  }, [open, page, analysisEnabled]);

  useEffect(() => {
    if (!open || !replayPlaying || makingVideo || variation) return undefined;
    if (bounded >= snapshots.length - 1) {
      setReplayPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(
      () => v.goMainline(bounded + 1),
      replayIntervalMs(replayMovesPerSecond),
    );
    return () => window.clearTimeout(timer);
  }, [
    open,
    replayPlaying,
    replayMovesPerSecond,
    makingVideo,
    variation,
    bounded,
    snapshots.length,
  ]);

  useEffect(() => {
    if (!open) {
      setReplayPlaying(false);
      setReplayMenuOpen(false);
      setShareState({ status: 'idle', message: '' });
      videoCancelledRef.current = true;
    }
    return () => {
      videoCancelledRef.current = true;
    };
  }, [open]);

  useEffect(() => {
    if (!replayMenuOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (replayMenuRef.current && !replayMenuRef.current.contains(event.target)) {
        setReplayMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setReplayMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [replayMenuOpen]);

  const stopPlayback = () => setReplayPlaying(false);
  const playFullReplay = () => {
    if (makingVideo || snapshots.length <= 1) return;
    if (replayPlaying) {
      setReplayPlaying(false);
      return;
    }
    v.goMainline(0);
    setVideoState({ status: 'idle', progress: 0, message: '' });
    setReplayPlaying(true);
  };

  const sharedGameToken = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('game') || '';
  const canShareReplayLink = Boolean(sharedGameToken || (game?.id && onShareGame));

  const deliverReplayLink = async (link) => {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: 'Quantum Chess game replay', url: link });
      return 'Game link shared.';
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      return 'Game link copied.';
    }
    window.prompt('Copy this game replay link:', link);
    return 'Game link ready to copy.';
  };

  const shareReplayLink = async () => {
    if (!canShareReplayLink || shareState.status === 'working') return;
    setShareState({ status: 'working', message: 'Preparing game link…' });
    try {
      if (sharedGameToken) {
        const link = `${window.location.origin}/play?game=${encodeURIComponent(sharedGameToken)}`;
        const message = await deliverReplayLink(link);
        setShareState({ status: 'done', message });
        return;
      }
      const result = await onShareGame(game);
      if (result?.cancelled) {
        setShareState({ status: 'idle', message: '' });
      } else if (result?.error) {
        setShareState({ status: 'error', message: result.error });
      } else if (result?.shared) {
        setShareState({ status: 'done', message: 'Game link shared.' });
      } else if (result?.copied) {
        setShareState({ status: 'done', message: 'Game link copied.' });
      } else {
        setShareState({ status: 'error', message: 'The game link could not be created.' });
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setShareState({ status: 'idle', message: '' });
      } else {
        setShareState({ status: 'error', message: error?.message || 'The game link could not be shared.' });
      }
    }
  };

  const waitForBoardPaint = () => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });

  const makeReplayVideo = async () => {
    if (makingVideo || snapshots.length <= 1) return;
    if (!canMakeReplayVideo()) {
      setVideoState({ status: 'error', progress: 0, message: 'This browser can play the replay, but cannot export video.' });
      return;
    }

    setReplayPlaying(false);
    videoCancelledRef.current = false;
    setVideoState({ status: 'recording', progress: 0, message: 'Preparing video…' });
    let recording = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const imageCache = new Map();
      const finalPly = snapshots.length - 1;
      v.goMainline(0);
      await waitForBoardPaint();
      await paintReplayVideoFrame({
        canvas,
        snapshot: snapshots[0],
        ply: 0,
        totalPlies: finalPly,
        game,
        orientation,
        squareColors,
        pieceSvgStyles,
        indicators,
        imageCache,
      });
      recording = startReplayVideoRecorder(canvas);

      for (let ply = 0; ply <= finalPly; ply += 1) {
        if (videoCancelledRef.current) throw new Error('Video export cancelled.');
        const frameStarted = performance.now();
        if (ply > 0) {
          v.goMainline(ply);
          await waitForBoardPaint();
          await paintReplayVideoFrame({
            canvas,
            snapshot: snapshots[ply],
            ply,
            totalPlies: finalPly,
            game,
            orientation,
            squareColors,
            pieceSvgStyles,
            indicators,
            imageCache,
          });
        }
        const progress = Math.round(((ply + 1) / (finalPly + 1)) * 100);
        setVideoState({ status: 'recording', progress, message: `Recording replay… ${progress}%` });
        const remaining = Math.max(0, REPLAY_PLY_INTERVAL_MS - (performance.now() - frameStarted));
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }

      recording.recorder.stop();
      const blob = await recording.finished;
      if (videoCancelledRef.current) return;
      downloadReplayVideo(blob, game, recording.format.extension);
      setVideoState({ status: 'done', progress: 100, message: 'Video downloaded — ready to post.' });
    } catch (error) {
      if (recording?.recorder?.state === 'recording') recording.recorder.stop();
      if (!videoCancelledRef.current) {
        setVideoState({ status: 'error', progress: 0, message: error?.message || 'The video could not be created.' });
      }
    }
  };

  useEffect(() => {
    if (
      !open
      || loading
      || initialReplayAction !== 'video'
      || snapshots.length <= 1
    ) return undefined;
    const actionKey = `${game?.id || 'game'}:video`;
    if (initialReplayActionHandledRef.current === actionKey) return undefined;
    setReplayMenuOpen(true);
    const timer = window.setTimeout(() => {
      if (initialReplayActionHandledRef.current === actionKey) return;
      initialReplayActionHandledRef.current = actionKey;
      makeReplayVideo();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, loading, initialReplayAction, snapshots.length, game?.id]);

  const actualNextMove = useMemo(() => {
    if (variation || !timeline || bounded >= timeline.entries.length) return null;
    const entry = timeline.entries[bounded];
    if (!entry) return null;
    if (entry.type === 'move') {
      return {
        from: entry.from,
        to: entry.to,
        enPassant: Boolean(entry.enPassant),
        castle: false,
      };
    }
    const played = snapshots[bounded + 1]?.lastMove;
    return played ? { from: played.from, to: played.to, castle: true, enPassant: false } : null;
  }, [variation, timeline, snapshots, bounded]);

  // Engine suggestions for the viewed position, computed off-thread: the
  // THREE strongest moves drawn as layered green arrows — the best one
  // boldest. A full-root depth-2 pass makes them appear quickly, then an
  // iterative Multi-PV search keeps deepening through a long
  // selected-position budget. Every completed layer replaces all three
  // suggestions with a freshly ranked, same-depth set and refreshes the eval
  // bar and move-list value. The game's actual continuation is pinned into
  // the root beam so review never prunes the move it is trying to judge.
  const [hints, setHints] = useState(null); // [{ from, to, enPassant, castle, score }] best-first
  const [hintDepth, setHintDepth] = useState(0);
  const reqIdRef = useRef(0);
  useEffect(() => {
    setHints(null);
    setHintDepth(0);
    if (!analysisEnabled || !open || !snap || snap.gameOver) return undefined;
    const sig = snap.positionSig || null;
    const cached = getCachedHints(sig);
    if (cached) {
      setHints(cached);
      setHintDepth(Math.max(0, ...cached.map((move) => move.depth || 0)));
    }
    const reqId = ++reqIdRef.current;
    const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
    let lastDepth = cached ? Math.max(0, ...cached.map((move) => move.depth || 0)) : 0;

    const publishEval = (score, depth) => {
      if (!Number.isFinite(score) || !Number.isFinite(depth) || depth < lastDepth) return;
      lastDepth = depth;
      setHintDepth(depth);
      const whiteEval = Number((snap.sideToMove === 'white' ? score : -score).toFixed(2));
      if (!variation) graph.recordEval(bounded, 'live', whiteEval);
      const fixedTier = snap.sideToMove === 'white'
        ? ({ 2: 'fast', 4: 'mid', 6: 'deep' })[depth]
        : ({ 1: 'fast', 3: 'mid', 5: 'deep' })[depth];
      if (fixedTier) {
        if (variation) cacheEval(sig, fixedTier, whiteEval);
        else graph.recordEval(bounded, fixedTier, whiteEval);
      }
    };

    const publishBestMoves = (moves, move, score, depth) => {
      if (depth < lastDepth) return;
      publishEval(score, depth);
      const ranked = (Array.isArray(moves) ? moves : [])
        .map((line) => normalizeWorkerMove(line, line.score, depth))
        .filter(Boolean)
        .slice(0, 3);
      const fallback = normalizeWorkerMove(move, score, depth);
      const next = ranked.length ? ranked : (fallback ? [fallback] : []);
      if (!next.length) return;
      setHints(next);
      cacheHints(sig, next);
    };

    const postQuick = () => worker.postMessage({
      type: 'analyze',
      id: `${reqId}:quick`,
      payload: {
        engine: 'fast',
        pieces: snap.pieces,
        sideToMove: snap.sideToMove,
        lastMove: snap.lastMove || null,
        depth: 2,
        widths: [176, 10, 8],
        timeMs: 8000,
      },
    });
    const postDeepening = () => worker.postMessage({
      type: 'bestMove',
      id: `${reqId}:progress`,
      payload: {
        engine: 'fast',
        pieces: snap.pieces,
        sideToMove: snap.sideToMove,
        lastMove: snap.lastMove || null,
        depth: 64,
        widths: [176, 12, 8, 6, 5, 4],
        timeMs: 300000,
        timeMode: 'until-timeout',
        preferredMove: actualNextMove,
        multiPv: 3,
      },
    });
    worker.addEventListener('message', (e) => {
      const data = e.data || {};
      if (reqId !== reqIdRef.current) return;
      if (data.type === 'analysis' && data.id === `${reqId}:quick`) {
        if (data.moves && data.moves.length) {
          const quick = data.moves.slice(0, 3).map((move) => ({ ...move, depth: 2 }));
          setHints(quick);
          cacheHints(sig, quick);
          publishEval(data.moves[0].score, 2);
        }
        postDeepening();
        return;
      }
      if ((data.type === 'bestMoveProgress' || data.type === 'bestMove')
        && data.id === `${reqId}:progress`) {
        publishBestMoves(data.moves, data.move, data.score, data.depth);
      }
    });
    if (cached) postDeepening();
    else postQuick();
    return () => { worker.terminate(); };
  }, [analysisEnabled, open, snap, bounded, variation, actualNextMove, graph.recordEval]);

  if (!open) return null;

  // Move rows: snapshots[k] is reached by entries[k-1].
  const rowsToPairs = (rws) => {
    const pairs = [];
    for (const r of rws) {
      if (r.mover === 'white' || !pairs.length || pairs[pairs.length - 1].black) {
        pairs.push({ moveNo: pairs.length + 1, white: r.mover === 'white' ? r : null, black: r.mover === 'black' ? r : null });
      } else {
        pairs[pairs.length - 1].black = r;
      }
    }
    return pairs;
  };
  const rows = snapshots.slice(1).map((s, i) => {
    const entry = timeline.entries[i] || null;
    const mover = s.lastMove ? s.lastMove.side : (i % 2 === 0 ? 'white' : 'black');
    const before = evalAt(i);
    const after = evalAt(i + 1);
    const haveBoth = before !== null && after !== null;
    const moverDrop = haveBoth ? (mover === 'white' ? -(after - before) : after - before) : 0;
    const decisiveBeforeAndAfter = haveBoth && staysInSameDecisiveBand(before, after);
    const mark = !haveBoth || decisiveBeforeAndAfter
      ? ''
      : moverDrop >= BLUNDER_DROP ? '??' : moverDrop >= MISTAKE_DROP ? '?' : '';
    const markTitle = mark === '??'
      ? `Blunder — the mover's eval dropped ${moverDrop.toFixed(1)} pawns`
      : mark === '?'
        ? `Mistake — the mover's eval dropped ${moverDrop.toFixed(1)} pawns`
        : '';
    const label = entry && entry.type === 'castle'
      ? `${entry.piece1_from} ⇄ ${entry.piece2_from}`
      : s.lastMove ? `${s.lastMove.from} → ${s.lastMove.to}${entry && entry.enPassant ? ' ep' : ''}` : '?';
    return { snapIdx: i + 1, mover, label, mark, markTitle, evalAfter: after };
  });

  const highlights = lastMoveHighlights(snap?.lastMove);
  const reviewZapMarks = snap?.lastMove?.zappedSquares || [];
  const reviewHealMarks = snap?.lastMove?.healedSquares || [];
  const reviewFailedHealMarks = snap?.lastMove?.failedHealSquares || [];
  const reviewFizzleMarks = snap?.lastMove?.fizzledSquares || [];
  const reviewPulseOrigin = snap?.lastMove
    && (reviewZapMarks.length || reviewHealMarks.length || reviewFailedHealMarks.length || reviewFizzleMarks.length)
    ? snap.lastMove.to
    : null;
  const reviewEffectKey = variation
    ? `variation-${variation.baseIdx}-${variation.vIdx}`
    : `mainline-${bounded}`;

  // Engine scores are mover-relative; show them white-positive to match the bar.
  const hintEvalWhite = (score) => (snap && snap.sideToMove === 'black' ? -score : score);
  const hintEval = !snap || snap.gameOver
    ? null
    : (hints && hints.length && Number.isFinite(hints[0].score) ? hintEvalWhite(hints[0].score) : null);
  // Variation positions read the hint engine's live judgment; the mainline
  // prefers the graph's tier-consistent value, then the hint engine's live
  // judgment of THIS position (better than borrowing a neighbor's value
  // while the scanner is still on its way here).
  const varEval = variation
    ? (snap && snap.gameOver
      ? (snap.winner === 'white' ? 1000 : snap.winner === 'black' ? -1000 : 0)
      : hintEval)
    : null;
  const exactEval = variation ? varEval : (evalAt(bounded) ?? hintEval);
  const currentEval = exactEval !== null && exactEval !== undefined
    ? exactEval
    : variation ? 0 : nearestEval(bounded);
  // Squash white-positive pawn eval into a 0..100% bar position.
  const evalPct = 100 / (1 + Math.exp(-currentEval / 3));
  // The number lives in the bar's top band. The fill boundary must never
  // cross it (half-dark half-light digits): near-saturated fills clamp just
  // below the band, and only a truly total fill covers it — flipping the
  // digits to dark exactly when the band's background is white.
  const evalFillPct = evalPct >= 99.9 ? 100 : Math.min(evalPct, 96.5);
  const evalTextDark = evalFillPct >= 99.9;
  // The three strongest moves as arrows: best is boldest, the others fade.
  const HINT_OPACITIES = [0.8, 0.38, 0.28];
  const hintArrows = (hints || [])
    .filter((m) => m.from && m.to && !m.castle)
    .map((m, i) => ({ from: m.from, to: m.to, opacity: HINT_OPACITIES[i] ?? 0.25 }));

  const orientation = game && game.user_side === 'black' ? 'black' : 'white';
  const bottomSide = orientation;
  const topSide = bottomSide === 'white' ? 'black' : 'white';
  const botOf = (side) => {
    const id = side === 'white' ? game && game.whiteName : game && game.blackName;
    if (id) return getBotById(id);
    return side !== bottomSide && game && game.opponent ? getBotById(game.opponent) : null;
  };
  const nameOf = (side) => {
    const bot = botOf(side);
    if (bot) return bot.name;
    if (game && game.whiteName && side === 'white') return game.whiteName;
    if (game && game.blackName && side === 'black') return game.blackName;
    return side === bottomSide
      ? (game && (game.owner_username || game.viewerLabel)) || 'You'
      : (game && game.opponent) || 'Opponent';
  };
  const avatarOf = (side) => botAvatarDescriptor(botOf(side));
  const ratingOf = (side) => {
    const bot = botOf(side);
    return bot && Number.isFinite(bot.rating) ? bot.rating : '????';
  };
  const headlineOpponent = getBotById(game?.opponent)?.name || game?.opponent || 'unknown';
  const headline = game && game.headline ? game.headline : game
    ? `vs ${headlineOpponent}${game.opponent_rating ? ` (${game.opponent_rating})` : ''} · ${game.result || ''}`
    : '';

  const reviewBar = (side) => (
    <PlayerBar
      side={side}
      playerName={nameOf(side)}
      rating={ratingOf(side)}
      avatar={avatarOf(side)}
      tagline={avatarOf(side) ? avatarOf(side).tagline : null}
      playerBarColors={{ background: '#000', text: '#fff' }}
      svgStyles={pieceSvgStyles || { white: {}, black: {} }}
      showClock={false}
      capturedPawns={capturedPieces(snap.pieces, side === 'white' ? 'black' : 'white', true)}
      capturedOthers={capturedPieces(snap.pieces, side === 'white' ? 'black' : 'white', false)}
    />
  );

  const content = (
    <>
        <div style={styles.header}>
          <h2 id="qc-review-title" style={styles.title}>
            {analysisEnabled
              ? <Microscope size={18} color={theme.primary} />
              : <History size={18} color={theme.primary} />}
            {analysisEnabled ? 'Game Review' : 'Game Replay'}
            <span style={styles.sub}>{headline}</span>
          </h2>
          <ModalCloseButton ariaLabel={analysisEnabled ? 'Close game review' : 'Close game replay'} className="qc-review-close" onClick={onClose} />
        </div>

        {loading ? (
          <div className="qc-review-loading" role="status">
            <QuantumOrbit className="qc-review-loading__orbit" ariaHidden />
            <strong className="qc-review-loading__title">
              {analysisEnabled ? 'Preparing game review' : 'Loading game replay'}
            </strong>
            <span className="qc-review-loading__message">Resolving the saved timeline…</span>
          </div>
        ) : loadError ? (
          <div style={{ fontSize: 13, color: '#ff8f8f', padding: 12 }}>
            {loadError}
          </div>
        ) : !timeline || snapshots.length <= 1 ? (
          <div style={{ fontSize: 13, color: theme.textSecondary, padding: 12 }}>
            This game has no replayable moves.
          </div>
        ) : (
          <>
            {timeline.incomplete ? (
              <div style={{ fontSize: 12, color: theme.textSecondary }}>
                This game was saved before full replay data was recorded — showing the
                first {snapshots.length - 1} moves.
              </div>
            ) : null}
            <div className="qc-review-content" style={styles.content}>
              <div className="qc-review-board" style={styles.boardCol}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', justifyContent: 'center' }}>
                {analysisEnabled ? <div style={styles.evalBarVertical} title={`Eval ${formatEval(currentEval)} (white)`}>
                  <div style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, height: `${evalFillPct}%`,
                    background: '#e8e8e8', transition: 'height 200ms ease',
                    // follow the bar's rounding: bottom always, top only when total
                    borderRadius: evalTextDark ? 'inherit' : '0 0 7px 7px',
                  }} />
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '50%', height: 1,
                    background: 'rgba(120,120,120,0.8)',
                  }} />
                  <span style={styles.evalBarNumber(evalTextDark)}>{exactEval === null ? '…' : formatEval(currentEval)}</span>
                </div> : null}
                <div className="qc-review-board-shell" style={{ width: 'min(60vmin, 440px)', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reviewBar(topSide)}
                <div className="qc-review-board-capture">
                <Board
                  orientation={orientation}
                  showCoordinates={false}
                  highlights={varSel ? [...highlights, { square: varSel, color: 'rgba(79,195,247,0.45)' }] : highlights}
                  arrows={analysisEnabled && !makingVideo ? hintArrows : []}
                  pieces={snap.pieces}
                  zapMarks={reviewZapMarks}
                  healMarks={reviewHealMarks}
                  failedHealMarks={reviewFailedHealMarks}
                  fizzleMarks={reviewFizzleMarks}
                  pulseOrigin={reviewPulseOrigin}
                  effectKey={reviewEffectKey}
                  indicators={indicators}
                  maxVisualSize="100%"
                  borderColor="transparent"
                  shadow="rgba(0, 0, 0, 0.15)"
                  pieceSvgStyles={pieceSvgStyles}
                  squareColors={squareColors}
                  ariaLabel={analysisEnabled ? 'Review board' : 'Replay board'}
                  onSquareClick={makingVideo || replayPlaying ? undefined : v.handleBoardClick}
                  onPieceClick={({ id }) => {
                    if (makingVideo || replayPlaying) return;
                    const pc = snap.pieces.find((p) => p.id === id);
                    if (pc && pc.square) v.handleBoardClick({ square: pc.square });
                  }}
                  onPieceDragStart={(piece) => {
                    if (makingVideo || replayPlaying) return false;
                    const pc = piece && snap.pieces.find((p) => p.id === piece.id);
                    if (!pc || snap.gameOver || pc.side !== snap.sideToMove) return false;
                    v.setVarSel(pc.square);
                    return true;
                  }}
                  onPieceDrop={({ from, to }) => {
                    // A no-move drop is just a click's pointerdown/up pair —
                    // keep the selection so click-then-click works; the
                    // second click (or a drag) completes the move.
                    if (!makingVideo && !replayPlaying && from && to && from !== to) v.playVariationMove(from, to);
                  }}
                  selectedId={v.varSelPiece ? v.varSelPiece.id : null}
                  legalMoves={v.varTargets}
                />
                </div>
                {reviewBar(bottomSide)}
                </div>
                </div>
              </div>

              <div className="qc-review-side" style={styles.sideCol}>
                {analysisEnabled ? <div>
                  <div className="qc-review-hint-heading" style={styles.hintHead}>
                    <Sparkles size={15} strokeWidth={2.5} />
                    {snap.gameOver
                      ? 'Final position'
                      : hints && hints.length
                        ? `Engine suggests${hintDepth ? ` · depth ${hintDepth}` : ''}`
                        : 'Engine is thinking…'}
                  </div>
                  <div className="qc-review-hint-box" style={styles.hintBox}>
                    {snap.gameOver ? (
                      <span className="qc-review-hint-final">
                        {snap.gameOverReason}
                        {snap.winner ? ` — ${snap.winner} wins` : ''}.
                      </span>
                    ) : hints && hints.length ? (
                      <div className="qc-review-hint-list">
                        {hints.map((m, i) => (
                          <div
                            key={`hint-${i}`}
                            className={`qc-review-hint-line${i === 0 ? ' is-best' : ''}`}
                          >
                            <span className="qc-review-hint-rank">{i === 0 ? 'Best' : i + 1}</span>
                            <strong className="qc-review-hint-move">{describeHintMove(m)}</strong>
                            {Number.isFinite(m.score) ? (
                              <span className="qc-review-hint-eval">
                                {formatEval(hintEvalWhite(m.score))}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="qc-review-hint-thinking">Scanning the position…</span>
                    )}
                  </div>
                </div> : null}
                {variation ? (
                  <div style={styles.variationStrip}>
                    <span style={styles.variationLabel}>
                      Variation · from move {Math.floor(variation.baseIdx / 2) + 1}
                    </span>
                    {variation.snaps.slice(1).map((vs, i) => (
                      <button
                        key={`var-${i}`}
                        type="button"
                        style={styles.variationChip(variation.vIdx === i + 1)}
                        onClick={() => v.setVariation({ ...variation, vIdx: i + 1 })}
                      >
                        {vs.lastMove ? `${vs.lastMove.from}→${vs.lastMove.to}` : '?'}
                      </button>
                    ))}
                    <span style={styles.variationExit}>
                      <IconButton
                        icon={Undo2} size={15} title="Back to game" suppressTitle ariaLabel="Leave the variation and return to the game"
                        onClick={() => v.goMainline(variation.baseIdx)} width={30} height={26} radius={7}
                        bg="rgba(255,107,107,0.12)" color="#ff8f8f" hoverInvert shadow="transparent"
                      />
                    </span>
                  </div>
                ) : null}
                <div className="qc-review-moves" style={styles.moveList}>
                  {rowsToPairs(rows).map((pair) => (
                    <React.Fragment key={`mv-${pair.moveNo}`}>
                      <span className="qc-review-move-number" style={styles.moveNo}>{pair.moveNo}.</span>
                      {[pair.white, pair.black].map((r, col) => (r ? (
                        <div
                          key={`cell-${r.snapIdx}`}
                          className="qc-review-move-row"
                          style={styles.moveCell(!variation && bounded === r.snapIdx)}
                          onClick={(e) => { e.currentTarget.blur(); stopPlayback(); v.goMainline(r.snapIdx); }}
                          role="button" tabIndex={0}
                          aria-current={!variation && bounded === r.snapIdx ? 'step' : undefined}
                        >
                          <span
                            className="qc-review-move-label"
                            style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {r.label}
                          </span>
                          {analysisEnabled ? <span style={styles.mark(r.mark)} title={r.markTitle}>{r.mark}</span> : null}
                          {analysisEnabled ? <span
                            className="qc-review-move-eval"
                            title="Engine eval after this move (positive is better for White)"
                          >{r.evalAfter === null ? '…' : formatEval(r.evalAfter)}</span> : null}
                        </div>
                      ) : (
                        <span key={`cell-empty-${pair.moveNo}-${col}`} />
                      )))}
                    </React.Fragment>
                  ))}
                </div>
                <div style={styles.nav}>
                  <span style={styles.navCounter} title="Use ← → to step through moves">
                    {variation
                      ? `Variation ${variation.vIdx} / ${variation.snaps.length - 1}`
                      : `Move ${bounded} / ${snapshots.length - 1}`}
                  </span>
                  <IconButton icon={SkipBack} size={16} title="Start" suppressTitle ariaLabel="Jump to start" onClick={() => { stopPlayback(); v.seekStart(); }} width={36} height={30} radius={8} bg={theme.secondary} color={theme.primary} hoverInvert shadow="transparent" />
                  <IconButton icon={ChevronLeft} size={18} title="Previous move (←)" suppressTitle ariaLabel="Previous move" onClick={() => { stopPlayback(); v.seekPrev(); }} width={44} height={30} radius={8} bg={theme.secondary} color={theme.primary} hoverInvert shadow="transparent" />
                  <IconButton icon={ChevronRight} size={18} title="Next move (→)" suppressTitle ariaLabel="Next move" onClick={() => { stopPlayback(); v.seekNext(); }} width={44} height={30} radius={8} bg={theme.secondary} color={theme.primary} hoverInvert shadow="transparent" />
                  <IconButton icon={SkipForward} size={16} title="End" suppressTitle ariaLabel="Jump to end" onClick={() => { stopPlayback(); v.seekEnd(); }} width={36} height={30} radius={8} bg={theme.secondary} color={theme.primary} hoverInvert shadow="transparent" />
                </div>
                <div className="qc-review-replay-actions" style={styles.replayActions} ref={replayMenuRef}>
                  <button
                    type="button"
                    className="qc-review-actions-trigger"
                    style={styles.replayActionsTrigger(replayMenuOpen)}
                    aria-expanded={replayMenuOpen}
                    aria-controls="qc-review-replay-menu"
                    onClick={() => setReplayMenuOpen((shown) => !shown)}
                  >
                    <span style={styles.replayToolIcon}>
                      {replayPlaying ? <Pause size={16} /> : <Share2 size={16} />}
                    </span>
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      {replayPlaying
                        ? `Replay playing · ${replayMovesPerSecond} moves/sec`
                        : 'Replay & share'}
                    </span>
                    <ChevronDown
                      className="qc-review-actions-chevron"
                      size={17}
                      style={{ transform: replayMenuOpen ? 'rotate(180deg)' : 'none' }}
                    />
                  </button>
                  {replayMenuOpen ? (
                    <div
                      id="qc-review-replay-menu"
                      className="qc-review-replay-menu"
                      style={styles.replayMenu}
                      role="dialog"
                      aria-label="Replay and sharing controls"
                    >
                      <div style={styles.replayMenuHeading}>
                        <strong>Replay & share</strong>
                        <span>Play it back, save a clip, or send the game.</span>
                      </div>
                      <div className="qc-review-replay-toolbar" style={styles.replayTools}>
                        <button
                          type="button"
                          className="qc-review-play-replay"
                          style={styles.replayToolButton(replayPlaying, 'play')}
                          aria-label={replayPlaying ? 'Pause full game replay' : 'Play full game replay'}
                          disabled={makingVideo}
                          onClick={playFullReplay}
                        >
                          <span style={styles.replayToolIcon}>
                            {replayPlaying ? <Pause size={16} /> : <Play size={16} />}
                          </span>
                          {replayPlaying ? 'Pause replay' : 'Play replay'}
                        </button>
                        <label className="qc-review-speed-control" style={styles.replaySpeedControl}>
                          <Gauge size={16} aria-hidden="true" />
                          <span style={styles.replaySpeedLabel}>Speed</span>
                          <select
                            className="qc-review-speed-select"
                            style={styles.replaySpeedSelect}
                            aria-label="Replay speed in moves per second"
                            value={replayMovesPerSecond}
                            onChange={(event) => setReplayMovesPerSecond(Number(event.target.value))}
                          >
                            {REPLAY_SPEED_OPTIONS.map((speed) => (
                              <option key={speed} value={speed}>
                                {speed} {speed === 1 ? 'move' : 'moves'} per second
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="qc-review-make-video"
                          style={styles.replayToolButton(makingVideo, 'video')}
                          aria-label="Make social replay video"
                          disabled={makingVideo}
                          onClick={makeReplayVideo}
                        >
                          <span style={styles.replayToolIcon}>
                            <Video size={16} />
                          </span>
                          {makingVideo ? 'Making video…' : 'Make social video'}
                        </button>
                        <button
                          type="button"
                          className="qc-review-share-link"
                          style={styles.replayToolButton(false, 'share')}
                          aria-label="Share game replay link"
                          disabled={!canShareReplayLink || shareState.status === 'working'}
                          onClick={shareReplayLink}
                          title={canShareReplayLink
                            ? 'Share a link that opens this game replay'
                            : 'Open a saved game from your profile to create a shareable link'}
                        >
                          <span style={styles.replayToolIcon}>
                            {shareState.status === 'done' ? <Link2 size={16} /> : <Share2 size={16} />}
                          </span>
                          {shareState.status === 'working' ? 'Preparing link…' : 'Share game link'}
                        </button>
                        {makingVideo ? (
                          <span style={styles.videoProgressTrack} aria-label={videoState.message}>
                            <span style={styles.videoProgressFill(videoState.progress)} />
                          </span>
                        ) : null}
                        {videoState.message ? (
                          <span style={styles.videoStatus(videoState.status === 'error')}>{videoState.message}</span>
                        ) : null}
                        {shareState.message ? (
                          <span style={styles.videoStatus(shareState.status === 'error')}>{shareState.message}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                {analysisEnabled && showEvalGraph ? (
                  <EvalTraceGraph
                    points={graph.graphTrace.map((p) => ({ ply: p.ply, side: p.side, eval: resolvePoint(p) }))}
                    count={snapshots.length}
                    idx={bounded}
                    onSeek={v.goMainline}
                    pendingCount={graph.graphPending}
                    deepening={graph.graphDeepening}
                    label={graph.lineTier}
                  />
                ) : null}
              </div>
            </div>
          </>
        )}
    </>
  );

  if (page) {
    return (
      <main
        className={`qc-review-page ${analysisEnabled ? 'qc-review-page--analysis' : 'qc-review-page--replay'}`}
        aria-labelledby="qc-review-title"
      >
        <section className="qc-review-page__panel">
          {content}
        </section>
      </main>
    );
  }

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      escapeToClose={false} // the keyboard-navigation effect in useReviewVariation already handles Escape
      zIndex={1002}
      ariaLabelledBy="qc-review-title"
      backdropClassName="qc-review-backdrop"
      panelClassName={`qc-review-panel ${analysisEnabled ? 'qc-review-panel--analysis' : 'qc-review-panel--replay'}`}
      panelStyle={styles.panel}
    >
      {content}
    </ModalShell>
  );
}
