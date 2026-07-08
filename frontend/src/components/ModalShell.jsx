// frontend/src/components/ModalShell.jsx
// Purpose: Shared modal chrome — the fixed scrim backdrop, the centered panel
// with dialog semantics (role + aria-modal), click-on-panel stopPropagation,
// optional click-backdrop-to-close, and Escape-to-close (only for modals that
// close on backdrop click). Each modal keeps its own panel look via
// panelStyle/panelClassName and its own stacking order via zIndex.
// Imports From: ../theme.js
// Exported To: ./ConfirmModal.jsx, ./WinnerModal.jsx, ./EnPassantChoiceModal.jsx,
//   ../settings/SettingsModal.jsx, ../tray/RulesModal.jsx,
//   ../tutorial/TutorialModal.jsx, ../review/ReviewModal.jsx,
//   ../account/AccountModal.jsx, ../puzzle/DailyPuzzleModal.jsx,
//   ../puzzle/MinedPuzzleModal.jsx

import React, { useEffect } from 'react';
import theme from '../theme.js';

export default function ModalShell({
  open = true, // most modals unmount when closed; WinnerModal stays mounted and hides
  onClose = null,
  closeOnBackdrop = false,
  escapeToClose = null, // defaults to closeOnBackdrop; pass false when the modal runs its own key handler (ReviewModal)
  zIndex = 1000,
  role = 'dialog', // ConfirmModal passes 'alertdialog'
  ariaLabel = null,
  ariaLabelledBy = null,
  backdropClassName = null,
  panelClassName = null,
  panelStyle = null,
  children,
}) {
  const escapeCloses = escapeToClose === null ? closeOnBackdrop : escapeToClose;

  useEffect(() => {
    if (!open || !escapeCloses || !onClose) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, escapeCloses, onClose]);

  const backdropStyle = {
    position: 'fixed',
    inset: 0,
    background: theme.scrim,
    display: open ? 'flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex,
  };

  return (
    <div
      className={backdropClassName || undefined}
      style={backdropStyle}
      onClick={closeOnBackdrop && onClose ? onClose : undefined}
      aria-hidden={open ? undefined : true}
    >
      <div
        className={panelClassName || undefined}
        style={panelStyle || undefined}
        onClick={(e) => e.stopPropagation()}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel || undefined}
        aria-labelledby={ariaLabelledBy || undefined}
      >
        {children}
      </div>
    </div>
  );
}
