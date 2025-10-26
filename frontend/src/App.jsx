// frontend/src/App.jsx
// Purpose: Render a full-viewport Quantum Chess UI with a stylized title and a board that always fits without scrolling.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx
// Exported To: None
import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';

export default function App() {
  const [lastClick, setLastClick] = useState(null);
  const boardAreaRef = useRef(null);
  const [boardSize, setBoardSize] = useState(0);

  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const size = Math.floor(Math.min(rect.width, rect.height));
      setBoardSize(size);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('orientationchange', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  const styles = {
    appContainer: {
      backgroundColor: theme.background,
      color: theme.textPrimary,
      height: '100vh',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      boxSizing: 'border-box',
      gap: '0.5rem',
      overflow: 'hidden',
    },
    appHeader: {
      backgroundColor: 'transparent',
      padding: 'clamp(8px, 2vh, 16px) 12px 0 12px',
      borderRadius: 0,
      textAlign: 'center',
      width: '100%',
      boxSizing: 'border-box',
      userSelect: 'none',
    },
    appTitle: {
      margin: 0,
      fontSize: 'clamp(1.5rem, 4.5vw, 3rem)',
      fontWeight: 900,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      backgroundImage: 'linear-gradient(90deg, #61dafb, #a8b2d1 45%, #61dafb)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      textShadow: '0 2px 12px rgba(97,218,251,0.18)',
    },
    boardArea: {
      flex: 1,
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      padding: 'clamp(8px, 2vh, 16px)',
      overflow: 'hidden',
    },
  };

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      <header className="qc-app-header" style={styles.appHeader}>
        <h1 className="qc-app-title" style={styles.appTitle}>Quantum Chess</h1>
      </header>

      <div className="qc-board-area" style={styles.boardArea} ref={boardAreaRef}>
        <Board
          orientation="white"
          showCoordinates={true}
          highlights={lastClick ? [{ square: lastClick.square, color: 'rgba(97, 218, 251, 0.35)' }] : []}
          onSquareClick={(data) => setLastClick(data)}
          onSquareRightClick={(data) => setLastClick({ ...data, rightClick: true })}
          maxVisualSize={boardSize > 0 ? `${boardSize}px` : 'min(85vmin, 720px)'}
          borderColor="transparent"
          shadow="rgba(0, 0, 0, 0.15)"
        />
      </div>
    </div>
  );
}
