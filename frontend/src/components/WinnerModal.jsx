// frontend/src/components/WinnerModal.jsx
// Purpose: Modal overlay to display end-of-game result with a single primary dismissal action.
// Imports From: ../theme.js
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';

export default function WinnerModal({ open = false, winnerText = '', onClose = () => {} }) {
  const styles = {
    winnerOverlay: {
      position: 'fixed',
      inset: 0,
      display: open ? 'flex' : 'none',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
      zIndex: 9999,
    },
    winnerModal: {
      backgroundColor: '#111',
      color: '#fff',
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      boxShadow: `0 12px 32px ${theme.shadow}`,
      padding: '20px 24px',
      width: 'min(90vw, 420px)',
      display: 'grid',
      gap: 12,
      textAlign: 'center',
    },
    winnerTitle: {
      fontSize: '1.2rem',
      fontWeight: 800,
      letterSpacing: '0.02em',
      margin: 0,
    },
    winnerSub: {
      fontSize: '0.95rem',
      opacity: 0.9,
      margin: 0,
    },
    winnerButtonRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginTop: 8,
    },
    primaryBtn: {
      padding: '10px 16px',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.15)',
      backgroundColor: '#1f51ff',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
    },
  };

  return (
    <div className="qc-winner-overlay" style={styles.winnerOverlay} role="dialog" aria-modal={open} aria-hidden={!open}>
      <div className="qc-winner-modal" style={styles.winnerModal}>
        <h2 className="qc-winner-title" style={styles.winnerTitle}>Checkmate</h2>
        <p className="qc-winner-sub" style={styles.winnerSub}>{winnerText || 'Game over.'}</p>
        <div className="qc-winner-button-row" style={styles.winnerButtonRow}>
          <button className="qc-winner-button" style={styles.primaryBtn} onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
