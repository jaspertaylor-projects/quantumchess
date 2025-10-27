// frontend/src/chessboard/Board.jsx
// Purpose: Responsive, accessible chessboard with click and drag-and-drop interactions, coordinate labels, highlights, and piece rendering; reports the rendered surface size to parent via onResize.
// Imports From: ./useBoardInteractions.js, ./boardUtils.js, ../theme.js, ./QuantumPiece.jsx
// Exported To: frontend/src/App.jsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import useBoardInteractions from './useBoardInteractions.js';
import {
  isDarkSquare,
  fileLabelForColumn,
  rankLabelForRow,
  toAlgebraic,
  fromBoardIndex,
} from './boardUtils.js';
import theme from '../theme.js';
import QuantumPiece from './QuantumPiece.jsx';

export default function Board({
  orientation = 'white',
  onSquareClick,
  onSquareRightClick,
  onPieceClick,
  onPieceDragStart, // (piece) => boolean | void, return false to cancel drag
  onPieceDrop, // ({ id, from, to }) => void
  onDragHover, // ({ id, from, over }) => void
  showCoordinates = true,
  highlights = [], // [{ square: 'e4', color: 'rgba(255,255,0,0.4)' }]
  pieces = [], // [{ id, side, square, possibleTypes }]
  selectedId = null,
  legalMoves = [], // legal moves for the currently-selected piece id
  squareColors = { light: '#f0d9b5', dark: '#b58863' },
  borderColor = theme.border,
  borderRadius = 12,
  shadow = theme.shadow,
  maxVisualSize = 'min(90vmin, 800px)',
  ariaLabel = 'Chessboard',
  pieceSvgStyles = { white: {}, black: {} },
  onResize = () => {},
}) {
  const { surfaceRef, dimensions, eventToSquare } = useBoardInteractions({ orientation });
  const overlayRef = useRef(null);

  const [dragState, setDragState] = useState(null);
  // dragState: { id, fromSquare, pointerId, localX, localY, currentSquare, piece }

  const legalSet = useMemo(() => {
    return new Set(Array.isArray(legalMoves) ? legalMoves : []);
  }, [legalMoves]);

  useEffect(() => {
    if (typeof onResize === 'function' && dimensions && dimensions.height > 0) {
      onResize(dimensions.height);
    }
  }, [dimensions.height, onResize]);

  const highlightMap = useMemo(() => {
    const map = new Map();
    for (const h of highlights) {
      if (!h || !h.square) continue;
      map.set(h.square, h.color || 'rgba(255, 255, 0, 0.35)');
    }
    return map;
  }, [highlights]);

  const pieceBySquare = useMemo(() => {
    const map = new Map();
    for (const p of pieces) {
      if (!p || p.captured || !p.square) continue;
      map.set(p.square, p);
    }
    return map;
  }, [pieces]);

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
      cursor: dragState ? 'grabbing' : 'pointer',
      height: '100%',
      width: '100%',
      touchAction: 'none',
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
    dragTargetOverlay: {
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(97, 218, 251, 0.28)',
      border: '2px dashed rgba(97,218,251,0.55)',
      borderRadius: 2,
      pointerEvents: 'none',
    },
    floatingLayer: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
    },
    floatingPiece: (x, y, size) => ({
      position: 'absolute',
      left: Math.max(0, Math.min((dimensions.width || 0) - size, x - size / 2)),
      top: Math.max(0, Math.min((dimensions.height || 0) - size, y - size / 2)),
      width: size,
      height: size,
      pointerEvents: 'none',
      zIndex: 10,
      filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.3))',
    }),
  };

  const getLocalXY = useCallback((clientX, clientY) => {
    const el = surfaceRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x, y };
  }, [surfaceRef]);

  const defer = (fn) => {
    if (typeof fn !== 'function') return;
    // Defer to avoid parent state updates during child render phase
    setTimeout(fn, 0);
  };

  const handleClick = (e) => {
    if (dragState) return; // ignore clicks while dragging
    if (!onSquareClick) return;
    const data = eventToSquare(e);
    if (data && data.square) defer(() => onSquareClick(data));
  };

  const handleContextMenu = (e) => {
    if (dragState) return;
    if (!onSquareRightClick) return;
    e.preventDefault();
    const data = eventToSquare(e);
    if (data && data.square) defer(() => onSquareRightClick(data));
  };

  // Global pointer move/up handlers during drag
  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e) => {
      const ev = e; // PointerEvent
      const data = eventToSquare(ev);
      const { x, y } = getLocalXY(ev.clientX, ev.clientY);
      const overSquare = data && data.square ? data.square : null;
      setDragState((s) => (s ? { ...s, localX: x, localY: y, currentSquare: overSquare } : s));
      if (onDragHover && dragState) {
        defer(() => onDragHover({ id: dragState.id, from: dragState.fromSquare, over: overSquare }));
      }
    };

    const handleUp = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragState((s) => {
        const finalSquare = s && s.currentSquare ? s.currentSquare : null;
        if (s && onPieceDrop) {
          const payload = finalSquare
            ? { id: s.id, from: s.fromSquare, to: finalSquare }
            : { id: s.id, from: s.fromSquare, to: null };
          defer(() => onPieceDrop(payload));
        }
        return null;
      });
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp, { passive: false });
    window.addEventListener('pointercancel', handleUp, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragState, eventToSquare, getLocalXY, onPieceDrop, onDragHover, legalSet]);

  const onPiecePointerDown = useCallback((piece, e) => {
    if (!surfaceRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const start = eventToSquare(e);
    const fromSquare = start && start.square ? start.square : piece.square;

    let allow = true;
    if (typeof onPieceDragStart === 'function') {
      const result = onPieceDragStart(piece) ?? true;
      allow = Boolean(result);
    }
    if (!allow) return;

    const { x, y } = getLocalXY(e.clientX, e.clientY);
    setDragState({
      id: piece.id,
      fromSquare,
      pointerId: e.pointerId,
      localX: x,
      localY: y,
      currentSquare: fromSquare,
      piece,
    });
  }, [surfaceRef, eventToSquare, getLocalXY, onPieceDragStart]);

  const squares = useMemo(() => new Array(64).fill(0).map((_, i) => i), []);
  const pieceSize = Math.max(8, Math.floor(dimensions.cell || 0));

  const draggingPiece = dragState ? dragState.piece : null;
  const dragTargetSquare = dragState ? dragState.currentSquare : null;

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
          const row = Math.floor(idx / 8);
          const col = idx % 8;

          const isBottomEdge = row === 7;
          const isLeftEdge = col === 0;

          const squareAlgWhite = toAlgebraic(col, 7 - row);
          const squareAlgBlack = toAlgebraic(7 - col, row);
          const squareAlg = orientation === 'black' ? squareAlgBlack : squareAlgWhite;

          const highlightColor = squareAlg ? highlightMap.get(squareAlg) : undefined;

          const piece = pieceBySquare.get(squareAlg);
          const isDraggingThis = draggingPiece && piece && draggingPiece.id === piece.id;
          const shouldRotate = piece ? (piece.side !== orientation && piece.possibleTypes.length > 2) : false;

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

              {dragTargetSquare && squareAlg === dragTargetSquare ? (
                <div className="chessboard-square-drag-target" style={styles.dragTargetOverlay} />
              ) : null}

              {piece && !isDraggingThis ? (
                <QuantumPiece
                  id={piece.id}
                  side={piece.side}
                  possibleTypes={piece.possibleTypes}
                  size={pieceSize}
                  isSelected={selectedId === piece.id}
                  onClick={onPieceClick}
                  onPointerDown={(evt) => onPiecePointerDown(piece, evt)}
                  ariaLabel={`Piece at ${squareAlg}`}
                  svgStyleBySide={pieceSvgStyles}
                  rotate180={shouldRotate}
                />
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

        {/* Floating drag preview */}
        {draggingPiece ? (
          <div className="chessboard-floating-layer" ref={overlayRef} style={styles.floatingLayer} aria-hidden="true">
            <div
              className="chessboard-floating-piece"
              style={styles.floatingPiece(dragState.localX || 0, dragState.localY || 0, pieceSize)}
            >
              <QuantumPiece
                id={draggingPiece.id}
                side={draggingPiece.side}
                possibleTypes={draggingPiece.possibleTypes}
                size={pieceSize}
                isSelected={true}
                onClick={null}
                onPointerDown={null}
                ariaLabel={`Dragging piece from ${dragState.fromSquare}`}
                svgStyleBySide={pieceSvgStyles}
                rotate180={draggingPiece.side !== orientation && draggingPiece.possibleTypes.length > 2}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
