// frontend/src/components/ConfirmModal.jsx
// Purpose: In-app confirmation dialog (resign, draw offers, ending a game)
// replacing native browser confirm() popups.
// Imports From: ../theme.js
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';

export default function ConfirmModal({
  open = false,
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm = () => {},
  onCancel = () => {},
}) {
  if (!open) return null;

  const styles = {
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1002,
    },
    panel: {
      width: 'min(92vw, 380px)',
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      backgroundColor: theme.cardBackground,
      boxShadow: `0 12px 32px ${theme.shadow}`,
      color: theme.textPrimary,
      padding: 20,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    title: {
      margin: 0,
      fontSize: '1.05rem',
      fontWeight: 900,
      letterSpacing: '0.03em',
    },
    message: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.5,
      color: theme.textSecondary,
    },
    buttons: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 4,
    },
    cancelBtn: {
      padding: '8px 14px',
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: 'transparent',
      color: theme.textPrimary,
      fontWeight: 700,
      fontSize: 13,
      cursor: 'pointer',
    },
    confirmBtn: {
      padding: '8px 16px',
      borderRadius: 8,
      border: 'none',
      background: danger ? (theme.danger || '#ff3b30') : theme.primary,
      color: danger ? '#ffffff' : theme.secondary,
      fontWeight: 800,
      fontSize: 13,
      cursor: 'pointer',
    },
  };

  return (
    <div className="qc-confirm-backdrop" style={styles.backdrop} onClick={onCancel}>
      <div
        className="qc-confirm-panel"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="qc-confirm-title"
      >
        <h2 id="qc-confirm-title" style={styles.title}>{title}</h2>
        {message ? <p style={styles.message}>{message}</p> : null}
        <div style={styles.buttons}>
          <button type="button" className="qc-confirm-cancel" style={styles.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="qc-confirm-accept" style={styles.confirmBtn} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
