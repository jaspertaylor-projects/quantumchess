// frontend/src/components/EnPassantChoiceModal.jsx
// Purpose: Modal overlay asking the player to disambiguate a move onto an en passant square:
// capture en passant (collapsing the mover to a Pawn) or make the quiet non-capturing move.
// Imports From: ../theme.js, ./ModalShell.jsx
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';
import ModalShell from './ModalShell.jsx';

export default function EnPassantChoiceModal({ open = false, onEnPassant = () => {}, onQuiet = () => {}, onCancel = () => {} }) {
  if (!open) return null;

  const styles = {
    modal: {
      backgroundColor: '#111',
      color: '#fff',
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      boxShadow: `0 12px 32px ${theme.shadow}`,
      padding: '20px 24px',
      width: 'min(90vw, 460px)',
      display: 'grid',
      gap: 12,
      textAlign: 'center',
    },
    title: {
      fontSize: '1.1rem',
      fontWeight: 800,
      letterSpacing: '0.02em',
      margin: 0,
    },
    sub: {
      fontSize: '0.9rem',
      opacity: 0.85,
      margin: 0,
      lineHeight: 1.4,
    },
    buttonRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginTop: 8,
      flexWrap: 'wrap',
    },
    epBtn: {
      padding: '10px 16px',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.15)',
      backgroundColor: '#1f51ff',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
    },
    quietBtn: {
      padding: '10px 16px',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.25)',
      backgroundColor: 'transparent',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
    },
  };

  return (
    <ModalShell
      onClose={onCancel}
      closeOnBackdrop
      zIndex={9999}
      ariaLabelledBy="qc-ep-title"
      backdropClassName="qc-ep-overlay"
      panelClassName="qc-ep-modal"
      panelStyle={styles.modal}
    >
      <h2 id="qc-ep-title" className="qc-ep-title" style={styles.title}>Phantom Capture?</h2>
      <p className="qc-ep-sub" style={styles.sub}>
        This square can be reached two ways. Capture en passant (your piece is measured as a Pawn and the
        passing piece is removed as a Pawn), or make the quiet move with your superposition intact.
      </p>
      <div className="qc-ep-button-row" style={styles.buttonRow}>
        <button className="qc-ep-capture" style={styles.epBtn} onClick={onEnPassant} autoFocus>
          Capture En Passant
        </button>
        <button className="qc-ep-quiet" style={styles.quietBtn} onClick={onQuiet}>
          Quiet Move
        </button>
      </div>
    </ModalShell>
  );
}
