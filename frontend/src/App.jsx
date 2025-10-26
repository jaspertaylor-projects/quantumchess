// frontend/src/App.jsx
// Purpose: Render a full-viewport Quantum Chess UI with a neon intergalactic title and an interactive board; places player bars inside the board stage and keeps the side tray height equal to the rendered chessboard surface height.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx, ./chessboard/useQuantumGameState.js, ./settings/SettingsModal.jsx, ./settings/usePieceColors.js, ./settings/useBoardColors.js, ./store/gameSlice.js, ./tray/SideTray.jsx
// Exported To: None
import React, { useEffect, useRef, useState, useMemo } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';
import useQuantumGameState from './chessboard/useQuantumGameState.js';
import SettingsModal from './settings/SettingsModal.jsx';
import usePieceColors from './settings/usePieceColors.js';
import useBoardColors from './settings/useBoardColors.js';
import SideTray from './tray/SideTray.jsx';
import { useDispatch } from 'react-redux';
import { addMove } from './store/gameSlice.js';

export default function App() {
  const boardStageRef = useRef(null);
  const topBarRef = useRef(null);
  const bottomBarRef = useRef(null);
  const [boardSize, setBoardSize] = useState(0);
  const [trayHeight, setTrayHeight] = useState(0);

  const { pieces, getPieceAtSquare, getLegalMoves, movePiece } = useQuantumGameState();

  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trayHighlights, setTrayHighlights] = useState([]);

  const { whiteColors, blackColors, setWhiteColors, setBlackColors, resetColors, svgStyles } = usePieceColors();
  const { boardColors, setBoardColors, resetBoardColors } = useBoardColors();

  const dispatch = useDispatch();

  const selectedMoves = useMemo(() => {
    if (!selectedId) return [];
    return getLegalMoves(selectedId);
  }, [selectedId, getLegalMoves]);

  const whitePlayer = 'White';
  const blackPlayer = 'Black';

  useEffect(() => {
    const el = boardStageRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const rawWidth = rect.width;
      let rawHeight = rect.height;

      const topH = topBarRef.current ? topBarRef.current.getBoundingClientRect().height : 0;
      const bottomH = bottomBarRef.current ? bottomBarRef.current.getBoundingClientRect().height : 0;
      const verticalGaps = 16;
      const availableHeight = Math.max(0, rawHeight - topH - bottomH - verticalGaps);

      const size = Math.floor(Math.min(rawWidth, availableHeight));
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
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
      paddingLeft: 'env(safe-area-inset-left)',
      boxSizing: 'border-box',
      gap: '0.5rem',
      overflow: 'hidden',
    },
    appHeader: {
      backgroundColor: 'transparent',
      padding: 'clamp(10px, 2.2vh, 18px) 12px 0 12px',
      borderRadius: 0,
      textAlign: 'center',
      width: '100%',
      boxSizing: 'border-box',
      userSelect: 'none',
    },
    appTitleWrap: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      boxSizing: 'border-box',
      padding: '4px 8px',
    },
    appTitleRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'clamp(8px, 1.6vw, 16px)',
      padding: 'clamp(6px, 0.8vw, 10px) clamp(10px, 1.8vw, 16px)',
      borderRadius: 14,
      background: 'linear-gradient(180deg, rgba(40,44,52,0.55), rgba(32,35,42,0.55))',
      boxShadow: '0 0 0 1px rgba(97,218,251,0.18) inset, 0 8px 24px rgba(0,0,0,0.35), 0 0 64px rgba(180,0,255,0.16)',
      backdropFilter: 'blur(6px)',
    },
    appTitleIcon: {
      width: 'clamp(24px, 4.5vw, 40px)',
      height: 'clamp(24px, 4.5vw, 40px)',
      objectFit: 'contain',
      filter: 'drop-shadow(0 0 6px rgba(0,245,255,0.65)) drop-shadow(0 0 10px rgba(255,59,127,0.4))',
      transform: 'translateZ(0)',
    },
    appTitleText: {
      margin: 0,
      fontSize: 'clamp(1.6rem, 5vw, 3.2rem)',
      fontWeight: 1000,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      backgroundImage: 'linear-gradient(90deg, #00f5ff 0%, #b400ff 38%, #ff3b7f 64%, #00f5ff 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      textShadow: [
        '0 0 6px rgba(0,245,255,0.45)',
        '0 0 12px rgba(180,0,255,0.35)',
        '0 0 22px rgba(255,59,127,0.35)'
      ].join(', '),
      lineHeight: 1.1,
    },
    appTitleUnderline: {
      marginTop: '8px',
      height: '3px',
      width: 'min(72vw, 640px)',
      background: 'linear-gradient(90deg, rgba(0,245,255,0) 0%, rgba(0,245,255,0.8) 16%, rgba(180,0,255,0.95) 50%, rgba(255,59,127,0.8) 84%, rgba(255,59,127,0) 100%)',
      borderRadius: 3,
      boxShadow: '0 0 18px rgba(180,0,255,0.45), 0 0 28px rgba(0,245,255,0.25)',
      alignSelf: 'center',
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
      maxWidth: 'min(95vmin, 1200px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'stretch',
      gap: '8px',
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
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      boxSizing: 'border-box',
      overflow: 'hidden',
    },
    boardRow: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
  };

  const handleSquareClick = (data) => {
    const { square } = data;
    const piece = getPieceAtSquare(square);

    if (piece) {
      setSelectedId(piece.id);
      setTrayHighlights([]);
      return;
    }

    if (selectedId) {
      const legal = new Set(getLegalMoves(selectedId));
      if (legal.has(square)) {
        const movingPiece = pieces.find((p) => p.id === selectedId);
        const fromSquare = movingPiece && movingPiece.square ? movingPiece.square : null;
        movePiece(selectedId, square);
        if (fromSquare) {
          dispatch(addMove({ from: fromSquare, to: square }));
        }
        setSelectedId(null);
      } else {
        setSelectedId(null);
      }
    }
  };

  const handlePieceClick = ({ id }) => {
    setSelectedId(id);
    setTrayHighlights([]);
  };

  const baseHighlights = useMemo(() => {
    const list = [];
    if (selectedId) {
      const piece = pieces.find((p) => p.id === selectedId);
      if (piece && piece.square) {
        list.push({ square: piece.square, color: 'rgba(97, 218, 251, 0.35)' });
      }
      for (const sq of selectedMoves) {
        list.push({ square: sq, color: 'rgba(255, 206, 84, 0.35)' });
      }
    }
    return list;
  }, [selectedId, selectedMoves, pieces]);

  const combinedHighlights = useMemo(() => {
    if (!trayHighlights || trayHighlights.length === 0) return baseHighlights;
    return [...baseHighlights, ...trayHighlights];
  }, [baseHighlights, trayHighlights]);

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      <header className="qc-app-header" style={styles.appHeader}>
        <div className="qc-app-title-wrap" style={styles.appTitleWrap}>
          <div className="qc-app-title-row" style={styles.appTitleRow}>
            <img
              className="qc-app-title-icon"
              style={styles.appTitleIcon}
              src="/src/public/favicon.ico"
              alt="Quantum Chess neon knight icon"
              decoding="async"
              fetchpriority="high"
            />
            <h1 className="qc-app-title-text" style={styles.appTitleText}>Quantum Chess</h1>
          </div>
        </div>
        <div className="qc-app-title-underline" style={styles.appTitleUnderline} />
      </header>

      <div className="qc-board-area" style={styles.boardArea}>
        <div className="qc-board-stack" style={styles.boardStack}>
          <div className="qc-board-stage" style={styles.boardStage} ref={boardStageRef}>
            <div
              className="qc-player-bar qc-player-bar--top"
              style={styles.playerBar('black')}
              data-side="black"
              ref={topBarRef}
            >
              <span className="qc-player-name qc-player-name--black" style={styles.playerName}>{blackPlayer}</span>
              <div className="qc-captured-area qc-captured-area--black" style={styles.capturedArea} aria-label="Black captured pieces area">
                {/* Captured pieces (black captures) placeholder */}
              </div>
            </div>

            <div className="qc-board-row" style={styles.boardRow}>
              <Board
                orientation="white"
                showCoordinates={true}
                highlights={combinedHighlights}
                onSquareClick={handleSquareClick}
                onSquareRightClick={() => {}}
                onPieceClick={handlePieceClick}
                pieces={pieces}
                selectedId={selectedId}
                maxVisualSize={boardSize > 0 ? `${boardSize}px` : 'min(85vmin, 720px)'}
                borderColor="transparent"
                shadow="rgba(0, 0, 0, 0.15)"
                pieceSvgStyles={svgStyles}
                onResize={(px) => setTrayHeight(px)}
                squareColors={boardColors}
              />

              <SideTray
                height={trayHeight}
                onOpenSettings={() => setSettingsOpen(true)}
                onSetHighlights={(arr) => setTrayHighlights(Array.isArray(arr) ? arr : [])}
                onClearHighlights={() => setTrayHighlights([])}
              />
            </div>

            <div
              className="qc-player-bar qc-player-bar--bottom"
              style={styles.playerBar('white')}
              data-side="white"
              ref={bottomBarRef}
            >
              <span className="qc-player-name qc-player-name--white" style={styles.playerName}>{whitePlayer}</span>
              <div className="qc-captured-area qc-captured-area--white" style={styles.capturedArea} aria-label="White captured pieces area">
                {/* Captured pieces (white captures) placeholder */}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        whiteColors={whiteColors}
        blackColors={blackColors}
        boardColors={boardColors}
        onChangeWhite={setWhiteColors}
        onChangeBlack={setBlackColors}
        onChangeBoard={setBoardColors}
        onReset={() => { resetColors(); resetBoardColors(); }}
      />
    </div>
  );
}
