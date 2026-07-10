// frontend/src/review/EvalTraceGraph.jsx
// Purpose: Dev/mined-game strip — the full game's eval story as a clickable
// seek graph. Values are computed client-side by useGameEvalGraph at
// parity-matched depths; points arrive pre-resolved so every value on the
// curve shares a declared ruler (mixed-ruler neighbors draw phantom swings —
// that lesson is paid for). Extracted from ReviewModal.jsx.
// Imports From: None
// Exported To: ./ReviewModal.jsx

import React from 'react';

export default function EvalTraceGraph({ points, count, idx, onSeek, pendingCount, deepening, label }) {
  const W = 560;
  const H = 96;
  const PAD = 8;
  const maxPly = Math.max(1, count - 1);
  const x = (ply) => PAD + (ply / maxPly) * (W - 2 * PAD);
  const y = (v) => H / 2 - (Math.max(-8, Math.min(8, v)) / 8) * (H / 2 - 10);
  const pts = [...points].filter((p) => p.eval !== undefined).sort((a, b) => a.ply - b.ply);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ply).toFixed(1)} ${y(p.eval).toFixed(1)}`).join(' ');
  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(count - 1, Math.round(fx * maxPly))));
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', cursor: 'pointer' }}
      onClick={seek}
      role="img"
      aria-label="Game evaluation graph; click to jump to a move"
    >
      <rect x="0" y="0" width={W} height={H} rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" />
      {/* balance band ±1 */}
      <rect x={PAD} y={y(1)} width={W - 2 * PAD} height={y(-1) - y(1)} fill="rgba(126,231,135,0.07)" />
      <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke="rgba(128,128,128,0.5)" strokeWidth="1" />
      <path d={path} fill="none" stroke="#39e6ff" strokeWidth="1.6" />
      {pts.map((p) => (
        <circle
          key={`pt-${p.ply}`} cx={x(p.ply)} cy={y(p.eval)} r={p.side === 'white' ? 2.3 : 1.8}
          fill={p.side === 'white' ? '#39e6ff' : 'rgba(57,230,255,0.65)'}
        />
      ))}
      <line x1={x(idx)} y1={6} x2={x(idx)} y2={H - 6} stroke="#ffd166" strokeWidth="1.5" />
      <text x={PAD + 2} y={12} fontSize="9" fill="rgba(255,255,255,0.5)">+8</text>
      <text x={W / 2} y={12} fontSize="9" textAnchor="middle" fill="rgba(255,255,255,0.45)">
        {`curve: ${label}`}
      </text>
      <text x={PAD + 2} y={H - 5} fontSize="9" fill="rgba(255,255,255,0.5)">-8</text>
      {pendingCount > 0 ? (
        <text x={W - PAD} y={12} fontSize="9" textAnchor="end" fill="rgba(255,255,255,0.5)">
          {deepening ? `deepening (${deepening})… ${pendingCount} left` : `scanning… ${pendingCount} left`}
        </text>
      ) : null}
    </svg>
  );
}
