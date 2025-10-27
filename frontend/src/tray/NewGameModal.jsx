// frontend/src/tray/NewGameModal.jsx
// Purpose: Modal for starting a new game with various options.
// Imports From: ../theme.js
// Exported To: ../App.jsx

import React, { useState, useMemo } from 'react';
import theme from '../theme.js';

function OptionButton({ label, selected, onClick }) {
  const styles = {
    button: {
      flex: 1,
      padding: '10px 12px',
      fontSize: 14,
      fontWeight: 600,
      border: `1px solid ${theme.border}`,
      background: selected ? theme.primary : 'transparent',
      color: selected ? theme.buttonText : theme.textSecondary,
      cursor: 'pointer',
      transition: 'background 0.2s ease, color 0.2s ease',
      textAlign: 'center',
      minWidth: 80,
    },
    first: {
      borderRadius: '8px 0 0 8px',
    },
    last: {
      borderRadius: '0 8px 8px 0',
      borderLeft: 'none',
    },
    middle: {
      borderLeft: 'none',
    },
  };

  return (
    <button
      type="button"
      style={styles.button}
      onClick={onClick}
      className="qc-new-game-option-btn"
    >
      {label}
    </button>
  );
}

export default function NewGameModal({ open, onClose, onStartGame }) {
  const [gameMode, setGameMode] = useState('local'); // 'local', 'ai', 'online'
  const [aiDifficulty, setAiDifficulty] = useState('medium'); // 'easy', 'medium', 'hard'
  const [isRanked, setIsRanked] = useState(false); // boolean
  const [timeControl, setTimeControl] = useState('5+0'); // '3+0', '5+0', '10+0'

  const handleStart = () => {
    onStartGame({
      gameMode,
      aiDifficulty,
      isRanked,
      timeControl,
    });
  };

  const styles = useMemo(() => ({
    backdrop: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modal: {
      background: theme.tray.background,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: 24,
      width: 'min(90vw, 420px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      boxShadow: `0 8px 24px ${theme.shadow}`,
    },
    header: {
      fontSize: 20,
      fontWeight: 800,
      color: theme.textPrimary,
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },
    label: {
      fontSize: 13,
      fontWeight: 700,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    buttonGroup: {
      display: 'flex',
      width: '100%',
    },
    footer: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 8,
    },
    footerButton: (primary = false) => ({
      padding: '10px 20px',
      fontSize: 14,
      fontWeight: 700,
      borderRadius: 8,
      border: primary ? 'none' : `1px solid ${theme.border}`,
      background: primary ? theme.primary : 'transparent',
      color: primary ? theme.buttonText : theme.textSecondary,
      cursor: 'pointer',
    }),
  }), []);

  if (!open) return null;

  return (
    <div className="qc-modal-backdrop" style={styles.backdrop} onClick={onClose}>
      <div className="qc-modal-panel" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className="qc-modal-header" style={styles.header}>New Game</h2>

        <div className="qc-modal-section" style={styles.section}>
          <span className="qc-modal-label" style={styles.label}>Game Mode</span>
          <div className="qc-modal-button-group" style={styles.buttonGroup}>
            <OptionButton label="Local" selected={gameMode === 'local'} onClick={() => setGameMode('local')} />
            <OptionButton label="vs. AI" selected={gameMode === 'ai'} onClick={() => setGameMode('ai')} />
            <OptionButton label="Online" selected={gameMode === 'online'} onClick={() => setGameMode('online')} />
          </div>
        </div>

        {gameMode === 'ai' && (
          <div className="qc-modal-section" style={styles.section}>
            <span className="qc-modal-label" style={styles.label}>AI Difficulty</span>
            <div className="qc-modal-button-group" style={styles.buttonGroup}>
              <OptionButton label="Easy" selected={aiDifficulty === 'easy'} onClick={() => setAiDifficulty('easy')} />
              <OptionButton label="Medium" selected={aiDifficulty === 'medium'} onClick={() => setAiDifficulty('medium')} />
              <OptionButton label="Hard" selected={aiDifficulty === 'hard'} onClick={() => setAiDifficulty('hard')} />
            </div>
          </div>
        )}

        {gameMode === 'online' && (
          <>
            <div className="qc-modal-section" style={styles.section}>
              <span className="qc-modal-label" style={styles.label}>Match Type</span>
              <div className="qc-modal-button-group" style={styles.buttonGroup}>
                <OptionButton label="Unranked" selected={!isRanked} onClick={() => setIsRanked(false)} />
                <OptionButton label="Ranked" selected={isRanked} onClick={() => setIsRanked(true)} />
              </div>
            </div>
            <div className="qc-modal-section" style={styles.section}>
              <span className="qc-modal-label" style={styles.label}>Time Control</span>
              <div className="qc-modal-button-group" style={styles.buttonGroup}>
                <OptionButton label="3 + 0" selected={timeControl === '3+0'} onClick={() => setTimeControl('3+0')} />
                <OptionButton label="5 + 0" selected={timeControl === '5+0'} onClick={() => setTimeControl('5+0')} />
                <OptionButton label="10 + 0" selected={timeControl === '10+0'} onClick={() => setTimeControl('10+0')} />
              </div>
            </div>
          </>
        )}

        <div className="qc-modal-footer" style={styles.footer}>
          <button type="button" style={styles.footerButton(false)} onClick={onClose}>Cancel</button>
          <button type="button" style={styles.footerButton(true)} onClick={handleStart}>Start Game</button>
        </div>
      </div>
    </div>
  );
}
