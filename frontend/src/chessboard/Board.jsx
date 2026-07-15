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
import { arrowGeometry } from './arrowGeometry.js';
import { DEFAULT_INDICATORS } from '../settings/useIndicatorSettings.js';
import { listCheckThreats } from './quantumEngine.js';
import { buildContactParticles } from './contactParticles.js';

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
  zapMarks = [], // contact variant: squares zapped by the last move (red spin-out circle)
  healMarks = [], // contact variant: squares healed by the last move (green bloom circle)
  fizzleMarks = [], // contact variant: census-locked zap targets (shield pop, nothing shed)
  pulseOrigin = null, // contact variant: the mover's landing square — particles fly from here to each mark
  effectKey = 0, // bumps per move so zap/heal animations replay on repeat squares
  attractSquare = null, // square whose piece breathes light, inviting a first pickup
  arrows = [], // suggestion arrows: [{ from, to, opacity }] — fat translucent green, layered by opacity
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
  // (<= 2 type) attackers project real threats. Each threat is drawn as a
  // ray from the checker to the checked king-holder. (The pulsing red
  // target ring is retired, 2026-07-13 — arrows only.)
  const checkThreats = useMemo(() => {
    if (!indicators.checkGlow) return [];
    return listCheckThreats(pieces);
  }, [pieces, indicators.checkGlow]);

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
    zapCircle: {
      position: 'absolute',
      inset: '10%',
      border: '3px dashed rgba(255, 64, 64, 0.95)',
      borderRadius: '50%',
      boxShadow: '0 0 12px rgba(255, 64, 64, 0.6), inset 0 0 10px rgba(255, 64, 64, 0.35)',
      pointerEvents: 'none',
      zIndex: 8,
      boxSizing: 'border-box',
    },
    healCircle: {
      position: 'absolute',
      inset: '10%',
      border: '3px solid rgba(46, 204, 113, 0.9)',
      borderRadius: '50%',
      boxShadow: '0 0 12px rgba(46, 204, 113, 0.55), inset 0 0 10px rgba(46, 204, 113, 0.3)',
      pointerEvents: 'none',
      zIndex: 8,
      boxSizing: 'border-box',
    },
    fizzleShield: {
      position: 'absolute',
      inset: '18%',
      pointerEvents: 'none',
      zIndex: 9,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      filter: 'drop-shadow(0 0 8px rgba(170, 190, 220, 0.75))',
    },
    particleLayer: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: 9,
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

  // Contact-pulse particles: a few soft motes per contacted square, flying
  // from the mover's landing square outward — red to zaps, green to heals,
  // steel to census-locked shields. Purely decorative; deterministic jitter.
  const pulseParticles = useMemo(() => {
    if (!pulseOrigin || !dimensions.cell) return [];
    return buildContactParticles({
      originSquare: pulseOrigin,
      centerOf: squareCenterPx,
      effectKey,
      groups: [
      { squares: zapMarks, cls: 'qc-particle--zap' },
      { squares: healMarks, cls: 'qc-particle--heal' },
      { squares: fizzleMarks, cls: 'qc-particle--fizzle' },
      ],
    });
  }, [pulseOrigin, zapMarks, healMarks, fizzleMarks, squareCenterPx, dimensions.cell, effectKey]);

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


              {zapMarks.includes(squareAlg) ? (
                <div
                  key={`zap-${squareAlg}-${effectKey}`}
                  className="qc-zap-circle"
                  style={styles.zapCircle}
                  aria-hidden="true"
                />
              ) : null}

              {healMarks.includes(squareAlg) ? (
                <div
                  key={`heal-${squareAlg}-${effectKey}`}
                  className="qc-heal-circle"
                  style={styles.healCircle}
                  aria-hidden="true"
                />
              ) : null}

              {fizzleMarks.includes(squareAlg) ? (
                <div
                  key={`fizzle-${squareAlg}-${effectKey}`}
                  className="qc-fizzle-shield"
                  style={styles.fizzleShield}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" width="100%" height="100%">
                    <path
                      d="M12 2 L20 5 V11 C20 16.5 16.7 20.6 12 22 C7.3 20.6 4 16.5 4 11 V5 Z"
                      fill="rgba(170, 190, 220, 0.28)"
                      stroke="rgba(200, 215, 235, 0.95)"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8.2 11.2 L15.8 11.2"
                      stroke="rgba(200, 215, 235, 0.95)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              ) : null}

              {piece && !isDraggingThis ? (
                <QuantumPiece
                  id={piece.id}
                  side={piece.side}
                  possibleTypes={piece.possibleTypes}
                  promoted={Boolean(piece.wasPromoted)}
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
              // Emanate from the edge of the attacker's square; stop the tip
              // just outside the target ring, with the shaft ending at the
              // arrowhead's base.
              const { x1, y1, baseX, baseY, headPoints } = arrowGeometry(from, to, cell);
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
          </svg>
        ) : null}

        {/* Suggestion arrows: fat translucent green, best-first layering */}
        {arrows.length > 0 ? (
          <svg
            className="qc-hint-arrows"
            style={styles.checkOverlay}
            viewBox={`0 0 ${dimensions.width || 0} ${dimensions.height || 0}`}
            aria-hidden="true"
          >
            {[...arrows].reverse().map((a, i) => {
              const from = squareCenterPx(a.from);
              const to = squareCenterPx(a.to);
              if (!from || !to) return null;
              const cell = dimensions.cell || 0;
              // Fatter, shorter-nosed proportions than the check rays.
              const { x1, y1, baseX, baseY, headPoints } = arrowGeometry(from, to, cell, {
                tipInset: 0.22, startInset: 0.34, headLen: 0.3, headHalf: 0.19,
                minStartInset: 0.08, minHeadLen: 0.14, headGap: 0.05,
              });
              const op = a.opacity ?? 0.5;
              const w = Math.max(5, cell * 0.17);
              return (
                <g key={`hint-arrow-${a.from}-${a.to}-${i}`} opacity={op}>
                  <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke="#2ea043" strokeWidth={w} strokeLinecap="round" />
                  <polygon points={headPoints} fill="#2ea043" strokeLinejoin="round" />
                </g>
              );
            })}
          </svg>
        ) : null}

        {/* Contact-pulse particles: mover -> contacted squares */}
        {pulseParticles.length > 0 ? (
          <div className="qc-pulse-particle-layer" style={styles.particleLayer} aria-hidden="true">
            {pulseParticles.map((pt) => (
              <span
                key={pt.key}
                className={`qc-pulse-particle ${pt.cls}`}
                style={{
                  left: pt.x0,
                  top: pt.y0,
                  ['--qc-tx']: `${pt.tx}px`,
                  ['--qc-ty']: `${pt.ty}px`,
                  animationDelay: `${pt.delay}ms`,
                  animationDuration: `${pt.dur}ms`,
                }}
              />
            ))}
          </div>
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
                promoted={Boolean(draggingPiece.wasPromoted)}
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
