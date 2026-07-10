// frontend/src/components/MobileNewGameSheet.jsx
// Purpose: Bottom-sheet wrapper around NewGamePanel for the narrow layout.
// Extracted from App.jsx.
// Imports From: ../theme.js, ../tray/NewGamePanel.jsx
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';
import NewGamePanel from '../tray/NewGamePanel.jsx';

export default function MobileNewGameSheet({ open, onClose, onStartGame, isPaid, onRequirePremium, auth, onOpenAccount }) {
  if (!open) return null;
  return (
    <div
      className="qc-mobile-newgame-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        className="qc-mobile-newgame-sheet"
        style={{
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: theme.cardBackground,
          borderTop: `1px solid ${theme.border}`,
          borderRadius: '14px 14px 0 0',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <NewGamePanel
          onStartGame={onStartGame}
          isPaid={isPaid}
          onRequirePremium={onRequirePremium}
          auth={auth}
          onOpenAccount={onOpenAccount}
        />
      </div>
    </div>
  );
}
