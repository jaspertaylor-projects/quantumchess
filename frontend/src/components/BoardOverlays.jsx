// frontend/src/components/BoardOverlays.jsx
// Purpose: The overlays anchored over the board — the pre-game "Start a
// Game" CTA and the intro choreography's off-script nudge toast. Extracted
// from App.jsx.
// Imports From: ../theme.js
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';
import { RotateCcw, Swords, X } from 'lucide-react';

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

export function IntroSpeechOverlay({
  speech,
  open,
  placement = 'mobile',
  awaitingChoice = false,
  needsContinue = false,
  onCollapse,
  onInteract,
  onContinueExplanation,
  onContinue,
  onRestart,
}) {
  if (!speech || !open) return null;
  return (
    <section
      className={`qc-intro-speech-card qc-intro-speech-card--${placement}`}
      role="dialog"
      aria-label="Opponent guidance"
      onPointerDown={onInteract}
      style={{
        zIndex: 45,
        boxSizing: 'border-box',
        padding: '16px 18px 14px',
        borderRadius: 16,
        border: '1px solid rgba(255, 200, 80, 0.75)',
        background: 'rgba(12, 15, 23, 0.96)',
        color: theme.textPrimary,
        boxShadow: '0 0 0 2px rgba(255, 200, 80, 0.12), 0 14px 38px rgba(0,0,0,0.58)',
        backdropFilter: 'blur(5px)',
      }}
    >
      {!needsContinue ? (
        <button
          type="button"
          className="qc-intro-speech-close"
          onClick={(event) => {
            event.stopPropagation();
            onCollapse();
          }}
          aria-label="Collapse opponent message"
          title="Collapse message"
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            width: 30,
            height: 30,
            display: 'grid',
            placeItems: 'center',
            padding: 0,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.07)',
            color: theme.textSecondary,
            cursor: 'pointer',
          }}
        >
          <X size={17} aria-hidden="true" />
        </button>
      ) : null}
      <div
        style={{
          paddingRight: 22,
          fontSize: 'clamp(14px, 2.7vw, 18px)',
          lineHeight: 1.45,
          fontWeight: 700,
          textAlign: 'center',
        }}
      >
        {speech}
      </div>
      {needsContinue ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            type="button"
            className="qc-intro-choice qc-intro-choice--primary"
            onClick={onContinueExplanation}
            style={{
              minWidth: 120,
              padding: '9px 18px',
              borderRadius: 9,
              border: '1px solid rgba(126,231,135,0.75)',
              background: 'rgba(46,160,67,0.24)',
              color: '#e8fff0',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Continue
          </button>
        </div>
      ) : null}
      {awaitingChoice ? (
        <div
          className="qc-intro-speech-actions"
          style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}
        >
          <button
            type="button"
            className="qc-intro-choice qc-intro-choice--primary"
            onClick={onContinue}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 13px', borderRadius: 9,
              border: '1px solid rgba(126,231,135,0.75)',
              background: 'rgba(46,160,67,0.24)', color: '#e8fff0',
              fontWeight: 800, cursor: 'pointer',
            }}
          >
            <Swords size={16} aria-hidden="true" /> Play from here
          </button>
          <button
            type="button"
            className="qc-intro-choice"
            onClick={onRestart}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 13px', borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.28)',
              background: 'rgba(255,255,255,0.07)', color: theme.textPrimary,
              fontWeight: 800, cursor: 'pointer',
            }}
          >
            <RotateCcw size={16} aria-hidden="true" /> Start over
          </button>
        </div>
      ) : null}
      <div className="qc-intro-speech-tail" aria-hidden="true" />
    </section>
  );
}
