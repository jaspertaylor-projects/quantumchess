// frontend/src/components/ConfirmModal.jsx
// Purpose: In-app confirmation dialog (resign, draw offers, ending a game)
// replacing native browser confirm() popups.
// Imports From: ../theme.js, ./ModalShell.jsx
// Exported To: ../App.jsx

import React from 'react';
import { Flag, Handshake } from 'lucide-react';
import theme from '../theme.js';
import ModalShell from './ModalShell.jsx';

export default function ConfirmModal({
  open = false,
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  variant = null,
  onConfirm = () => {},
  onCancel = () => {},
}) {
  if (!open) return null;

  const kind = variant || (danger ? 'resign' : 'draw');
  const isDraw = kind === 'draw' || kind === 'draw-declined';
  const accent = isDraw ? '#7fe7ff' : '#ff6b6b';
  const accentSoft = isDraw ? 'rgba(127, 231, 255, 0.18)' : 'rgba(255, 107, 107, 0.18)';
  const accentGlow = isDraw ? 'rgba(82, 199, 255, 0.32)' : 'rgba(255, 76, 96, 0.32)';
  const Emblem = isDraw ? Handshake : Flag;
  const eyebrow = kind === 'draw-declined'
    ? 'Offer answered'
    : isDraw ? 'Peace across the board'
      : kind === 'end-game' ? 'Leave this branch' : 'Concede the game';

  const styles = {
    panel: {
      width: 'min(92vw, 410px)',
      borderRadius: 18,
      border: `1px solid ${accent}73`,
      background: `radial-gradient(circle at 50% -15%, ${accentSoft}, transparent 46%), linear-gradient(155deg, rgba(24, 29, 42, 0.99), rgba(9, 12, 20, 0.99))`,
      boxShadow: `0 22px 55px ${theme.shadow}, 0 0 28px ${accentGlow}, inset 0 1px 0 rgba(255,255,255,0.07)`,
      color: theme.textPrimary,
      padding: '22px 22px 20px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 11,
      overflow: 'hidden',
      animation: 'qc-confirm-panel-in 220ms cubic-bezier(.2,.8,.2,1) both',
    },
    emblem: {
      position: 'relative',
      width: 70,
      height: 70,
      display: 'grid',
      placeItems: 'center',
      borderRadius: '50%',
      color: accent,
      background: `radial-gradient(circle, ${accentSoft} 0 42%, rgba(9,12,20,0.9) 44% 58%, ${accentSoft} 60% 61%, transparent 63%)`,
      filter: `drop-shadow(0 0 10px ${accentGlow})`,
    },
    eyebrow: {
      marginTop: -3,
      color: accent,
      fontSize: 10,
      fontWeight: 900,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
    },
    title: {
      margin: 0,
      fontSize: 'clamp(1.18rem, 4vw, 1.42rem)',
      fontWeight: 900,
      letterSpacing: '0.015em',
      textAlign: 'center',
    },
    message: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.55,
      color: theme.textSecondary,
      textAlign: 'center',
      width: '100%',
      padding: '11px 13px',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 11,
      background: 'rgba(255,255,255,0.035)',
      boxSizing: 'border-box',
    },
    buttons: {
      display: 'flex',
      justifyContent: 'stretch',
      gap: 10,
      marginTop: 3,
      width: '100%',
    },
    cancelBtn: {
      flex: '1 1 0',
      minHeight: 42,
      padding: '9px 14px',
      borderRadius: 10,
      border: `1px solid ${theme.border}`,
      background: 'rgba(255,255,255,0.035)',
      color: theme.textPrimary,
      fontWeight: 800,
      fontSize: 13,
      cursor: 'pointer',
    },
    confirmBtn: {
      flex: '1 1 0',
      minHeight: 42,
      padding: '9px 16px',
      borderRadius: 10,
      border: `1px solid ${accent}`,
      background: `linear-gradient(135deg, ${accent}, ${isDraw ? '#9b83ff' : '#d73555'})`,
      color: isDraw ? '#07131a' : '#ffffff',
      boxShadow: `0 5px 18px ${accentGlow}`,
      fontWeight: 900,
      fontSize: 13,
      cursor: 'pointer',
    },
  };

  return (
    <ModalShell
      onClose={onCancel}
      closeOnBackdrop
      zIndex={1002}
      role="alertdialog"
      ariaLabelledBy="qc-confirm-title"
      backdropClassName="qc-confirm-backdrop"
      panelClassName="qc-confirm-panel"
      panelStyle={styles.panel}
    >
      <div className={`qc-confirm-emblem qc-confirm-emblem--${kind}`} style={styles.emblem} aria-hidden="true">
        <span className="qc-confirm-emblem__orbit" />
        <Emblem size={29} strokeWidth={2.1} />
      </div>
      <div style={styles.eyebrow}>{eyebrow}</div>
      <h2 id="qc-confirm-title" style={styles.title}>{title}</h2>
      {message ? <p style={styles.message}>{message}</p> : null}
      <div style={styles.buttons}>
        {cancelLabel ? (
          <button type="button" className="qc-confirm-cancel" style={styles.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
        ) : null}
        <button type="button" className="qc-confirm-accept" style={styles.confirmBtn} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
