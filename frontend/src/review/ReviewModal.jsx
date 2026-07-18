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
  ChevronLeft, ChevronRight, SkipBack, SkipForward, Microscope, Sparkles, Undo2,
} from 'lucide-react';
import Board from '../chessboard/Board.jsx';
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

const HIGHLIGHT_FROM = 'rgba(79, 195, 247, 0.55)';
const HIGHLIGHT_TO = 'rgba(246, 196, 69, 0.55)';

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

const sameHintMove = (a, b) => Boolean(a && b)
  && a.from === b.from && a.to === b.to
  && Boolean(a.castle) === Boolean(b.castle)
  && Boolean(a.enPassant) === Boolean(b.enPassant);

export default function ReviewModal({
  open = false,
  onClose = () => {},
  game = null, // { id, opponent, opponent_rating, user_side, result, created_at, headline? }
  moves = null, // stored qc_games.moves array
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

  const graph = useGameEvalGraph({ open, showEvalGraph, timeline, snapshots });
  const { evalAt, nearestEval, resolvePoint } = graph;

  const v = useReviewVariation({ open, snapshots, onClose });
  const { bounded, snap, variation, varSel } = v;

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
  // iterative search keeps deepening through a long selected-position
  // budget. Every completed layer refreshes the best arrow, eval bar, and
  // move-list value. The game's actual continuation is pinned into the root
  // beam so review never prunes the move it is trying to judge.
  const [hints, setHints] = useState(null); // [{ from, to, enPassant, castle, score }] best-first
  const [hintDepth, setHintDepth] = useState(0);
  const reqIdRef = useRef(0);
  useEffect(() => {
    setHints(null);
    setHintDepth(0);
    if (!open || !snap || snap.gameOver) return undefined;
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

    const publishBestMove = (move, score, depth) => {
      if (depth < lastDepth) return;
      const normalized = normalizeWorkerMove(move, score, depth);
      publishEval(score, depth);
      if (!normalized) return;
      setHints((previous) => {
        const next = [normalized, ...(previous || []).filter((candidate) => !sameHintMove(candidate, normalized))].slice(0, 3);
        cacheHints(sig, next);
        return next;
      });
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
        publishBestMove(data.move, data.score, data.depth);
      }
    });
    if (cached) postDeepening();
    else postQuick();
    return () => { worker.terminate(); };
  }, [open, snap, bounded, variation, actualNextMove, graph.recordEval]);

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

  const highlights = [];
  if (snap && snap.lastMove) {
    highlights.push({ square: snap.lastMove.from, color: HIGHLIGHT_FROM });
    highlights.push({ square: snap.lastMove.to, color: HIGHLIGHT_TO });
  }
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
    return id ? getBotById(id) : null;
  };
  const nameOf = (side) => {
    const bot = botOf(side);
    if (bot) return bot.name;
    if (game && game.whiteName && side === 'white') return game.whiteName;
    if (game && game.blackName && side === 'black') return game.blackName;
    return side === bottomSide ? 'You' : (game && game.opponent) || 'Opponent';
  };
  const avatarOf = (side) => botAvatarDescriptor(botOf(side));
  const ratingOf = (side) => {
    const bot = botOf(side);
    return bot && Number.isFinite(bot.rating) ? bot.rating : '????';
  };
  const headline = game && game.headline ? game.headline : game
    ? `vs ${game.opponent || 'unknown'}${game.opponent_rating ? ` (${game.opponent_rating})` : ''} · ${game.result || ''}`
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

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      escapeToClose={false} // the keyboard-navigation effect in useReviewVariation already handles Escape
      zIndex={1002}
      ariaLabelledBy="qc-review-title"
      backdropClassName="qc-review-backdrop"
      panelClassName="qc-review-panel"
      panelStyle={styles.panel}
    >
        <div style={styles.header}>
          <h2 id="qc-review-title" style={styles.title}>
            <Microscope size={18} color={theme.primary} /> Game Review
            <span style={styles.sub}>{headline}</span>
          </h2>
          <ModalCloseButton ariaLabel="Close game review" className="qc-review-close" onClick={onClose} />
        </div>

        {!timeline || snapshots.length <= 1 ? (
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
            <div style={styles.content}>
              <div className="qc-review-board" style={styles.boardCol}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', justifyContent: 'center' }}>
                <div style={styles.evalBarVertical} title={`Eval ${formatEval(currentEval)} (white)`}>
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
                </div>
                <div style={{ width: 'min(60vmin, 440px)', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reviewBar(topSide)}
                <Board
                  orientation={orientation}
                  showCoordinates={false}
                  highlights={varSel ? [...highlights, { square: varSel, color: 'rgba(79,195,247,0.45)' }] : highlights}
                  arrows={hintArrows}
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
                  ariaLabel="Review board"
                  onSquareClick={v.handleBoardClick}
                  onPieceClick={({ id }) => {
                    const pc = snap.pieces.find((p) => p.id === id);
                    if (pc && pc.square) v.handleBoardClick({ square: pc.square });
                  }}
                  onPieceDragStart={(piece) => {
                    const pc = piece && snap.pieces.find((p) => p.id === piece.id);
                    if (!pc || snap.gameOver || pc.side !== snap.sideToMove) return false;
                    v.setVarSel(pc.square);
                    return true;
                  }}
                  onPieceDrop={({ from, to }) => {
                    // A no-move drop is just a click's pointerdown/up pair —
                    // keep the selection so click-then-click works; the
                    // second click (or a drag) completes the move.
                    if (from && to && from !== to) v.playVariationMove(from, to);
                  }}
                  selectedId={v.varSelPiece ? v.varSelPiece.id : null}
                  legalMoves={v.varTargets}
                />
                {reviewBar(bottomSide)}
                </div>
                </div>
              </div>

              <div className="qc-review-side" style={styles.sideCol}>
                <div>
                  <div style={styles.hintHead}>
                    <Sparkles size={13} strokeWidth={2.5} />
                    {snap.gameOver
                      ? 'Final position'
                      : hints && hints.length
                        ? `Engine suggests${hintDepth ? ` · depth ${hintDepth}` : ''}`
                        : 'Engine is thinking…'}
                  </div>
                  <div style={styles.hintBox}>
                    {snap.gameOver ? (
                      <span>
                        {snap.gameOverReason}
                        {snap.winner ? ` — ${snap.winner} wins` : ''}.
                      </span>
                    ) : hints && hints.length ? (
                      <span>
                        {hints.map((m, i) => (
                          <span key={`hint-${i}`} style={{ display: 'block', opacity: i === 0 ? 1 : 0.65 }}>
                            {`${i + 1}. `}
                            <strong>{describeHintMove(m)}</strong>
                            {Number.isFinite(m.score) ? ` · ${formatEval(hintEvalWhite(m.score))}` : ''}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.6 }}>scanning the position…</span>
                    )}
                  </div>
                </div>
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
                      <span style={styles.moveNo}>{pair.moveNo}.</span>
                      {[pair.white, pair.black].map((r, col) => (r ? (
                        <div
                          key={`cell-${r.snapIdx}`}
                          className="qc-review-move-row"
                          style={styles.moveCell(!variation && bounded === r.snapIdx)}
                          onClick={(e) => { e.currentTarget.blur(); v.goMainline(r.snapIdx); }}
                          role="button" tabIndex={0}
                        >
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                          <span style={styles.mark(r.mark)} title={r.markTitle}>{r.mark}</span>
                          <span
                            style={{ color: theme.textSecondary, minWidth: 38, textAlign: 'right' }}
                            title="Engine eval after this move (positive is better for White)"
                          >{r.evalAfter === null ? '…' : formatEval(r.evalAfter)}</span>
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
                  <IconButton icon={SkipBack} size={16} title="Start" suppressTitle ariaLabel="Jump to start" onClick={v.seekStart} width={36} height={30} radius={8} bg={theme.secondary} color={theme.primary} hoverInvert shadow="transparent" />
                  <IconButton icon={ChevronLeft} size={18} title="Previous move (←)" suppressTitle ariaLabel="Previous move" onClick={v.seekPrev} width={44} height={30} radius={8} bg={theme.secondary} color={theme.primary} hoverInvert shadow="transparent" />
                  <IconButton icon={ChevronRight} size={18} title="Next move (→)" suppressTitle ariaLabel="Next move" onClick={v.seekNext} width={44} height={30} radius={8} bg={theme.secondary} color={theme.primary} hoverInvert shadow="transparent" />
                  <IconButton icon={SkipForward} size={16} title="End" suppressTitle ariaLabel="Jump to end" onClick={v.seekEnd} width={36} height={30} radius={8} bg={theme.secondary} color={theme.primary} hoverInvert shadow="transparent" />
                </div>
                {showEvalGraph ? (
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
    </ModalShell>
  );
}
