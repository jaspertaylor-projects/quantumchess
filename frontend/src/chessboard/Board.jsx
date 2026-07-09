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
import { hexToRgbString } from '../settings/useMeasurementColors.js';
import { DEFAULT_INDICATORS } from '../settings/useIndicatorSettings.js';
import { listCheckThreats, canPieceRecohere } from './quantumEngine.js';

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
  measureTargetMarks = [], // [{ square, rgb }] persistent targets, one per side
  attractSquare = null, // square whose piece breathes light, inviting a first pickup
  guideSquare = null, // destination of a choreographed move: a pulsing gold target
  indicators = DEFAULT_INDICATORS, // visibility toggles for the visual reminders
  legalMoves = [], // legal moves for the currently-selected piece id
  squareColors = { light: theme.boardLight, dark: theme.boardDark },
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

  // Active checks, using the game's own threat rule: only nearly-defined
  // (<= 2 type) attackers project real threats, mirroring end-of-turn king
  // pruning. Each threat is drawn as a ray from the checker to the checked
  // king-holder, which gets a pulsing ring.
  const checkThreats = useMemo(() => {
    if (!indicators.checkGlow && !indicators.checkRing) return [];
    return listCheckThreats(pieces);
  }, [pieces, indicators.checkGlow, indicators.checkRing]);

  // Sealed pieces: nearly-defined pieces that can never regain a possibility
  // (conservation has settled every question). Their recoherence clock would
  // cycle forever, so QuantumPiece draws a solid line instead of the dots.
  const sealedIds = useMemo(() => {
    if (!indicators.recohere) return new Set();
    const out = new Set();
    for (const p of pieces) {
      if (p.captured || !p.square) continue;
      const len = (p.possibleTypes || []).length;
      if (len === 0 || len > 2) continue;
      if (!canPieceRecohere(pieces, p.id)) out.add(p.id);
    }
    return out;
  }, [pieces, indicators.recohere]);

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
    guideTarget: {
      position: 'absolute',
      inset: '8%',
      borderRadius: '18%',
      border: '3px solid rgba(255, 200, 80, 0.9)',
      boxShadow: '0 0 12px rgba(255, 200, 80, 0.55), inset 0 0 10px rgba(255, 200, 80, 0.35)',
      pointerEvents: 'none',
      zIndex: 5,
      boxSizing: 'border-box',
    },
    // Pieces are near-opaque tiles, so the halo lives in the bleed beyond the
    // square: a ring of light around the piece rather than a wash behind it.
    attractGlow: {
      position: 'absolute',
      inset: '-25%',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255, 224, 130, 0.95) 30%, rgba(255, 200, 80, 0.55) 55%, rgba(255, 200, 80, 0) 75%)',
      pointerEvents: 'none',
    },
    dragTargetOverlay: {
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(97, 218, 251, 0.28)',
      border: '2px dashed rgba(97,218,251,0.55)',
      borderRadius: 2,
      pointerEvents: 'none',
    },
    checkOverlay: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 7,
    },
    measureTargetRing: (rgb) => ({
      position: 'absolute',
      inset: '6%',
      border: `2.5px dashed rgba(${rgb}, 0.95)`,
      borderRadius: '50%',
      boxShadow: `0 0 10px rgba(${rgb}, 0.55), inset 0 0 8px rgba(${rgb}, 0.35)`,
      pointerEvents: 'none',
      zIndex: 6,
      boxSizing: 'border-box',
    }),
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

  // Pixel center of a square, honoring board orientation, for the check-ray
  // overlay.
  const squareCenterPx = useCallback((alg) => {
    if (!alg || alg.length < 2) return null;
    const file = alg.charCodeAt(0) - 97;
    const rank = parseInt(alg[1], 10) - 1;
    if (Number.isNaN(rank) || file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    const col = orientation === 'black' ? 7 - file : file;
    const row = orientation === 'black' ? rank : 7 - rank;
    const cell = dimensions.cell || 0;
    return { x: (col + 0.5) * cell, y: (row + 0.5) * cell };
  }, [orientation, dimensions.cell]);

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

              {attractSquare && squareAlg === attractSquare && piece ? (
                <div className="qc-attract-glow" style={styles.attractGlow} aria-hidden="true" />
              ) : null}

              {guideSquare && squareAlg === guideSquare ? (
                <div className="qc-guide-target" style={styles.guideTarget} aria-hidden="true" />
              ) : null}


              {(indicators.pulseRings ? measureTargetMarks : [])
                .filter((m) => m && m.square === squareAlg)
                .map((m, mi) => (
                  <div
                    key={`target-ring-${squareAlg}-${mi}`}
                    className="qc-measure-target-ring"
                    style={styles.measureTargetRing(m.rgb || '186, 85, 211')}
                    aria-label={`Measurement target at ${squareAlg}`}
                  />
                ))}

              {piece && !isDraggingThis ? (
                <QuantumPiece
                  id={piece.id}
                  side={piece.side}
                  possibleTypes={piece.possibleTypes}
                  coherence={piece.coherence}
                  recohere={piece.recohere}
                  promoted={Boolean(piece.wasPromoted)}
                  sealed={sealedIds.has(piece.id)}
                  indicators={indicators}
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

        {/* Check rays: checker -> checked king-holder, ring on the target */}
        {checkThreats.length > 0 ? (
          <svg
            className="qc-check-overlay"
            style={styles.checkOverlay}
            viewBox={`0 0 ${dimensions.width || 0} ${dimensions.height || 0}`}
            aria-hidden="true"
          >
            {indicators.checkGlow ? checkThreats.map((t, i) => {
              const from = squareCenterPx(t.from);
              const to = squareCenterPx(t.to);
              if (!from || !to) return null;
              const cell = dimensions.cell || 0;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              // Emanate from the edge of the attacker's square; stop the tip
              // just outside the target ring, with the shaft ending at the
              // arrowhead's base. Adjacent squares leave less room than the
              // default insets assume, so shrink the start inset (and if
              // needed the head) rather than letting the shaft run backwards.
              const tipInset = cell * 0.46;
              let startInset = cell * 0.5;
              let headLen = cell * 0.2;
              const headHalf = cell * 0.11;
              if (len - tipInset - startInset < headLen) {
                startInset = Math.max(cell * 0.1, len - tipInset - headLen - cell * 0.06);
                headLen = Math.min(headLen, Math.max(cell * 0.12, len - tipInset - startInset));
              }
              const tipX = to.x - ux * tipInset;
              const tipY = to.y - uy * tipInset;
              const baseX = tipX - ux * headLen;
              const baseY = tipY - uy * headLen;
              const x1 = from.x + ux * startInset;
              const y1 = from.y + uy * startInset;
              const px = -uy;
              const py = ux;
              const headPoints = `${tipX},${tipY} ${baseX + px * headHalf},${baseY + py * headHalf} ${baseX - px * headHalf},${baseY - py * headHalf}`;
              // Arrow wears the attacking piece's own body color (band fill),
              // with a contrast halo picked by luminance so light arrows read
              // on light squares and dark arrows on dark squares.
              const sideVars = (pieceSvgStyles && pieceSvgStyles[t.side]) || {};
              const bodyHex = sideVars['--band-fill'] || (t.side === 'white' ? '#e5e7eb' : '#254065');
              const rgb = hexToRgbString(bodyHex);
              const [rr, gg, bb] = rgb.split(',').map((n) => parseInt(n, 10));
              const halo = (0.299 * rr + 0.587 * gg + 0.114 * bb) > 150 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
              const w = Math.max(3, cell * 0.08);
              return (
                <g key={`check-ray-${t.from}-${t.to}-${i}`}>
                  <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke={halo} strokeWidth={w + 2.5} strokeLinecap="round" />
                  <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke={`rgba(${rgb}, 0.9)`} strokeWidth={w} strokeLinecap="round" />
                  <polygon points={headPoints} fill={`rgba(${rgb}, 0.95)`} stroke={halo} strokeWidth="1.4" strokeLinejoin="round" />
                </g>
              );
            }) : null}
            {indicators.checkRing ? [...new Set(checkThreats.map((t) => t.to))].map((sq) => {
              const to = squareCenterPx(sq);
              if (!to) return null;
              const cell = dimensions.cell || 0;
              return (
                <circle
                  key={`check-ring-${sq}`}
                  cx={to.x}
                  cy={to.y}
                  r={cell * 0.42}
                  fill="none"
                  stroke="rgba(255, 64, 64, 0.9)"
                  strokeWidth={Math.max(2.5, cell * 0.055)}
                >
                  <animate attributeName="opacity" values="0.95;0.35;0.95" dur="1.4s" repeatCount="indefinite" />
                </circle>
              );
            }) : null}
          </svg>
        ) : null}

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
                coherence={draggingPiece.coherence}
                recohere={draggingPiece.recohere}
                promoted={Boolean(draggingPiece.wasPromoted)}
                sealed={sealedIds.has(draggingPiece.id)}
                indicators={indicators}
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
