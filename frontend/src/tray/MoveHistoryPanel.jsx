// frontend/src/tray/MoveHistoryPanel.jsx
// Purpose: Displays the move list in two columns (White, Black) and provides playback/highlighting for individual half-moves.
// Imports From: ../theme.js, ../store/index.js (via useSelector), ../components/IconButton.jsx
// Exported To: ./SideTray.jsx

import React, { useEffect, useMemo, useState } from 'react';
import theme from '../theme.js';
import { useSelector } from 'react-redux';
import {
  Play as PlayIcon,
  Pause as PauseIcon,
  SkipBack as SkipBackIcon,
  SkipForward as SkipForwardIcon,
  XCircle as XCircleIcon,
} from 'lucide-react';
import IconButton from '../components/IconButton.jsx';

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

  const pairs = useMemo(() => {
    const out = [];
    for (let i = 0; i < moves.length; i += 2) {
      out.push({ white: moves[i] || null, black: moves[i + 1] || null });
    }
    return out;
  }, [moves]);

  const styles = useMemo(
    () => ({
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
        display: 'flex',
        flexDirection: 'column',
      },
      headerRow: {
        position: 'sticky',
        top: 0,
        zIndex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.06)',
        borderBottom: `1px solid ${theme.border}`,
      },
      headerCell: {
        color: theme.textSecondary,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      },
      row: (active) => ({
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        alignItems: 'stretch',
        padding: '0px 10px',
        gap: 10,
        borderBottom: `1px solid ${theme.border}`,
        background: active ? 'rgba(97,218,251,0.08)' : 'transparent',
      }),
      cell: (isActive, interactive) => ({
        color: theme.textPrimary,
        fontSize: 14,
        fontWeight: 600,
        padding: '8px 0',
        borderRadius: 6,
        background: isActive ? 'rgba(97,218,251,0.10)' : 'transparent',
        transition: 'background 120ms ease',
        cursor: interactive ? 'pointer' : 'default',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
      }),
      cellTextMuted: {
        color: theme.textSecondary,
        fontSize: 13,
        fontWeight: 500,
      },
      empty: {
        textAlign: 'center',
        color: theme.textSecondary,
        padding: '24px 8px',
        fontSize: 13,
      },
    }),
    []
  );

  const handlePrev = () => setIndex((i) => Math.max(-1, i - 1));
  const handleNext = () => setIndex((i) => Math.min(moves.length - 1, i + 1));
  const handleTogglePlay = () => setPlaying((v) => !v);
  const handleClear = () => {
    setPlaying(false);
    setIndex(-1);
    onClearHighlights();
  };

  const isRowActive = (rowIdx) => index === rowIdx * 2 || index === rowIdx * 2 + 1;
  const isWhiteActive = (rowIdx) => index === rowIdx * 2;
  const isBlackActive = (rowIdx) => index === rowIdx * 2 + 1;

  const formatMove = (m) => (m ? `${m.from} → ${m.to}` : '');

  return (
    <div className="qc-move-history-root" style={styles.root}>
      <div className="qc-move-history-toolbar" style={styles.toolbar}>
        <IconButton
          icon={SkipBackIcon}
          size={16}
          width={36}
          height={36}
          title="Previous move"
          ariaLabel="Previous move"
          className="qc-move-history-prev"
          onClick={handlePrev}
          bg={theme.secondary}
          color={theme.primary}
          hoverInvert={true}
        />
        <IconButton
          icon={playing ? PauseIcon : PlayIcon}
          size={16}
          width={36}
          height={36}
          title={playing ? 'Pause' : 'Play'}
          ariaLabel="Play or pause move playback"
          className="qc-move-history-play"
          onClick={handleTogglePlay}
          bg={theme.secondary}
          color={theme.primary}
          hoverInvert={true}
        />
        <IconButton
          icon={SkipForwardIcon}
          size={16}
          width={36}
          height={36}
          title="Next move"
          ariaLabel="Next move"
          className="qc-move-history-next"
          onClick={handleNext}
          bg={theme.secondary}
          color={theme.primary}
          hoverInvert={true}
        />
        <IconButton
          icon={XCircleIcon}
          size={16}
          width={36}
          height={36}
          title="Clear highlights"
          ariaLabel="Clear highlights"
          className="qc-move-history-clear"
          onClick={handleClear}
          bg={theme.secondary}
          color={theme.primary}
          hoverInvert={true}
        />
        <div className="qc-move-history-index" style={styles.indexInfo}>
          {moves.length > 0 ? `Move ${index + 1} / ${moves.length}` : 'No moves yet'}
        </div>
      </div>

      <div className="qc-move-history-list" style={styles.list} role="list">
        {moves.length === 0 ? (
          <div className="qc-move-history-empty" style={styles.empty}>No moves yet. Make a move to populate the history.</div>
        ) : (
          <>
            <div className="qc-move-history-header-row" style={styles.headerRow} role="rowheader">
              <div className="qc-move-history-header-white" style={styles.headerCell}>White</div>
              <div className="qc-move-history-header-black" style={styles.headerCell}>Black</div>
            </div>
            {pairs.map((pair, rowIdx) => (
              <div
                key={`row-${rowIdx}`}
                className="qc-move-history-row"
                style={styles.row(isRowActive(rowIdx))}
                role="listitem"
              >
                <div
                  className="qc-move-history-cell-white"
                  style={styles.cell(isWhiteActive(rowIdx), !!pair.white)}
                  onClick={pair.white ? () => setIndex(rowIdx * 2) : undefined}
                  aria-label={pair.white ? `White move ${formatMove(pair.white)}` : 'No move'}
                >
                  {pair.white ? (
                    <span className="qc-move-history-cell-text">{formatMove(pair.white)}</span>
                  ) : (
                    <span className="qc-move-history-cell-text-muted" style={styles.cellTextMuted}>—</span>
                  )}
                </div>
                <div
                  className="qc-move-history-cell-black"
                  style={styles.cell(isBlackActive(rowIdx), !!pair.black)}
                  onClick={pair.black ? () => setIndex(rowIdx * 2 + 1) : undefined}
                  aria-label={pair.black ? `Black move ${formatMove(pair.black)}` : 'No move'}
                >
                  {pair.black ? (
                    <span className="qc-move-history-cell-text">{formatMove(pair.black)}</span>
                  ) : (
                    <span className="qc-move-history-cell-text-muted" style={styles.cellTextMuted}>—</span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
