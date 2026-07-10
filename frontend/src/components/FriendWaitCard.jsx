// frontend/src/components/FriendWaitCard.jsx
// Purpose: The "Challenge a Friend" invite card shown while the private room
// waits for the invited player — copyable link, room code, cancel. Extracted
// from App.jsx.
// Imports From: ../theme.js
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';

export default function FriendWaitCard({ friendWait, inviteCopied, onCopyInvite, onCancel }) {
  if (!friendWait) return null;
  return (
    <div
      className="qc-friend-wait"
      role="dialog"
      aria-label="Challenge a friend"
      style={{
        position: 'fixed', top: 84, left: '50%', transform: 'translateX(-50%)',
        zIndex: 950, width: 'min(94vw, 440px)', boxSizing: 'border-box',
        background: theme.cardBackground, border: `1px solid ${theme.border}`,
        borderRadius: 12, boxShadow: `0 12px 32px ${theme.shadow}`,
        color: theme.textPrimary, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ fontWeight: 900, letterSpacing: '0.04em' }}>⚔ Challenge a Friend</div>
      <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
        Send this link — the game starts the moment they open it. You play White.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="qc-friend-wait-link" readOnly value={friendWait.link}
          onFocus={(e) => e.target.select()}
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '8px 10px',
            borderRadius: 8, border: `1px solid ${theme.border}`,
            background: 'rgba(255,255,255,0.05)', color: theme.textPrimary, fontSize: 13,
          }}
        />
        <button
          type="button" className="qc-friend-wait-copy" onClick={onCopyInvite}
          style={{
            padding: '8px 14px', borderRadius: 8, border: 'none',
            backgroundColor: theme.primary, color: theme.secondary,
            fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {inviteCopied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: theme.textSecondary }}>
          Room code: <strong style={{ color: theme.textPrimary, letterSpacing: '0.12em' }}>{friendWait.code}</strong>
          {' '}· waiting…
        </span>
        <button
          type="button" className="qc-friend-wait-cancel" onClick={onCancel}
          style={{
            padding: '7px 12px', borderRadius: 8, border: `1px solid ${theme.border}`,
            background: 'transparent', color: theme.textPrimary, fontWeight: 700,
            fontSize: 12.5, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
