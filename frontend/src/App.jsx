// frontend/src/App.jsx
// Purpose: Display backend API data with a manual refresh, using a relative API path so Vite's proxy routes requests to the backend.
// Imports From: ./App.css, ./theme.js
// Exported To: None
import React, { useState, useEffect } from 'react';
import './App.css'; // For global styles
import theme from './theme.js';

export default function App() {
  const [apiData, setApiData] = useState({ message: 'Loading...', timestamp: '' });
  const [error, setError] = useState('');

  const fetchApiData = () => {
    setError('');
    // Use a relative path so the Vite dev server proxy forwards to the backend
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

  // CSS-in-JS styles derived from the theme file
  const styles = {
    appContainer: {
      backgroundColor: theme.background,
      color: theme.textPrimary,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      boxSizing: 'border-box',
    },
    appHeader: {
      backgroundColor: theme.secondary,
      padding: '2rem',
      borderRadius: '12px',
      textAlign: 'center',
      marginBottom: '2rem',
      width: '100%',
      maxWidth: '600px',
    },
    appTitle: {
      color: theme.primary,
      margin: 0,
    },
    appSubtitle: {
      color: theme.textSecondary,
      margin: '0.5rem 0 0 0',
    },
    apiCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: '12px',
      padding: '2rem',
      border: `1px solid ${theme.border}`,
      boxShadow: `0 4px 12px ${theme.shadow}`,
      minWidth: '450px',
      width: '100%',
      maxWidth: '600px',
      textAlign: 'center',
    },
    apiCardTitle: {
      margin: '0 0 1rem 0',
      color: theme.textPrimary,
    },
    apiCardErrorMessage: {
      color: theme.error,
      fontFamily: 'monospace',
      margin: '1rem 0',
    },
    apiCardMessage: {
      fontFamily: 'monospace',
      fontSize: '1.25rem',
      color: theme.textSuccess,
      margin: '1rem 0',
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
      marginTop: '1.5rem',
      fontSize: '1em',
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
    </div>
  );
}
