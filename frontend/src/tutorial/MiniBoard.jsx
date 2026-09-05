// frontend/src/tutorial/MiniBoard.jsx
// Purpose: Small static board diagrams for the tutorial, rendered with the
// REAL QuantumPiece art (trapezoid-band composites and indicators) so the
// tutorial teaches exactly what the board shows. Adds arrows, contact
// effects, pulse marks, and square highlights on top. Optionally interactive: click
// squares, and (when canDrag/onDrop are provided) drag pieces to move them.
// Imports From: ../chessboard/QuantumPiece.jsx, ../settings/usePieceColors.js,
//   ../theme.js
// Exported To: ../puzzle/DailyPuzzleModal.jsx,
//   ../puzzle/MinedPuzzleModal.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QuantumPiece from '../chessboard/QuantumPiece.jsx';
import { arrowGeometry } from '../chessboard/arrowGeometry.js';
import { DEFAULT_WHITE, DEFAULT_BLACK } from '../settings/usePieceColors.js';
import theme from '../theme.js';
import {
  buildContactParticles,
  CONTACT_PARTICLE_MAX_ARRIVAL_MS,
} from '../chessboard/contactParticles.js';

const LIGHT = theme.boardLight;
const DARK = theme.boardDark;

const DEFAULT_SVG_STYLES = {
  white: { '--band-fill': DEFAULT_WHITE.bandFill, '--band-stroke': DEFAULT_WHITE.bandStroke, '--piece-outline': DEFAULT_WHITE.pieceOutlineEnabled ? DEFAULT_WHITE.pieceOutline : 'transparent', '--icon-color': DEFAULT_WHITE.icon },
  black: { '--band-fill': DEFAULT_BLACK.bandFill, '--band-stroke': DEFAULT_BLACK.bandStroke, '--piece-outline': DEFAULT_BLACK.pieceOutlineEnabled ? DEFAULT_BLACK.pieceOutline : 'transparent', '--icon-color': DEFAULT_BLACK.icon },
};

function sqToRC(sq, ranks) {
  const col = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq.slice(1), 10) - 1;
  return { col, row: ranks - 1 - rank };
}

export default function MiniBoard({
  files = 6,
  ranks = 6,
  cell = 48,
  pieces = [], // { sq, side, types, chevrons, mark, zap, heal, healFail, shield }
  arrows = [], // { from, to, side } or review-style { from, to, kind: 'hint', opacity }
  highlights = [], // squares tinted amber
  targets = [], // squares showing a legal-move dot
  onSquareClick = null, // enables interaction: called with the algebraic square
  canDrag = null, // (alg) => boolean; with onDrop, enables piece dragging
  onDragStart = null, // (alg) => void, when a drag begins (e.g. select the piece)
  onDrop = null, // (from, to) => void, when a dragged piece lands on another square
  svgStyleBySide = null, // live piece colors from the app; defaults otherwise
  squareColors = null, // { light, dark } from user settings; classic defaults otherwise
  showCoordinates = true, // puzzle board hides these to align exactly with its player bars
  effectKey = 0, // bumps per move so zap/heal animations replay on repeat squares
  pulseOrigin = null, // mover's landing square: particle motes fly from here
}) {
  const lightSq = (squareColors && squareColors.light) || LIGHT;
  const darkSq = (squareColors && squareColors.dark) || DARK;
  const boardRef = useRef(null);
  const [drag, setDrag] = useState(null); // { from, x, y, over } local px coords
  const dragRef = useRef(null);
  dragRef.current = drag;
  // Handlers live in a ref so the window-level listeners installed for the
  // duration of a drag never act on stale closures.
  const handlersRef = useRef({});
  handlersRef.current = { onDrop };
  const dragEnabled = Boolean(onDrop && canDrag);

  useEffect(() => {
    if (!drag) return undefined;
    const localPoint = (e) => {
      const el = boardRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let over = null;
      if (x >= 0 && y >= 0 && x < rect.width && y < rect.height) {
        const col = Math.floor((x / rect.width) * files);
        const row = Math.floor((y / rect.height) * ranks);
        over = `${String.fromCharCode(97 + col)}${ranks - row}`;
      }
      return { x, y, over };
    };
    const handleMove = (e) => {
      const pt = localPoint(e);
      if (!pt) return;
      setDrag((d) => (d ? { ...d, ...pt } : d));
    };
    const handleUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d && d.over && d.over !== d.from) {
        const { onDrop: drop } = handlersRef.current;
        if (drop) drop(d.from, d.over);
      }
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [Boolean(drag), files, ranks]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragPiece = drag ? pieces.find((p) => p.sq === drag.from) : null;
  const W = files * cell;
  const H = ranks * cell;
  const center = (sq) => {
    const { col, row } = sqToRC(sq, ranks);
    return { x: (col + 0.5) * cell, y: (row + 0.5) * cell };
  };

  // Contact-pulse particles (mirrors Board.jsx): soft motes fly from the
  // mover's landing square to every contacted square, arriving as the
  // circle/shield lands.
  const pulseParticles = useMemo(() => {
    if (!pulseOrigin) return [];
    return buildContactParticles({
      originSquare: pulseOrigin,
      centerOf: center,
      effectKey,
      groups: [
        { cls: 'qc-particle--zap', squares: pieces.filter((p) => p.zap).map((p) => p.sq) },
        { cls: 'qc-particle--heal', squares: pieces.filter((p) => p.heal || p.healFail).map((p) => p.sq) },
        { cls: 'qc-particle--fizzle', squares: pieces.filter((p) => p.shield).map((p) => p.sq) },
      ],
    });
  }, [pieces, pulseOrigin, cell, effectKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodyHex = (side) => (side === 'white' ? DEFAULT_WHITE.bandFill : DEFAULT_BLACK.bandFill);

  const coordStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: '0.04em',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div
      className="qc-tutorial-miniboard-frame"
      style={{
        display: 'grid',
        gridTemplateColumns: showCoordinates ? `16px ${W}px` : `${W}px`,
        gridTemplateRows: showCoordinates ? `${H}px 16px` : `${H}px`,
        flex: 'none',
      }}
    >
      {showCoordinates ? (
        <div style={{ display: 'flex', flexDirection: 'column' }} aria-hidden="true">
          {Array.from({ length: ranks }, (_, row) => (
            <div key={`rk-${row}`} style={{ ...coordStyle, height: cell }}>{ranks - row}</div>
          ))}
        </div>
      ) : null}
    <div
      className="qc-tutorial-miniboard"
      ref={boardRef}
      style={{
        position: 'relative',
        width: W,
        height: H,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.4)',
        flex: 'none',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        // One repeating gradient paints the whole checkerboard: per-square
        // divs seamed at sub-pixel offsets (the modal flex-centers, so odd
        // content sizes land the board on half pixels).
        background: `repeating-conic-gradient(${(ranks - 1) % 2 === 0 ? `${lightSq} 0% 25%, ${darkSq} 25% 50%` : `${darkSq} 0% 25%, ${lightSq} 25% 50%`}) top left / ${cell * 2}px ${cell * 2}px`,
      }}
    >
      {highlights.map((h, highlightIndex) => {
        const sq = typeof h === 'string' ? h : h.sq;
        const color = typeof h === 'string' ? 'rgba(255, 213, 79, 0.45)' : h.color;
        const { col, row } = sqToRC(sq, ranks);
        return (
          <div
            key={`hl-${sq}-${highlightIndex}`}
            style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, background: color }}
          />
        );
      })}

      {pieces.map((p) => {
        if (drag && p.sq === drag.from) return null; // the floating layer draws it
        const { col, row } = sqToRC(p.sq, ranks);
        return (
          <div
            key={`pc-${p.sq}`}
            style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, pointerEvents: 'none' }}
          >
            <QuantumPiece
              id={`tut-${p.sq}-${p.types}`}
              side={p.side}
              possibleTypes={(p.types || '').split('')}
              size={cell}
              promoted={Boolean(p.chevrons)}
              svgStyleBySide={svgStyleBySide || DEFAULT_SVG_STYLES}
              ariaLabel={`Tutorial piece at ${p.sq}`}
            />
          </div>
        );
      })}

      {/* Contact effects — the LIVE board's visual language (App.css
          animations): red zap spin-out, green heal bloom, shield pop, and
          the particle motes. Keyed on effectKey so repeats replay. */}
      {pieces.filter((p) => p.zap).map((p) => {
        const { col, row } = sqToRC(p.sq, ranks);
        return (
          <div key={`zap-${p.sq}-${effectKey}`} style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, pointerEvents: 'none', zIndex: 30 }} aria-hidden="true">
            <div
              className="qc-zap-circle"
              style={{
                position: 'absolute', inset: '10%', borderRadius: '50%', boxSizing: 'border-box',
                border: '3px dashed rgba(255, 64, 64, 0.95)',
                boxShadow: '0 0 12px rgba(255, 64, 64, 0.6), inset 0 0 10px rgba(255, 64, 64, 0.35)',
              }}
            />
          </div>
        );
      })}
      {pieces.filter((p) => p.heal).map((p) => {
        const { col, row } = sqToRC(p.sq, ranks);
        return (
          <div key={`heal-${p.sq}-${effectKey}`} style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, pointerEvents: 'none', zIndex: 30 }} aria-hidden="true">
            <div
              className="qc-heal-circle"
              style={{
                position: 'absolute', inset: '10%', borderRadius: '50%', boxSizing: 'border-box',
                border: '3px solid rgba(46, 204, 113, 0.9)',
                boxShadow: '0 0 12px rgba(46, 204, 113, 0.55), inset 0 0 10px rgba(46, 204, 113, 0.3)',
              }}
            />
          </div>
        );
      })}
      {pieces.filter((p) => p.healFail).map((p) => {
        const { col, row } = sqToRC(p.sq, ranks);
        return (
          <div key={`heal-fail-${p.sq}-${effectKey}`} style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, pointerEvents: 'none', zIndex: 30 }} aria-hidden="true">
            <div
              className="qc-heal-fail-circle"
              style={{
                position: 'absolute', inset: '10%', borderRadius: '50%', boxSizing: 'border-box',
                border: '3px dashed rgba(46, 204, 113, 0.92)',
                boxShadow: '0 0 12px rgba(46, 204, 113, 0.5), inset 0 0 10px rgba(46, 204, 113, 0.22)',
                animationDelay: `${CONTACT_PARTICLE_MAX_ARRIVAL_MS}ms`,
              }}
            >
              <svg viewBox="0 0 24 24" width="100%" height="100%">
                <path d="M12 6 V18 M6 12 H18" stroke="rgba(78, 224, 140, 0.98)" strokeWidth="2.4" strokeLinecap="round" />
                <path d="M5.5 18.5 L18.5 5.5" stroke="rgba(15, 74, 44, 0.95)" strokeWidth="3.8" strokeLinecap="round" />
                <path d="M5.5 18.5 L18.5 5.5" stroke="rgba(126, 241, 174, 0.98)" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        );
      })}
      {pieces.filter((p) => p.shield).map((p) => {
        const { col, row } = sqToRC(p.sq, ranks);
        return (
          <div key={`shield-${p.sq}-${effectKey}`} style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, pointerEvents: 'none', zIndex: 31 }} aria-hidden="true">
            <div
              className="qc-fizzle-shield"
              style={{
                position: 'absolute', inset: '18%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                filter: 'drop-shadow(0 0 8px rgba(170, 190, 220, 0.75))',
                animationDelay: `${CONTACT_PARTICLE_MAX_ARRIVAL_MS}ms`,
              }}
            >
              <svg viewBox="0 0 24 24" width="100%" height="100%">
                <path
                  d="M12 2 L20 5 V11 C20 16.5 16.7 20.6 12 22 C7.3 20.6 4 16.5 4 11 V5 Z"
                  fill="rgba(170, 190, 220, 0.28)"
                  stroke="rgba(200, 215, 235, 0.95)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M8.2 11.2 L15.8 11.2" stroke="rgba(200, 215, 235, 0.95)" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        );
      })}
      {pulseParticles.length ? (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 29 }} aria-hidden="true">
          {pulseParticles.map((pt) => (
            <div
              key={pt.key}
              className={`qc-pulse-particle ${pt.cls}`}
              style={{
                left: pt.x0,
                top: pt.y0,
                '--qc-tx': `${pt.tx}px`,
                '--qc-ty': `${pt.ty}px`,
                animationDelay: `${pt.delay}ms`,
                animationDuration: `${pt.dur}ms`,
              }}
            />
          ))}
        </div>
      ) : null}

      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {arrows.map((a, i) => {
          const from = center(a.from);
          const to = center(a.to);
          const isHint = a.kind === 'hint';
          // Hint arrows match game review; other tutorial/puzzle arrows retain
          // the live-board geometry and side-aware coloring.
          const { x1, y1, baseX, baseY, headPoints } = arrowGeometry(
            from,
            to,
            cell,
            isHint ? {
              tipInset: 0.22, startInset: 0.34, headLen: 0.3, headHalf: 0.19,
              minStartInset: 0.08, minHeadLen: 0.14, headGap: 0.05,
            } : undefined
          );
          const hex = bodyHex(a.side || 'white');
          const halo = a.side === 'white' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
          const w = isHint ? Math.max(5, cell * 0.17) : Math.max(3, cell * 0.08);
          if (isHint) {
            return (
              <g key={`ar-${i}`} opacity={a.opacity ?? 0.8}>
                <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke="#2ea043" strokeWidth={w} strokeLinecap="round" />
                <polygon points={headPoints} fill="#2ea043" strokeLinejoin="round" />
              </g>
            );
          }
          return (
            <g key={`ar-${i}`}>
              <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke={halo} strokeWidth={w + 2.5} strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke={hex} strokeWidth={w} strokeLinecap="round" />
              <polygon
                points={headPoints}
                fill={hex}
                stroke={halo}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
        {pieces.filter((p) => p.mark).map((p) => {
          const c = center(p.sq);
          return (
            <circle
              key={`mark-${p.sq}`}
              cx={c.x}
              cy={c.y}
              r={cell * 0.44}
              fill="none"
              stroke="rgba(79,195,247,0.95)"
              strokeWidth={2.5}
              strokeDasharray="5 4"
            />
          );
        })}
        {targets.map((sq) => {
          const c = center(sq);
          return <circle key={`tg-${sq}`} cx={c.x} cy={c.y} r={cell * 0.13} fill="rgba(30,30,30,0.4)" />;
        })}
      </svg>

      {onSquareClick || dragEnabled
        ? Array.from({ length: files * ranks }, (_, i) => {
            const col = i % files;
            const row = Math.floor(i / files);
            const alg = `${String.fromCharCode(97 + col)}${ranks - row}`;
            const draggable = dragEnabled && canDrag(alg);
            return (
              <div
                key={`click-${i}`}
                onClick={onSquareClick ? () => onSquareClick(alg) : undefined}
                onPointerDown={draggable ? (e) => {
                  e.preventDefault();
                  const rect = boardRef.current ? boardRef.current.getBoundingClientRect() : null;
                  const x = rect ? e.clientX - rect.left : (col + 0.5) * cell;
                  const y = rect ? e.clientY - rect.top : (row + 0.5) * cell;
                  setDrag({ from: alg, x, y, over: alg });
                  if (onDragStart) onDragStart(alg);
                } : undefined}
                style={{
                  position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, zIndex: 40,
                  cursor: drag ? 'grabbing' : draggable ? 'grab' : 'pointer',
                  touchAction: draggable ? 'none' : undefined,
                }}
              />
            );
          })
        : null}

      {drag && drag.over && drag.over !== drag.from ? (() => {
        const { col, row } = sqToRC(drag.over, ranks);
        return (
          <div
            className="qc-miniboard-drop-target"
            style={{
              position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell,
              backgroundColor: 'rgba(97, 218, 251, 0.28)', border: '2px dashed rgba(97,218,251,0.55)',
              borderRadius: 2, boxSizing: 'border-box', pointerEvents: 'none', zIndex: 45,
            }}
          />
        );
      })() : null}

      {drag && dragPiece ? (
        <div
          className="qc-miniboard-floating-piece"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: Math.max(0, Math.min(W - cell, drag.x - cell / 2)),
            top: Math.max(0, Math.min(H - cell, drag.y - cell / 2)),
            width: cell, height: cell, pointerEvents: 'none', zIndex: 50,
            filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.3))',
          }}
        >
          <QuantumPiece
            id={`drag-${dragPiece.sq}-${dragPiece.types}`}
            side={dragPiece.side}
            possibleTypes={(dragPiece.types || '').split('')}
            size={cell}
            promoted={Boolean(dragPiece.chevrons)}
            svgStyleBySide={svgStyleBySide || DEFAULT_SVG_STYLES}
            ariaLabel={`Dragging piece from ${drag.from}`}
          />
        </div>
      ) : null}
    </div>

      {showCoordinates ? <div /> : null}
      {showCoordinates ? (
        <div style={{ display: 'flex' }} aria-hidden="true">
          {Array.from({ length: files }, (_, col) => (
            <div key={`fl-${col}`} style={{ ...coordStyle, width: cell }}>{String.fromCharCode(97 + col)}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
