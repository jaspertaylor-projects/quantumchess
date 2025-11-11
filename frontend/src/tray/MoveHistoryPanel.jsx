// frontend/src/tray/MoveHistoryPanel.jsx
// Purpose: Displays the move list with responsive toolbar; avoids horizontal scrolling by wrapping controls and clamping text.
// Imports From: ../theme.js, ../store/index.js, ../components/IconButton.jsx, ../Styles/scrollbar.css
// Exported To: ./SideTray.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import '../Styles/scrollbar.css';

export default function MoveHistoryPanel({ infoMessage = '', onHighlightMove = () => {}, onClearHighlights = () => {}, onSeekToIndex = () => {}, externalIndex = undefined }) {
  const moves = useSelector((s) => s.game.moves);

  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);

  const highlightRef = useRef(onHighlightMove);
  const clearRef = useRef(onClearHighlights);
  const seekRef = useRef(onSeekToIndex);
  const suppressSeekRef = useRef(false);

  useEffect(() => {
    highlightRef.current = onHighlightMove;
  }, [onHighlightMove]);
  useEffect(() => {
    clearRef.current = onClearHighlights;
  }, [onClearHighlights]);
  useEffect(() => {
    seekRef.current = onSeekToIndex;
  }, [onSeekToIndex]);

  const setIndexAndSeek = (nextIdx) => {
    const clamped = Math.max(-1, Math.min(moves.length - 1, nextIdx));
    suppressSeekRef.current = true;
    setIndex(clamped);
    seekRef.current(clamped);
  };

  useEffect(() => {
    if (typeof externalIndex !== 'number') return;
    const clamped = Math.max(-1, Math.min(moves.length - 1, externalIndex));
    if (clamped !== index) {
      suppressSeekRef.current = true;
      setPlaying(false);
      setIndex(clamped);
    }
  }, [externalIndex, moves.length, index]);

  useEffect(() => {
    if (index >= 0 && index < moves.length) {
      const m = moves[index];
      highlightRef.current([
        { square: m.from, color: 'rgba(97, 218, 251, 0.35)' },
        { square: m.to, color: 'rgba(255, 206, 84, 0.4)' },
      ]);
    } else {
      clearRef.current();
    }
  }, [index, moves]);

  useEffect(() => {
    if (suppressSeekRef.current) {
      suppressSeekRef.current = false;
      return;
    }
    seekRef.current(index);
  }, [index]);

  useEffect(() => {
    if (!playing) return;
    if (moves.length === 0) return;
    const id = setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        const nextCycled = next >= moves.length ? 0 : next;
        setIndexAndSeek(nextCycled);
        return nextCycled;
      });
    }, 900);
    return () => clearInterval(id);
  }, [playing, moves.length]);

  useEffect(() => {
    if (typeof externalIndex === 'number') return;
    suppressSeekRef.current = true;
    setIndex(moves.length - 1);
  }, [moves.length, externalIndex]);

  const pairs = useMemo(() => {
    const out = [];
    let current = null;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const side = m && (m.side === 'white' || m.side === 'black') ? m.side : i % 2 === 0 ? 'white' : 'black';
      if (side === 'white') {
        if (!current || current.white !== null || current.black !== null) {
          current = { white: null, black: null, whiteIndex: null, blackIndex: null };
          out.push(current);
        }
        current.white = m;
        current.whiteIndex = i;
      } else {
        if (!current || (current.white === null && current.black === null)) {
          current = { white: null, black: null, whiteIndex: null, blackIndex: null };
          out.push(current);
        }
        if (current.black === null) {
          current.black = m;
          current.blackIndex = i;
        } else {
          current = { white: null, black: null, whiteIndex: null, blackIndex: null };
          out.push(current);
          current.black = m;
          current.blackIndex = i;
        }
      }
    }
    return out;
  }, [moves]);

  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.width = '100px';
    probe.style.height = '100px';
    probe.style.overflow = 'scroll';
    probe.style.position = 'absolute';
    probe.style.top = '-9999px';
    document.body.appendChild(probe);
    const w = probe.offsetWidth - probe.clientWidth;
    document.body.removeChild(probe);
    setScrollbarWidth(w || 0);
  }, []);

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
        overflowX: 'hidden',
      },
      toolbar: {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        rowGap: 8,
        columnGap: 8,
        borderRadius: 10,
        padding: 8,
        background: 'rgba(255,255,255,0.03)',
        overflow: 'hidden',
      },
      indexInfo: {
        marginLeft: 'auto',
        fontSize: 12,
        color: theme.textSecondary,
        minWidth: 0,
        flexShrink: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      listContainer: {
        flex: 1,
        position: 'relative',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      },
      headerRow: {
        zIndex: 3,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        padding: '8px 10px',
        paddingRight: 10 + scrollbarWidth,
        background: theme.boardAreaBackground ? theme.boardAreaBackground : 'var(--color-globalBackground)',
        borderBottom: `1px solid ${theme.border}`,
        boxShadow: `0 1px 0 0 ${theme.border}`,
        flexShrink: 0,
      },
      headerCell: {
        color: theme.textSecondary,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      },
      rowsScroll: {
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        scrollbarGutter: 'stable',
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
        padding: '8px 10px',
        borderRadius: 6,
        background: isActive ? 'rgba(97,218,251,0.12)' : 'transparent',
        transition: 'background 120ms ease',
        cursor: interactive ? 'pointer' : 'default',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        width: '100%',
        boxSizing: 'border-box',
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
      infoBox: {
        padding: '10px 12px',
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        background: 'rgba(255, 206, 84, 0.1)',
        color: 'rgba(255, 206, 84, 0.9)',
        fontSize: 13,
        fontWeight: 500,
        textAlign: 'center',
        flexShrink: 0,
      },
    }),
    [scrollbarWidth]
  );

  const handlePrev = () => {
    const next = Math.max(-1, index - 1);
    setIndexAndSeek(next);
  };
  const handleNext = () => {
    const next = Math.min(moves.length - 1, index + 1);
    setIndexAndSeek(next);
  };
  const handleTogglePlay = () => setPlaying((v) => !v);
  const handleClear = () => {
    setPlaying(false);
    setIndexAndSeek(-1);
    clearRef.current();
  };

  const isRowActive = (rowIdx) => {
    const row = pairs[rowIdx];
    if (!row) return false;
    return index === row.whiteIndex || index === row.blackIndex;
  };
  const isWhiteActive = (rowIdx) => {
    const row = pairs[rowIdx];
    if (!row) return false;
    return index === row.whiteIndex;
  };
  const isBlackActive = (rowIdx) => {
    const row = pairs[rowIdx];
    if (!row) return false;
    return index === row.blackIndex;
  };

  const formatMove = (m) => (m ? `${m.from} - ${m.to}` : '');

  const listRef = useRef(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let timeoutId = null;
    const onScroll = () => {
      el.classList.add('scrolling');
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        el.classList.remove('scrolling');
      }, 500);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

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

      <div className="qc-move-history-list-container" style={styles.listContainer}>
        <div className="qc-move-history-header-row" style={styles.headerRow} role="rowheader">
          <div className="qc-move-history-header-white" style={styles.headerCell}>White</div>
          <div className="qc-move-history-header-black" style={styles.headerCell}>Black</div>
        </div>

        <div ref={listRef} className="qc-move-history-rows custom-scrollbar" style={styles.rowsScroll} role="list">
          {moves.length === 0 ? (
            <div className="qc-move-history-empty" style={styles.empty}>No moves yet. Make a move to populate the history.</div>
          ) : (
            pairs.map((pair, rowIdx) => (
              <div
                key={`row-${rowIdx}`}
                className="qc-move-history-row"
                style={styles.row(isRowActive(rowIdx))}
                role="listitem"
              >
                <div
                  className="qc-move-history-cell-white"
                  style={styles.cell(isWhiteActive(rowIdx), !!pair.white)}
                  onClick={pair.white ? () => setIndexAndSeek(pair.whiteIndex) : undefined}
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
                  onClick={pair.black ? () => setIndexAndSeek(pair.blackIndex) : undefined}
                  aria-label={pair.black ? `Black move ${formatMove(pair.black)}` : 'No move'}
                >
                  {pair.black ? (
                    <span className="qc-move-history-cell-text">{formatMove(pair.black)}</span>
                  ) : (
                    <span className="qc-move-history-cell-text-muted" style={styles.cellTextMuted}>—</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {infoMessage && (
        <div className="qc-move-history-infobox" style={styles.infoBox}>
          {infoMessage}
        </div>
      )}
    </div>
  );
}
