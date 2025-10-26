// frontend/src/App.jsx
// Purpose: Display backend API data and render a responsive chessboard that reports click coordinates.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx
// Exported To: None
import React, { useState, useEffect } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';

export default function App() {
  const [apiData, setApiData] = useState({ message: 'Loading...', timestamp: '' });
  const [error, setError] = useState('');
  const [lastClick, setLastClick] = useState(null);

  const fetchApiData = () => {
    setError('');
    fetch('/api/hello')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch from API');
        return res.json();
      })
      .then((data) => setApiData(data))
      .catch((err) => setError(`Error: ${err.message}. Is the backend running?`));
  };

  useEffect(() => {
    fetchApiData();
  }, []);

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
    contentRow: {
      width: '100%',
      maxWidth: '1100px',
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '1.5rem',
      alignItems: 'start',
      justifyItems: 'center',
    },
    apiCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: '12px',
      padding: '1.5rem',
      border: `1px solid ${theme.border}`,
      boxShadow: `0 4px 12px ${theme.shadow}`,
      minWidth: '280px',
      width: '100%',
      maxWidth: '900px',
      textAlign: 'center',
      boxSizing: 'border-box',
    },
    apiCardTitle: {
      margin: '0 0 1rem 0',
      color: theme.textPrimary,
      fontSize: '1.25rem',
    },
    apiCardErrorMessage: {
      color: theme.error,
      fontFamily: 'monospace',
      margin: '1rem 0',
    },
    apiCardMessage: {
      fontFamily: 'monospace',
      fontSize: '1.1rem',
      color: theme.textSuccess,
      margin: '0.75rem 0',
      wordBreak: 'break-word',
    },
    apiCardTimestamp: {
      fontSize: '0.9rem',
      color: theme.textMuted,
    },
    apiCardRefreshButton: {
      backgroundColor: theme.buttonBackground,
      color: theme.buttonText,
      border: 'none',
      padding: '10px 20px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: 'bold',
      marginTop: '1rem',
      fontSize: '1em',
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
    <div className="app-container" style={styles.appContainer}>
      <header className="app-header" style={styles.appHeader}>
        <h1 className="app-title" style={styles.appTitle}>
          Full-Stack Docker App
        </h1>
        <p className="app-subtitle" style={styles.appSubtitle}>
          FastAPI + React with Hot-Reloading Tset
        </p>
      </header>

      <div className="content-row" style={styles.contentRow}>
        <main className="api-card" style={styles.apiCard}>
          <h2 className="api-card__title" style={styles.apiCardTitle}>
            Message from Backend
          </h2>
          {error ? (
            <p className="api-card__error-message" style={styles.apiCardErrorMessage}>
              {error}
            </p>
          ) : (
            <>
              <p className="api-card__message" style={styles.apiCardMessage}>
                "{apiData.message}"
              </p>
              <p className="api-card__timestamp" style={styles.apiCardTimestamp}>
                Timestamp: {apiData.timestamp}
              </p>
            </>
          )}
          <button
            className="api-card__refresh-button"
            style={styles.apiCardRefreshButton}
            onClick={fetchApiData}
          >
            Refresh Data
          </button>
        </main>

        <section className="board-panel" style={styles.boardPanel}>
          <h2 className="board-panel__title" style={styles.boardHeader}>Quantum Chessboard</h2>
          <Board
            orientation="white"
            showCoordinates={true}
            highlights={lastClick ? [{ square: lastClick.square, color: 'rgba(97, 218, 251, 0.35)' }] : []}
            onSquareClick={(data) => setLastClick(data)}
            onSquareRightClick={(data) => setLastClick({ ...data, rightClick: true })}
            maxVisualSize="min(85vmin, 720px)"
          />
          <div className="board-panel__click-readout" style={styles.clickReadout}>
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
    </div>
  );
}
