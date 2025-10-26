// frontend/src/App.jsx
// Purpose: Render the Quantum Chess board UI without backend demo messaging or Docker scaffold text.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx
// Exported To: None
import React, { useState } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';

export default function App() {
  const [lastClick, setLastClick] = useState(null);

  const styles = {
    appContainer: {
      backgroundColor: theme.background,
      color: theme.textPrimary,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '2rem 1rem 4rem 1rem',
      boxSizing: 'border-box',
      gap: '1.5rem',
    },
    appHeader: {
      backgroundColor: theme.secondary,
      padding: '1.5rem',
      borderRadius: '12px',
      textAlign: 'center',
      width: '100%',
      maxWidth: '900px',
      boxSizing: 'border-box',
    },
    appTitle: {
      color: theme.primary,
      margin: 0,
      fontSize: '1.75rem',
    },
    appSubtitle: {
      color: theme.textSecondary,
      margin: '0.5rem 0 0 0',
    },
    boardPanel: {
      backgroundColor: theme.cardBackground,
      borderRadius: '12px',
      padding: '1rem',
      border: `1px solid ${theme.border}`,
      boxShadow: `0 4px 12px ${theme.shadow}`,
      width: '100%',
      maxWidth: '1100px',
      boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '1rem',
      justifyItems: 'center',
    },
    boardHeader: {
      margin: 0,
      color: theme.textPrimary,
      fontSize: '1.25rem',
      textAlign: 'center',
    },
    clickReadout: {
      backgroundColor: 'rgba(255,255,255,0.03)',
      border: `1px dashed ${theme.border}`,
      borderRadius: 8,
      padding: '0.75rem',
      width: '100%',
      maxWidth: '900px',
      color: theme.textSecondary,
      fontFamily: 'monospace',
      fontSize: '0.95rem',
      boxSizing: 'border-box',
      textAlign: 'center',
    },
  };

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      <header className="qc-app-header" style={styles.appHeader}>
        <h1 className="qc-app-title" style={styles.appTitle}>
          Quantum Chess
        </h1>
        <p className="qc-app-subtitle" style={styles.appSubtitle}>
          Superposition pieces that collapse as they move.
        </p>
      </header>

      <section className="qc-board-panel" style={styles.boardPanel}>
        <h2 className="qc-board-panel__title" style={styles.boardHeader}>Board</h2>
        <Board
          orientation="white"
          showCoordinates={true}
          highlights={lastClick ? [{ square: lastClick.square, color: 'rgba(97, 218, 251, 0.35)' }] : []}
          onSquareClick={(data) => setLastClick(data)}
          onSquareRightClick={(data) => setLastClick({ ...data, rightClick: true })}
          maxVisualSize="min(85vmin, 720px)"
        />
        <div className="qc-board-panel__click-readout" style={styles.clickReadout}>
          {lastClick ? (
            <span>
              Clicked: {lastClick.square} | fileIndex: {lastClick.fileIndex} | rankIndex: {lastClick.rankIndex} | index: {lastClick.index}
            </span>
          ) : (
            <span>Click any square to see its coordinates.</span>
          )}
        </div>
      </section>
    </div>
  );
}
