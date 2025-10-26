// frontend/src/chessboard/Board.jsx
// Purpose: Responsive, accessible, and square-perfect chessboard with click-to-square translation and optional coordinate labels and highlights.
// Imports From: ./useBoardInteractions.js, ./boardUtils.js, ../theme.js
// Exported To: frontend/src/App.jsx

import React, { useMemo } from 'react';
import useBoardInteractions from './useBoardInteractions.js';
import {
  isDarkSquare,
  fileLabelForColumn,
  rankLabelForRow,
  toAlgebraic,
  fromBoardIndex,
} from './boardUtils.js';
import theme from '../theme.js';

export default function Board({
  orientation = 'white',
  onSquareClick,
  onSquareRightClick,
  showCoordinates = true,
  highlights = [], // [{ square: 'e4', color: 'rgba(255,255,0,0.4)' }]
  squareColors = { light: '#f0d9b5', dark: '#b58863' },
  borderColor = theme.border,
  borderRadius = 12,
  shadow = theme.shadow,
  maxVisualSize = 'min(90vmin, 800px)',
  ariaLabel = 'Chessboard',
}) {
  const { surfaceRef, dimensions, eventToSquare } = useBoardInteractions({ orientation });

  const highlightMap = useMemo(() => {
    const map = new Map();
    for (const h of highlights) {
      if (!h || !h.square) continue;
      map.set(h.square, h.color || 'rgba(255, 255, 0, 0.35)');
    }
    return map;
  }, [highlights]);

  const styles = {
    root: {
      width: maxVisualSize,
      aspectRatio: '1 / 1',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      border: `1px solid ${borderColor}`,
      borderRadius,
      boxShadow: `0 8px 24px ${shadow}`,
      backgroundColor: theme.cardBackground,
      overflow: 'hidden',
    },
    surface: {
      position: 'absolute',
      inset: 0,
      display: 'grid',
      gridTemplateColumns: 'repeat(8, 1fr)',
      gridTemplateRows: 'repeat(8, 1fr)',
      borderRadius,
      userSelect: 'none',
      cursor: 'pointer',
      // Height fallback for older browsers without aspect-ratio support
      // The parent has aspectRatio: 1; this ensures square even if not supported
      height: '100%',
      width: '100%',
    },
    square: (row, col) => ({
      position: 'relative',
      backgroundColor: isDarkSquare(row, col) ? squareColors.dark : squareColors.light,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 0,
    }),
    coordFile: {
      position: 'absolute',
      right: 6,
      bottom: 4,
      fontSize: 11,
      color: 'rgba(0,0,0,0.65)',
      textShadow: '0 1px 1px rgba(255,255,255,0.6)',
      pointerEvents: 'none',
      fontWeight: 600,
    },
    coordRank: {
      position: 'absolute',
      left: 6,
      top: 4,
      fontSize: 11,
      color: 'rgba(0,0,0,0.65)',
      textShadow: '0 1px 1px rgba(255,255,255,0.6)',
      pointerEvents: 'none',
      fontWeight: 600,
    },
    highlight: (color) => ({
      position: 'absolute',
      inset: 0,
      backgroundColor: color,
      borderRadius: 2,
      pointerEvents: 'none',
    }),
    focusRing: {
      outline: 'none',
    },
  };

  const handleClick = (e) => {
    if (!onSquareClick) return;
    const data = eventToSquare(e);
    if (data && data.square) onSquareClick(data);
  };

  const handleContextMenu = (e) => {
    if (!onSquareRightClick) return;
    e.preventDefault();
    const data = eventToSquare(e);
    if (data && data.square) onSquareRightClick(data);
  };

  const squares = useMemo(() => new Array(64).fill(0).map((_, i) => i), []);

  return (
    <div
      className="chessboard-root"
      style={styles.root}
      role="region"
      aria-label={ariaLabel}
    >
      <div
        className="chessboard-surface"
        style={styles.surface}
        role="grid"
        aria-label={`${ariaLabel} grid`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        ref={surfaceRef}
      >
        {squares.map((idx) => {
          const { fileIndex, rankIndex } = fromBoardIndex(idx);
          const row = Math.floor(idx / 8); // 0 top -> 7 bottom
          const col = idx % 8; // 0 left -> 7 right

          // Determine coordinate labels on edges relative to orientation
          const isBottomEdge = row === 7;
          const isLeftEdge = col === 0;

          const squareAlgWhite = toAlgebraic(col, 7 - row);
          const squareAlgBlack = toAlgebraic(7 - col, row);
          const squareAlg = orientation === 'black' ? squareAlgBlack : squareAlgWhite;

          const highlightColor = squareAlg ? highlightMap.get(squareAlg) : undefined;

          return (
            <div
              key={idx}
              className="chessboard-square"
              role="gridcell"
              aria-label={`Square ${squareAlg}`}
              style={styles.square(row, col)}
              tabIndex={-1}
            >
              {highlightColor ? (
                <div className="chessboard-square-highlight" style={styles.highlight(highlightColor)} />
              ) : null}

              {showCoordinates && isBottomEdge ? (
                <span className="chessboard-square-file" style={styles.coordFile}>
                  {fileLabelForColumn(col, orientation)}
                </span>
              ) : null}

              {showCoordinates && isLeftEdge ? (
                <span className="chessboard-square-rank" style={styles.coordRank}>
                  {rankLabelForRow(row, orientation)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
