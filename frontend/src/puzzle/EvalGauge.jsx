// frontend/src/puzzle/EvalGauge.jsx
// Purpose: The mined-puzzle speedometer. A semicircular gauge — Black's half
// on the left, White's half on the right — with a faint neon-red tick at the
// evaluation of EVERY legal move in the position (the player sees the shape
// of the position without knowing which move is which). The needle wobbles
// while the move is unmade, then swings and lands on the eval of the move
// the player chose. Honors prefers-reduced-motion (no wobble, eased landing).
// Imports From: None
// Exported To: ./MinedPuzzleModal.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// eval (pawns, White-positive) -> needle angle in degrees.
// 90° = straight up (equal); 0° = hard right (White winning);
// 180° = hard left (Black winning). Compressed toward the ends so the
// mid-range (±3) stays readable while mate-sized evals still move the needle.
function angleFor(evalPawns, range) {
  const x = clamp(evalPawns / range, -1, 1);
  const soft = Math.sign(x) * Math.sqrt(Math.abs(x)); // spread small evals out
  return 90 - soft * 88; // keep 2° of visual margin at each end
}

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function sectorPath(cx, cy, r, fromDeg, toDeg) {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, toDeg);
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y} Z`;
}

export default function EvalGauge({
  ticks = [], // evals (pawns, White-positive) of every legal move
  value = null, // eval the needle should land on; null = unmade move (wobble)
  range = 12,
  width = 330,
  label = null, // small caption under the pivot once landed
}) {
  const W = width;
  const R = W / 2 - 8;
  const cx = W / 2;
  const cy = R + 8;
  const H = cy + 26;

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  // Wobble: an organic double-sine sway around center while value is null.
  const [wobbleDeg, setWobbleDeg] = useState(90);
  const rafRef = useRef(0);
  useEffect(() => {
    if (value !== null || reduceMotion) return undefined;
    let alive = true;
    const t0 = performance.now();
    const tick = (t) => {
      if (!alive) return;
      const s = (t - t0) / 1000;
      setWobbleDeg(90 + 26 * Math.sin(s * 1.35) + 9 * Math.sin(s * 3.9 + 1.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [value, reduceMotion]);

  const needleDeg = value === null ? wobbleDeg : angleFor(value, range);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={value === null
        ? 'Evaluation gauge, waiting for your move'
        : `Evaluation gauge: ${value >= 0 ? 'White' : 'Black'} ${Math.abs(value).toFixed(1)}`}
      style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
    >
      {/* Halves: Black's side of the dial on the left, White's on the right. */}
      <path d={sectorPath(cx, cy, R, 180, 90)} fill="#101318" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <path d={sectorPath(cx, cy, R, 90, 0)} fill="#e8e6e1" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      {/* Center seam */}
      <line x1={cx} y1={cy} x2={cx} y2={cy - R} stroke="rgba(128,128,128,0.45)" strokeWidth="1" />

      {/* A faint neon-red line at every legal move's evaluation. */}
      {ticks.map((t, i) => {
        const d = angleFor(t, range);
        const a = polar(cx, cy, R * 0.66, d);
        const b = polar(cx, cy, R * 0.97, d);
        return (
          <g key={`tick-${i}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,45,60,0.5)" strokeWidth="2.4" strokeLinecap="round" opacity="0.35" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ff2d3c" strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
          </g>
        );
      })}

      {/* Needle. Landing animates via CSS transition on the rotation. */}
      <g
        style={{
          transform: `rotate(${90 - needleDeg}deg)`,
          transformOrigin: `${cx}px ${cy}px`,
          transition: value !== null ? 'transform 900ms cubic-bezier(0.22, 1.4, 0.36, 1)' : 'none',
        }}
      >
        {/* drawn pointing straight up; the group rotation aims it */}
        <line x1={cx} y1={cy} x2={cx} y2={cy - R * 0.86} stroke="#39e6ff" strokeWidth="3" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={cx} y2={cy - R * 0.86} stroke="rgba(57,230,255,0.35)" strokeWidth="7" strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r="7" fill="#1b222c" stroke="#39e6ff" strokeWidth="2" />

      {/* Side labels + landed value */}
      <text x={polar(cx, cy, R + 2, 171).x} y={cy + 16} fontSize="10" fontWeight="800" letterSpacing="0.1em" fill="rgba(255,255,255,0.55)">BLACK</text>
      <text x={polar(cx, cy, R + 2, 9).x} y={cy + 16} fontSize="10" fontWeight="800" letterSpacing="0.1em" fill="rgba(255,255,255,0.55)" textAnchor="end">WHITE</text>
      {value !== null ? (
        <text x={cx} y={cy + 18} fontSize="13" fontWeight="800" textAnchor="middle" fill={value >= 0 ? '#e8e6e1' : '#9aa4b2'}>
          {`${value >= 0 ? 'White' : 'Black'} +${Math.abs(value).toFixed(1)}`}
        </text>
      ) : label ? (
        <text x={cx} y={cy + 18} fontSize="11" fontWeight="600" textAnchor="middle" fill="rgba(255,255,255,0.5)">{label}</text>
      ) : null}
    </svg>
  );
}
