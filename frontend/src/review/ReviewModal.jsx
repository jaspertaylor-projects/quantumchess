// frontend/src/review/ReviewModal.jsx
// Purpose: Premium game review — replay a saved game move by move with an
// engine eval bar, move-quality marks, and a best-move suggestion computed
// in a web worker for the position being viewed.
// Imports From: ../theme.js, ../components/IconButton.jsx, ../chessboard/Board.jsx,
//   ../ai/alphaBetaEngine.js, ./replayCore.js
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import {
  X as XIcon, ChevronLeft, ChevronRight, SkipBack, SkipForward, Microscope,
} from 'lucide-react';
import Board from '../chessboard/Board.jsx';
import { evaluatePosition } from '../ai/alphaBetaEngine.js';
import { buildReviewTimeline } from './replayCore.js';

const HIGHLIGHT_FROM = 'rgba(79, 195, 247, 0.55)';
const HIGHLIGHT_TO = 'rgba(246, 196, 69, 0.55)';
const HIGHLIGHT_HINT = 'rgba(126, 231, 135, 0.6)';

// Mover-perspective eval drop (in pawns) that earns a mark in the move list.
const MISTAKE_DROP = 1.5;
const BLUNDER_DROP = 3;

function formatEval(v) {
  if (v >= 900) return '#'; // mate-magnitude
  if (v <= -900) return '#';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

function describeHintMove(mv) {
  if (!mv) return '';
  if (mv.type === 'castle' && mv.plan) return `castle ${mv.plan.piece1_from}+${mv.plan.piece2_from}`;
  return `${mv.from} → ${mv.to}${mv.type === 'enpassant' ? ' (en passant)' : ''}`;
}

export default function ReviewModal({
  open = false,
  onClose = () => {},
  game = null, // { id, opponent, opponent_rating, user_side, result, created_at }
  moves = null, // stored qc_games.moves array
  pieceSvgStyles,
  indicators,
  measurementColors,
  squareColors,
}) {
  const timeline = useMemo(
    () => (open && Array.isArray(moves) ? buildReviewTimeline(moves) : null),
    [open, moves],
  );
  const snapshots = timeline ? timeline.snapshots : [];
  const [idx, setIdx] = useState(0);

  // Static eval per snapshot (white-positive, pawn units) — cheap enough to
  // compute for the whole game up front; powers the eval bar and the marks.
  const evals = useMemo(
    () => snapshots.map((s) => evaluatePosition(s.pieces)),
    [snapshots],
  );

  useEffect(() => {
    if (open) setIdx(snapshots.length > 0 ? snapshots.length - 1 : 0);
  }, [open, snapshots.length]);

  const bounded = Math.max(0, Math.min(idx, snapshots.length - 1));
  const snap = snapshots[bounded] || null;

  // Engine suggestion for the viewed position, computed off-thread. A fresh
  // worker per position keeps this dead simple; stale replies are ignored.
  const [hint, setHint] = useState(null); // { move, score, depth, settled }
  const reqIdRef = useRef(0);
  useEffect(() => {
    setHint(null);
    if (!open || !snap || snap.gameOver) return undefined;
    const reqId = ++reqIdRef.current;
    const worker = new Worker(new URL('../ai/aiWorker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e) => {
      const data = e.data || {};
      if (reqId !== reqIdRef.current) return;
      if (data.type === 'baseline' && data.move) {
        setHint((prev) => (prev && prev.settled ? prev : { move: data.move, score: data.score, depth: data.depth, settled: false }));
      } else if (data.type === 'best' && data.move) {
        setHint({ move: data.move, score: data.score, depth: data.depth, settled: true });
      }
    });
    worker.postMessage({
      type: 'think',
      id: reqId,
      payload: {
        pieces: snap.pieces,
        sideToMove: snap.sideToMove,
        difficulty: 'hard',
        botId: null,
        lastMove: snap.lastMove || null,
      },
    });
    return () => { worker.terminate(); };
  }, [open, snap]);

  // Keyboard navigation while the modal is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setIdx((i) => Math.min(snapshots.length - 1, i + 1)); }
      else if (e.key === 'Home') { e.preventDefault(); setIdx(0); }
      else if (e.key === 'End') { e.preventDefault(); setIdx(snapshots.length - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, snapshots.length, onClose]);

  if (!open) return null;

  const styles = {
    backdrop: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002,
    },
    panel: {
      width: 'min(96vw, 900px)', maxHeight: '92vh', overflowY: 'auto',
      borderRadius: 12, border: `1px solid ${theme.border}`, backgroundColor: theme.cardBackground,
      boxShadow: `0 12px 32px ${theme.shadow}`, color: theme.textPrimary, padding: 16,
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10,
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { margin: 0, fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 },
    sub: { fontSize: 12, color: theme.textSecondary },
    content: { display: 'flex', gap: 14, flexWrap: 'wrap' },
    boardCol: { flex: '1 1 340px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 8 },
    sideCol: { flex: '1 1 220px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 },
    evalBarOuter: {
      height: 14, borderRadius: 7, overflow: 'hidden', border: `1px solid ${theme.border}`,
      background: '#20242c', position: 'relative',
    },
    hintBox: {
      border: '1px solid rgba(126,231,135,0.5)', borderRadius: 8, padding: '8px 10px',
      background: 'rgba(126,231,135,0.08)', fontSize: 12.5, lineHeight: 1.5,
    },
    nav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
    moveList: {
      display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto',
      maxHeight: 380, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 6,
    },
    moveRow: (active) => ({
      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6,
      cursor: 'pointer', fontSize: 12.5,
      background: active ? 'rgba(79,195,247,0.15)' : 'transparent',
      border: `1px solid ${active ? 'rgba(79,195,247,0.5)' : 'transparent'}`,
    }),
    mark: (m) => ({
      fontWeight: 900, minWidth: 18, textAlign: 'center',
      color: m === '??' ? '#ff7b72' : m === '?' ? '#f6c445' : 'transparent',
    }),
  };

  // Move rows: snapshots[k] is reached by entries[k-1].
  const rows = snapshots.slice(1).map((s, i) => {
    const entry = timeline.entries[i] || null;
    const mover = s.lastMove ? s.lastMove.side : (i % 2 === 0 ? 'white' : 'black');
    const whiteDelta = evals[i + 1] - evals[i];
    const moverDrop = mover === 'white' ? -whiteDelta : whiteDelta;
    const mark = moverDrop >= BLUNDER_DROP ? '??' : moverDrop >= MISTAKE_DROP ? '?' : '';
    const label = entry && entry.type === 'castle'
      ? `castle ${entry.piece1_from}+${entry.piece2_from}`
      : s.lastMove ? `${s.lastMove.from} → ${s.lastMove.to}${entry && entry.enPassant ? ' ep' : ''}` : '?';
    return { snapIdx: i + 1, mover, label, mark, evalAfter: evals[i + 1] };
  });

  const highlights = [];
  if (snap && snap.lastMove) {
    highlights.push({ square: snap.lastMove.from, color: HIGHLIGHT_FROM });
    highlights.push({ square: snap.lastMove.to, color: HIGHLIGHT_TO });
  }
  if (hint && hint.move) {
    if (hint.move.type === 'castle' && hint.move.plan) {
      highlights.push({ square: hint.move.plan.piece1_from, color: HIGHLIGHT_HINT });
      highlights.push({ square: hint.move.plan.piece2_from, color: HIGHLIGHT_HINT });
    } else {
      highlights.push({ square: hint.move.from, color: HIGHLIGHT_HINT });
      highlights.push({ square: hint.move.to, color: HIGHLIGHT_HINT });
    }
  }

  const currentEval = evals[bounded] ?? 0;
  // Squash white-positive pawn eval into a 0..100% bar position.
  const evalPct = 100 / (1 + Math.exp(-currentEval / 3));
  // Engine hint score is mover-relative; show it white-positive to match the bar.
  const hintEvalWhite = hint && Number.isFinite(hint.score)
    ? (snap && snap.sideToMove === 'black' ? -hint.score : hint.score)
    : null;

  const orientation = game && game.user_side === 'black' ? 'black' : 'white';
  const headline = game
    ? `vs ${game.opponent || 'unknown'}${game.opponent_rating ? ` (${game.opponent_rating})` : ''} · ${game.result || ''}`
    : '';

  return (
    <div className="qc-review-backdrop" style={styles.backdrop} onClick={onClose}>
      <div
        className="qc-review-panel" style={styles.panel} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="qc-review-title"
      >
        <div style={styles.header}>
          <h2 id="qc-review-title" style={styles.title}>
            <Microscope size={18} color={theme.primary} /> Game Review
            <span style={styles.sub}>{headline}</span>
          </h2>
          <IconButton
            icon={XIcon} size={20} title="Close" ariaLabel="Close game review"
            className="qc-review-close" onClick={onClose} width={36} height={36} radius={8}
            bg={theme.secondary} color={theme.error} hoverInvert={true} shadow="transparent"
          />
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
                <div style={styles.evalBarOuter} title={`Eval ${formatEval(currentEval)} (white)`}>
                  <div style={{ position: 'absolute', inset: 0, width: `${evalPct}%`, background: '#e8e8e8', transition: 'width 200ms ease' }} />
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1,
                    background: 'rgba(120,120,120,0.8)',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: theme.textSecondary }}>
                  <span>Eval: <strong style={{ color: theme.textPrimary }}>{formatEval(currentEval)}</strong> (white)</span>
                  <span>Move {bounded} / {snapshots.length - 1}</span>
                </div>
                <Board
                  orientation={orientation}
                  showCoordinates={true}
                  highlights={highlights}
                  pieces={snap.pieces}
                  indicators={indicators}
                  measurementColors={measurementColors}
                  maxVisualSize="min(60vmin, 440px)"
                  borderColor="transparent"
                  shadow="rgba(0, 0, 0, 0.15)"
                  pieceSvgStyles={pieceSvgStyles}
                  squareColors={squareColors}
                  ariaLabel="Review board"
                />
                <div style={styles.nav}>
                  <IconButton icon={SkipBack} size={16} title="Start" ariaLabel="Jump to start" onClick={() => setIdx(0)} width={34} height={30} radius={7} bg={theme.secondary} color={theme.textPrimary} hoverInvert shadow="transparent" />
                  <IconButton icon={ChevronLeft} size={18} title="Previous move" ariaLabel="Previous move" onClick={() => setIdx((i) => Math.max(0, i - 1))} width={40} height={30} radius={7} bg={theme.secondary} color={theme.textPrimary} hoverInvert shadow="transparent" />
                  <IconButton icon={ChevronRight} size={18} title="Next move" ariaLabel="Next move" onClick={() => setIdx((i) => Math.min(snapshots.length - 1, i + 1))} width={40} height={30} radius={7} bg={theme.secondary} color={theme.textPrimary} hoverInvert shadow="transparent" />
                  <IconButton icon={SkipForward} size={16} title="End" ariaLabel="Jump to end" onClick={() => setIdx(snapshots.length - 1)} width={34} height={30} radius={7} bg={theme.secondary} color={theme.textPrimary} hoverInvert shadow="transparent" />
                </div>
              </div>

              <div className="qc-review-side" style={styles.sideCol}>
                <div style={styles.hintBox}>
                  {snap.gameOver ? (
                    <span>
                      Final position — {snap.gameOverReason}
                      {snap.winner ? `, ${snap.winner} wins` : ''}.
                    </span>
                  ) : hint && hint.move ? (
                    <span>
                      Engine{hint.settled ? '' : ' (thinking…)'} suggests{' '}
                      <strong>{describeHintMove(hint.move)}</strong>
                      {hintEvalWhite !== null ? ` · eval ${formatEval(hintEvalWhite)}` : ''}
                      {hint.depth ? ` · depth ${hint.depth}` : ''}
                    </span>
                  ) : (
                    <span>Engine is thinking…</span>
                  )}
                </div>
                <div className="qc-review-moves" style={styles.moveList}>
                  <div
                    style={styles.moveRow(bounded === 0)}
                    onClick={() => setIdx(0)}
                    role="button" tabIndex={0}
                  >
                    <span style={styles.mark('')}>·</span>
                    <span style={{ flex: 1 }}>Starting position</span>
                  </div>
                  {rows.map((r) => (
                    <div
                      key={r.snapIdx}
                      className="qc-review-move-row"
                      style={styles.moveRow(bounded === r.snapIdx)}
                      onClick={() => setIdx(r.snapIdx)}
                      role="button" tabIndex={0}
                    >
                      <span style={{ color: theme.textSecondary, minWidth: 26 }}>{r.snapIdx}.</span>
                      <span style={{ minWidth: 42, color: r.mover === 'white' ? '#e8e8e8' : '#9aa4b2', fontWeight: 700 }}>{r.mover}</span>
                      <span style={{ flex: 1 }}>{r.label}</span>
                      <span style={styles.mark(r.mark)}>{r.mark}</span>
                      <span style={{ color: theme.textSecondary, minWidth: 40, textAlign: 'right' }}>{formatEval(r.evalAfter)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.5 }}>
                  ? = mistake, ?? = blunder (eval drop for the mover). Evals are
                  the engine's static judgment, positive is better for white.
                  Use ← → to step through moves.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
