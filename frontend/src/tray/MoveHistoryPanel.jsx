// frontend/src/tray/MoveHistoryPanel.jsx
// Purpose: Displays the move list and provides basic rewatch controls by highlighting from/to squares for each move.
// Imports From: ../theme.js, ../store/index.js (via useSelector)
// Exported To: ./SideTray.jsx

import React, { useEffect, useMemo, useState } from 'react';
import theme from '../theme.js';
import { useSelector } from 'react-redux';
import { Play as PlayIcon, Pause as PauseIcon, SkipBack as SkipBackIcon, SkipForward as SkipForwardIcon, XCircle as XCircleIcon } from 'lucide-react';

export default function MoveHistoryPanel({ onHighlightMove = () => {}, onClearHighlights = () => {} }) {
  const moves = useSelector((s) => s.game.moves);

  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (index >= 0 && index < moves.length) {
      const m = moves[index];
      onHighlightMove([
        { square: m.from, color: 'rgba(97, 218, 251, 0.35)' },
        { square: m.to, color: 'rgba(255, 206, 84, 0.4)' },
      ]);
    } else {
      onClearHighlights();
    }
  }, [index, moves, onHighlightMove, onClearHighlights]);

  useEffect(() => {
    if (!playing) return;
    if (moves.length === 0) return;
    const id = setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        if (next >= moves.length) return 0;
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, [playing, moves.length]);

  useEffect(() => {
    setIndex(moves.length - 1);
  }, [moves.length]);

  const styles = useMemo(() => ({
    root: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: 12,
      boxSizing: 'border-box',
      gap: 10,
      overflow: 'hidden',
    },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: 8,
      background: 'rgba(255,255,255,0.03)',
    },
    ctrlBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: 36,
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: 'transparent',
      color: theme.textPrimary,
      cursor: 'pointer',
    },
    indexInfo: {
      marginLeft: 'auto',
      fontSize: 12,
      color: theme.textSecondary,
    },
    list: {
      flex: 1,
      overflow: 'auto',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
    },
    row: (active) => ({
      display: 'grid',
      gridTemplateColumns: '40px 1fr 1fr',
      alignItems: 'center',
      padding: '8px 10px',
      gap: 10,
      borderBottom: `1px solid ${theme.border}`,
      background: active ? 'rgba(97,218,251,0.08)' : 'transparent',
      cursor: 'pointer',
    }),
    cellMuted: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    cell: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: 600,
    },
    empty: {
      textAlign: 'center',
      color: theme.textSecondary,
      padding: '24px 8px',
      fontSize: 13,
    },
  }), []);

  const handlePrev = () => setIndex((i) => Math.max(-1, i - 1));
  const handleNext = () => setIndex((i) => Math.min(moves.length - 1, i + 1));
  const handleTogglePlay = () => setPlaying((v) => !v);
  const handleClear = () => {
    setPlaying(false);
    setIndex(-1);
    onClearHighlights();
  };

  return (
    <div className="qc-move-history-root" style={styles.root}>
      <div className="qc-move-history-toolbar" style={styles.toolbar}>
        <button type="button" aria-label="Previous move" className="qc-move-history-prev" style={styles.ctrlBtn} onClick={handlePrev}>
          <SkipBackIcon size={16} />
        </button>
        <button type="button" aria-label="Play/Pause" className="qc-move-history-play" style={styles.ctrlBtn} onClick={handleTogglePlay}>
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>
        <button type="button" aria-label="Next move" className="qc-move-history-next" style={styles.ctrlBtn} onClick={handleNext}>
          <SkipForwardIcon size={16} />
        </button>
        <button type="button" aria-label="Clear highlights" className="qc-move-history-clear" style={styles.ctrlBtn} onClick={handleClear}>
          <XCircleIcon size={16} />
        </button>
        <div className="qc-move-history-index" style={styles.indexInfo}>
          {moves.length > 0 ? `Move ${index + 1} / ${moves.length}` : 'No moves yet'}
        </div>
      </div>

      <div className="qc-move-history-list" style={styles.list} role="list">
        {moves.length === 0 ? (
          <div className="qc-move-history-empty" style={styles.empty}>No moves yet. Make a move to populate the history.</div>
        ) : (
          moves.map((m, i) => (
            <div
              key={`${i}-${m.from}-${m.to}`}
              className="qc-move-history-row"
              style={styles.row(i === index)}
              role="listitem"
              onClick={() => setIndex(i)}
            >
              <div className="qc-move-history-num" style={styles.cellMuted}>{i + 1}</div>
              <div className="qc-move-history-from" style={styles.cell}>{m.from}</div>
              <div className="qc-move-history-to" style={styles.cell}>{m.to}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
