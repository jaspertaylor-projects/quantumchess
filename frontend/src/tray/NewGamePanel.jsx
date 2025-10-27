// frontend/src/tray/NewGamePanel.jsx
// Purpose: Renders the new game configuration options within the side tray.
// Imports From: ../theme.js
// Exported To: ./SideTray.jsx

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

export default function NewGamePanel({ onStartGame, onCancel }) {
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
    panel: {
      padding: 16,
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      boxSizing: 'border-box',
      overflowY: 'auto',
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
    animatedSectionContainer: {
      position: 'relative',
      flex: 1,
      minHeight: 150, // Ensure space for animated content
    },
    animatedSection: (visible) => ({
      position: 'absolute',
      width: '100%',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(-10px)',
      transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
      pointerEvents: visible ? 'auto' : 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }),
    footer: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 'auto', // Pushes footer to the bottom
      paddingTop: 16,
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

  return (
    <div className="qc-new-game-panel" style={styles.panel}>
      <div className="qc-new-game-section" style={styles.section}>
        <span className="qc-new-game-label" style={styles.label}>Game Mode</span>
        <div className="qc-new-game-button-group" style={styles.buttonGroup}>
          <OptionButton label="Local" selected={gameMode === 'local'} onClick={() => setGameMode('local')} />
          <OptionButton label="vs. AI" selected={gameMode === 'ai'} onClick={() => setGameMode('ai')} />
          <OptionButton label="Online" selected={gameMode === 'online'} onClick={() => setGameMode('online')} />
        </div>
      </div>

      <div className="qc-animated-section-container" style={styles.animatedSectionContainer}>
        <div className="qc-animated-section-ai" style={styles.animatedSection(gameMode === 'ai')}>
          <div className="qc-new-game-section" style={styles.section}>
            <span className="qc-new-game-label" style={styles.label}>AI Difficulty</span>
            <div className="qc-new-game-button-group" style={styles.buttonGroup}>
              <OptionButton label="Easy" selected={aiDifficulty === 'easy'} onClick={() => setAiDifficulty('easy')} />
              <OptionButton label="Medium" selected={aiDifficulty === 'medium'} onClick={() => setAiDifficulty('medium')} />
              <OptionButton label="Hard" selected={aiDifficulty === 'hard'} onClick={() => setAiDifficulty('hard')} />
            </div>
          </div>
        </div>

        <div className="qc-animated-section-online" style={styles.animatedSection(gameMode === 'online')}>
          <div className="qc-new-game-section" style={styles.section}>
            <span className="qc-new-game-label" style={styles.label}>Match Type</span>
            <div className="qc-new-game-button-group" style={styles.buttonGroup}>
              <OptionButton label="Unranked" selected={!isRanked} onClick={() => setIsRanked(false)} />
              <OptionButton label="Ranked" selected={isRanked} onClick={() => setIsRanked(true)} />
            </div>
          </div>
          <div className="qc-new-game-section" style={styles.section}>
            <span className="qc-new-game-label" style={styles.label}>Time Control</span>
            <div className="qc-new-game-button-group" style={styles.buttonGroup}>
              <OptionButton label="3 + 0" selected={timeControl === '3+0'} onClick={() => setTimeControl('3+0')} />
              <OptionButton label="5 + 0" selected={timeControl === '5+0'} onClick={() => setTimeControl('5+0')} />
              <OptionButton label="10 + 0" selected={timeControl === '10+0'} onClick={() => setTimeControl('10+0')} />
            </div>
          </div>
        </div>
      </div>

      <div className="qc-new-game-footer" style={styles.footer}>
        <button type="button" style={styles.footerButton(false)} onClick={onCancel}>Cancel</button>
        <button type="button" style={styles.footerButton(true)} onClick={handleStart}>Start Game</button>
      </div>
    </div>
  );
}
