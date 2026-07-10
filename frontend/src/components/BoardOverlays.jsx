// frontend/src/components/BoardOverlays.jsx
// Purpose: The overlays anchored over the board — the pre-game "Start a
// Game" CTA and the intro choreography's off-script nudge toast. Extracted
// from App.jsx.
// Imports From: ../theme.js
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';

export function StartGameCta({ pulse, onClick }) {
  return (
    <button
      type="button"
      className="qc-board-start-cta"
      key={`start-cta-${pulse}`}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 20,
        padding: '12px 26px',
        borderRadius: 999,
        border: `1px solid ${theme.border}`,
        background: 'rgba(12, 14, 22, 0.88)',
        color: theme.textPrimary,
        fontWeight: 900,
        fontSize: 'clamp(14px, 2.4vw, 17px)',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(2px)',
        animation: pulse > 0 ? 'qc-cta-pulse 500ms ease-out' : 'none',
      }}
    >
      ▶ Start a Game
    </button>
  );
}

export function IntroNudgeToast({ nudge }) {
  if (!nudge) return null;
  return (
    <div
      className="qc-intro-nudge"
      key={`intro-nudge-${nudge.n}`}
      role="alert"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 40,
        padding: '10px 18px',
        borderRadius: 10,
        border: '2px solid rgba(255, 200, 80, 0.9)',
        background: 'rgba(12, 14, 22, 0.94)',
        color: theme.textPrimary,
        fontWeight: 700,
        fontSize: 'clamp(13px, 2.2vw, 16px)',
        letterSpacing: '0.02em',
        boxShadow: '0 0 18px rgba(255, 200, 80, 0.4), 0 8px 24px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(2px)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      ✦ {nudge.text}
    </div>
  );
}
