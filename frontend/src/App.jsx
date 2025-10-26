// frontend/src/App.jsx
// Purpose: Render a full-viewport Quantum Chess UI with a stylized title and a board-centered layout, adding top/bottom player info bars and extra bottom site spacing.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx
// Exported To: None
import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';

export default function App() {
  const [lastClick, setLastClick] = useState(null);
  const boardStageRef = useRef(null);
  const [boardSize, setBoardSize] = useState(0);

  // Placeholder player names; in the future, source from game state or props
  const whitePlayer = 'White';
  const blackPlayer = 'Black';

  useEffect(() => {
    const el = boardStageRef.current;
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
      paddingTop: 'env(safe-area-inset-top)',
      paddingRight: 'env(safe-area-inset-right)',
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', // extra bottom site space
      paddingLeft: 'env(safe-area-inset-left)',
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
    boardStack: {
      width: '100%',
      height: '100%',
      maxWidth: 'min(95vmin, 900px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'stretch',
      gap: 'clamp(8px, 1.5vh, 12px)', // little space above and below the board
      boxSizing: 'border-box',
    },
    playerBar: (side) => ({
      width: '100%',
      minHeight: 'clamp(24px, 5vh, 44px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      boxSizing: 'border-box',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      backgroundColor: theme.cardBackground,
      boxShadow: `0 4px 12px ${theme.shadow}`,
      color: theme.textSecondary,
      userSelect: 'none',
    }),
    playerName: {
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontSize: 'clamp(0.8rem, 2.2vw, 1rem)',
      color: theme.textPrimary,
    },
    capturedArea: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      opacity: 0.8,
      fontSize: '0.85rem',
    },
    boardStage: {
      width: '100%',
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      overflow: 'hidden',
    },
  };

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      <header className="qc-app-header" style={styles.appHeader}>
        <h1 className="qc-app-title" style={styles.appTitle}>Quantum Chess</h1>
      </header>

      <div className="qc-board-area" style={styles.boardArea}>
        <div className="qc-board-stack" style={styles.boardStack}>
          <div className="qc-player-bar qc-player-bar--top" style={styles.playerBar('black')} data-side="black">
            <span className="qc-player-name qc-player-name--black" style={styles.playerName}>{blackPlayer}</span>
            <div className="qc-captured-area qc-captured-area--black" style={styles.capturedArea} aria-label="Black captured pieces area">
              {/* Captured pieces (black captures) placeholder */}
            </div>
          </div>

          <div className="qc-board-stage" style={styles.boardStage} ref={boardStageRef}>
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

          <div className="qc-player-bar qc-player-bar--bottom" style={styles.playerBar('white')} data-side="white">
            <span className="qc-player-name qc-player-name--white" style={styles.playerName}>{whitePlayer}</span>
            <div className="qc-captured-area qc-captured-area--white" style={styles.capturedArea} aria-label="White captured pieces area">
              {/* Captured pieces (white captures) placeholder */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
