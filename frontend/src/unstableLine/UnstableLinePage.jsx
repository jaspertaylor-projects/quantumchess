// frontend/src/unstableLine/UnstableLinePage.jsx
// SHELVED (2026-07-08): parked until post-launch — see ./unstableLine.js.
// Purpose: Full-screen Enter the Unstable Line route-map surface.
// Imports From: react, ../theme.js, ./UnstableLinePanel.jsx
// Exported To: (none — shelved)

import React from 'react';
import theme from '../theme.js';
import UnstableLinePanel from './UnstableLinePanel.jsx';

export default function UnstableLinePage({
  open = false,
  auth = null,
  onClose = () => {},
  onOpenAccount = () => {},
  onStartGame = () => {},
}) {
  if (!open) return null;

  return (
    <div
      className="qc-unstable-page"
      role="dialog"
      aria-label="Enter the Unstable Line"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 980,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        color: theme.textPrimary,
        background:
          'linear-gradient(90deg, rgba(0,245,255,0.07) 0 1px, transparent 1px 11%), linear-gradient(180deg, #060816 0%, #0b0d1f 52%, #120816 100%)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(115deg, transparent 0 31%, rgba(0,245,255,0.18) 32%, transparent 35% 46%, rgba(255,59,127,0.14) 48%, transparent 52% 100%), repeating-linear-gradient(90deg, rgba(127,231,255,0.06) 0 2px, transparent 2px 34px)',
          opacity: 0.8,
        }}
      />

      <main
        style={{
          position: 'relative',
          minHeight: '100%',
          width: 'min(1180px, calc(100vw - 28px))',
          margin: '0 auto',
          padding: '24px 0 42px',
          boxSizing: 'border-box',
          display: 'grid',
          gap: 18,
        }}
      >
        <header
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 14,
            alignItems: 'start',
            paddingTop: 'env(safe-area-inset-top)',
          }}
        >
          <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
            <div
              style={{
                color: '#7fe7ff',
                fontSize: 12,
                fontWeight: 950,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
              }}
            >
              Double-slit route map
            </div>
            <h1
              style={{
                margin: 0,
                color: '#ffffff',
                fontSize: 'clamp(28px, 5vw, 56px)',
                lineHeight: 0.98,
                fontWeight: 1000,
                letterSpacing: 0,
              }}
            >
              Enter the Unstable Line
            </h1>
            <p
              style={{
                margin: 0,
                maxWidth: 740,
                color: theme.textSecondary,
                fontSize: 'clamp(13px, 1.6vw, 16px)',
                lineHeight: 1.5,
              }}
            >
              Pick the branch. Carry the bot instability. Collect enough run tools to collapse the line at Emanuel Einstein.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: theme.textPrimary,
              fontSize: 20,
              fontWeight: 900,
              lineHeight: 1,
              cursor: 'pointer',
            }}
            aria-label="Close Unstable Line"
            title="Close"
          >
            x
          </button>
        </header>

        <UnstableLinePanel
          page
          auth={auth}
          onOpenAccount={onOpenAccount}
          onStartGame={(settings) => {
            onClose();
            onStartGame(settings);
          }}
        />
      </main>
    </div>
  );
}
