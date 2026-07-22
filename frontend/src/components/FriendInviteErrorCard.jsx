// Purpose: A recoverable destination for expired, full, or unreachable
// challenge links. Keeps acquisition failures out of the cramped info line.
// Imports From: ./ModalShell.jsx, ./ModalCloseButton.jsx, ../theme.js
// Exported To: ./AppModals.jsx

import React from 'react';
import { RadioTower } from 'lucide-react';
import theme from '../theme.js';
import ModalCloseButton from './ModalCloseButton.jsx';
import ModalShell from './ModalShell.jsx';

export default function FriendInviteErrorCard({ error, onRetry, onChooseGame, onClose }) {
  if (!error) return null;
  const canRetry = error.kind === 'network';

  return (
    <ModalShell
      open
      onClose={onClose}
      closeOnBackdrop
      zIndex={1003}
      ariaLabelledBy="qc-invite-error-title"
      panelStyle={{
        position: 'relative',
        width: 'min(92vw, 430px)',
        boxSizing: 'border-box',
        padding: '24px 22px 20px',
        borderRadius: 18,
        border: '1px solid rgba(127,231,255,0.34)',
        background: 'radial-gradient(circle at 50% -20%, rgba(79,195,247,0.18), transparent 46%), linear-gradient(155deg, rgba(24,29,42,0.99), rgba(9,12,20,0.99))',
        boxShadow: `0 22px 55px ${theme.shadow}, 0 0 28px rgba(79,195,247,0.16)`,
        color: theme.textPrimary,
        textAlign: 'center',
      }}
    >
      <ModalCloseButton onClick={onClose} ariaLabel="Close challenge message" style={{ position: 'absolute', top: 12, right: 12 }} />
      <div style={{ width: 64, height: 64, margin: '0 auto 10px', borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#7fe7ff', background: 'rgba(127,231,255,0.1)', boxShadow: '0 0 24px rgba(79,195,247,0.18)' }}>
        <RadioTower size={29} />
      </div>
      <div style={{ color: '#7fe7ff', fontSize: 10, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Friend challenge</div>
      <h2 id="qc-invite-error-title" style={{ margin: '6px 30px 8px', fontSize: 22 }}>{error.title}</h2>
      <p style={{ margin: 0, padding: '11px 13px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.035)', color: theme.textSecondary, fontSize: 14, lineHeight: 1.55 }}>
        {error.message}
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={onChooseGame} style={{ flex: 1, minHeight: 43, borderRadius: 10, border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.04)', color: theme.textPrimary, fontWeight: 800, cursor: 'pointer' }}>
          Choose a Game
        </button>
        {canRetry ? (
          <button type="button" onClick={onRetry} style={{ flex: 1, minHeight: 43, borderRadius: 10, border: '1px solid #7fe7ff', background: 'linear-gradient(135deg, #7fe7ff, #8f80ff)', color: '#07131a', fontWeight: 900, cursor: 'pointer' }}>
            Try Again
          </button>
        ) : (
          <button type="button" onClick={() => window.location.assign('/')} style={{ flex: 1, minHeight: 43, borderRadius: 10, border: '1px solid #7fe7ff', background: 'linear-gradient(135deg, #7fe7ff, #8f80ff)', color: '#07131a', fontWeight: 900, cursor: 'pointer' }}>
            Welcome Page
          </button>
        )}
      </div>
    </ModalShell>
  );
}
