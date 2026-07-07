// frontend/src/tutorial/MiniBoard.jsx
// Purpose: Small static board diagrams for the tutorial, rendered with the
// REAL QuantumPiece art (trapezoid-band composites and indicators) so the
// tutorial teaches exactly what the board shows. Adds arrows, check rings,
// pulse marks, and square highlights on top.
// Imports From: ../chessboard/QuantumPiece.jsx, ../settings/usePieceColors.js
// Exported To: ./TutorialModal.jsx

import React from 'react';
import QuantumPiece from '../chessboard/QuantumPiece.jsx';
import { DEFAULT_WHITE, DEFAULT_BLACK } from '../settings/usePieceColors.js';

const LIGHT = '#f0d9b5';
const DARK = '#b58863';

const DEFAULT_SVG_STYLES = {
  white: { '--band-fill': DEFAULT_WHITE.bandFill, '--band-stroke': DEFAULT_WHITE.bandStroke, '--icon-color': DEFAULT_WHITE.icon },
  black: { '--band-fill': DEFAULT_BLACK.bandFill, '--band-stroke': DEFAULT_BLACK.bandStroke, '--icon-color': DEFAULT_BLACK.icon },
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
  pieces = [], // { sq, side, types, pips, regain, chain, chevrons, ring, mark }
  arrows = [], // { from, to, side }
  highlights = [], // squares tinted amber
  targets = [], // squares showing a legal-move dot
  onSquareClick = null, // enables interaction: called with the algebraic square
  svgStyleBySide = null, // live piece colors from the app; defaults otherwise
}) {
  const W = files * cell;
  const H = ranks * cell;
  const center = (sq) => {
    const { col, row } = sqToRC(sq, ranks);
    return { x: (col + 0.5) * cell, y: (row + 0.5) * cell };
  };
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
        gridTemplateColumns: `16px ${W}px`,
        gridTemplateRows: `${H}px 16px`,
        flex: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }} aria-hidden="true">
        {Array.from({ length: ranks }, (_, row) => (
          <div key={`rk-${row}`} style={{ ...coordStyle, height: cell }}>{ranks - row}</div>
        ))}
      </div>
    <div
      className="qc-tutorial-miniboard"
      style={{
        position: 'relative',
        width: W,
        height: H,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.4)',
        flex: 'none',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
      }}
    >
      {Array.from({ length: files * ranks }, (_, i) => {
        const col = i % files;
        const row = Math.floor(i / files);
        const rank = ranks - 1 - row;
        const dark = (col + rank) % 2 === 0;
        return (
          <div
            key={`sq-${i}`}
            style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, background: dark ? DARK : LIGHT }}
          />
        );
      })}

      {highlights.map((sq) => {
        const { col, row } = sqToRC(sq, ranks);
        return (
          <div
            key={`hl-${sq}`}
            style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, background: 'rgba(255, 213, 79, 0.45)' }}
          />
        );
      })}

      {pieces.map((p) => {
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
              coherence={Number.isFinite(p.pips) ? p.pips : 3}
              recohere={Number.isFinite(p.regain) ? p.regain : 0}
              entangled={Boolean(p.chain)}
              promoted={Boolean(p.chevrons)}
              sealed={Boolean(p.sealed)}
              svgStyleBySide={svgStyleBySide || DEFAULT_SVG_STYLES}
              ariaLabel={`Tutorial piece at ${p.sq}`}
            />
          </div>
        );
      })}

      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {arrows.map((a, i) => {
          const from = center(a.from);
          const to = center(a.to);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          // Same short-arrow guard as the live board: adjacent squares get a
          // compact arrow instead of a shaft that runs backwards.
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
          const hex = bodyHex(a.side || 'white');
          const halo = a.side === 'white' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
          const w = Math.max(3, cell * 0.08);
          return (
            <g key={`ar-${i}`}>
              <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke={halo} strokeWidth={w + 2.5} strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke={hex} strokeWidth={w} strokeLinecap="round" />
              <polygon
                points={`${tipX},${tipY} ${baseX + px * headHalf},${baseY + py * headHalf} ${baseX - px * headHalf},${baseY - py * headHalf}`}
                fill={hex}
                stroke={halo}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
        {pieces.filter((p) => p.ring).map((p) => {
          const c = center(p.sq);
          return (
            <circle key={`ring-${p.sq}`} cx={c.x} cy={c.y} r={cell * 0.42} fill="none" stroke="rgba(255,64,64,0.9)" strokeWidth={Math.max(2.5, cell * 0.055)}>
              <animate attributeName="opacity" values="0.95;0.35;0.95" dur="1.4s" repeatCount="indefinite" />
            </circle>
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

      {onSquareClick
        ? Array.from({ length: files * ranks }, (_, i) => {
            const col = i % files;
            const row = Math.floor(i / files);
            const alg = `${String.fromCharCode(97 + col)}${ranks - row}`;
            return (
              <div
                key={`click-${i}`}
                onClick={() => onSquareClick(alg)}
                style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell, cursor: 'pointer', zIndex: 40 }}
              />
            );
          })
        : null}
    </div>

      <div />
      <div style={{ display: 'flex' }} aria-hidden="true">
        {Array.from({ length: files }, (_, col) => (
          <div key={`fl-${col}`} style={{ ...coordStyle, width: cell }}>{String.fromCharCode(97 + col)}</div>
        ))}
      </div>
    </div>
  );
}
