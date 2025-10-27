// frontend/src/App.jsx
// Purpose: Render the Quantum Chess UI with a responsive layout, integrate the full board timeline, allow seeking through move history, and block moves unless viewing the latest snapshot. Adds threat overlays, castling support, move-into-check prevention feedback, and a checkmate winner popup.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx, ./chessboard/useQuantumGameState.js, ./settings/SettingsModal.jsx, ./settings/usePieceColors.js, ./settings/useBoardColors.js, ./settings/usePlayerBarColors.js, ./tray/SideTray.jsx, ./tray/RulesModal.jsx, ./store/gameSlice.js, ./store/settingsSlice.js, ./chessboard/rasterPrewarm.js, ./chessboard/RasterizedSvgImg.jsx, ./assets/*.svg
// Exported To: None
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';
import useQuantumGameState from './chessboard/useQuantumGameState.js';
import SettingsModal from './settings/SettingsModal.jsx';
import usePieceColors, { DEFAULT_WHITE, DEFAULT_BLACK } from './settings/usePieceColors.js';
import useBoardColors, { DEFAULT_BOARD } from './settings/useBoardColors.js';
import usePlayerBarColors, { DEFAULT_PLAYER_BAR_COLORS } from './settings/usePlayerBarColors.js';
import SideTray from './tray/SideTray.jsx';
import RulesModal from './tray/RulesModal.jsx';
import { useDispatch, useSelector } from 'react-redux';
import { addMove, resetGame } from './store/gameSlice.js';
import { setGameSettings } from './store/settingsSlice.js';
import { prewarmAllPiecePngs, invalidateRasterPngs } from './chessboard/rasterPrewarm.js';
import RasterizedSvgImg from './chessboard/RasterizedSvgImg.jsx';

// Single-type SVG asset URLs used for captured-piece icons and header fallbacks
import imgP from './assets/p.svg?url';
import imgN from './assets/n.svg?url';
import imgB from './assets/b.svg?url';
import imgR from './assets/r.svg?url';
import imgQ from './assets/q.svg?url';
import imgK from './assets/k.svg?url';

const TYPE_TO_SVG = {
  p: imgP,
  n: imgN,
  b: imgB,
  r: imgR,
  q: imgQ,
  k: imgK,
};

// Public stylish PNGs served by Vite from /src/public
const TYPE_TO_STYLISH_PNG = {
  p: '/src/public/stylish_pawn.png',
  n: '/src/public/stylish_knight.png',
  b: '/src/public/stylish_bishop.png',
  r: '/src/public/stylish_rook.png',
  q: '/src/public/stylish_queen.png',
  k: '/src/public/stylish_king.png',
};

export default function App() {
  const boardStageRef = useRef(null);
  const topBarRef = useRef(null);
  const bottomBarRef = useRef(null);
  const [boardSize, setBoardSize] = useState(0);
  const [trayHeight, setTrayHeight] = useState(0);

  const {
    pieces,
    sideToMove,
    getPieceAtSquare,
    getLegalMoves,
    movePiece,
    checkingSquaresBySide,
    canCastleBetween,
    castlePieces,
    // timeline
    viewIndex,
    historyLength,
    setViewIndex,
    canMakeMove,
    // game state
    gameOver,
    winner,
  } = useQuantumGameState();

  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [trayHighlights, setTrayHighlights] = useState([]);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [showCheckOverlay, setShowCheckOverlay] = useState(true);
  const [infoMessage, setInfoMessage] = useState('');
  const [showWinPopup, setShowWinPopup] = useState(false);

  const { whiteColors, blackColors, setWhiteColors, setBlackColors, svgStyles } = usePieceColors();
  const { boardColors, setBoardColors } = useBoardColors();
  const { playerBarColors, setPlayerBarColors } = usePlayerBarColors();

  const dispatch = useDispatch();
  const userTeam = useSelector((state) => state.game.userTeam || 'white');

  const selectedMoves = useMemo(() => {
    if (!selectedId) return [];
    return getLegalMoves(selectedId);
  }, [selectedId, getLegalMoves]);

  const whitePlayer = 'White';
  const blackPlayer = 'Black';
  const whiteRating = '????';
  const blackRating = '????';

  useEffect(() => {
    const el = boardStageRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const rawWidth = Math.floor(rect.width);
      let rawHeight = Math.floor(rect.height);

      const topH = topBarRef.current ? Math.ceil(topBarRef.current.getBoundingClientRect().height) : 0;
      const bottomH = bottomBarRef.current ? Math.ceil(bottomBarRef.current.getBoundingClientRect().height) : 0;
      const verticalGaps = 16; // matches boardStack gap + padding
      const availableHeight = Math.max(0, rawHeight - topH - bottomH - verticalGaps);

      const rawSize = Math.min(rawWidth, availableHeight);
      const cell = Math.max(1, Math.floor(rawSize / 8));
      const quantizedSize = cell * 8; // snap to 8px grid to avoid subpixel cells
      setBoardSize(quantizedSize);
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

  const currentPieceSize = useMemo(() => {
    if (!boardSize || boardSize <= 0) return 64;
    return Math.max(8, Math.floor(boardSize / 8));
  }, [boardSize]);

  // Prewarm for current size to avoid jank during play; does not invalidate caches.
  useEffect(() => {
    if (!currentPieceSize || currentPieceSize <= 0) return;
    prewarmAllPiecePngs({ cssVarsBySide: svgStyles, sizes: [currentPieceSize, 64, 26], renderHint: currentPieceSize <= 56 ? 'crisp' : 'precision' });
  }, [currentPieceSize, svgStyles]);

  // Show winner popup when game ends
  useEffect(() => {
    if (gameOver) {
      setShowWinPopup(true);
    }
  }, [gameOver]);

  // Header sizing: header height is ~1.5x title font size via CSS variable
  const TITLE_SIZE_CSS = 'clamp(1.6rem, 5vw, 3.2rem)';

  const styles = {
    appContainer: {
      backgroundColor: theme.boardAreaBackground,
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
      backgroundColor: '#000',
      padding: '0 clamp(8px, 1.5vw, 16px)',
      borderRadius: 0,
      textAlign: 'center',
      width: '100%',
      boxSizing: 'border-box',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      ['--qc-title-size']: TITLE_SIZE_CSS,
      height: 'calc(var(--qc-title-size) * 1.5)',
      minHeight: 'calc(var(--qc-title-size) * 1.5)',
      maxHeight: 'calc(var(--qc-title-size) * 1.5)',
      flex: '0 0 auto',
    },
    appTitleWrap: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      padding: 0,
      flex: '1 1 auto',
      overflow: 'hidden',
    },
    appTitleRow: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
      alignItems: 'center',
      gap: 'clamp(8px, 1.2vw, 16px)',
      padding: 0,
      borderRadius: 0,
      backgroundColor: 'transparent',
      width: '100%',
      margin: 0,
      height: '100%',
    },
    appTitleCenterGroup: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'clamp(6px, 1vw, 10px)',
      flex: '0 1 auto',
      minWidth: 0,
      backgroundColor: 'transparent',
      padding: 0,
      borderRadius: 0,
      height: '100%',
    },
    titleStrip: (side) => ({
      display: 'flex',
      alignItems: 'center',
      justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
      gap: 'clamp(6px, 1vw, 12px)',
      width: '100%',
      minWidth: 0,
      height: '100%',
      overflow: 'hidden',
    }),
    titleIconWrap: {
      height: '100%',
      aspectRatio: '1 / 1',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      overflow: 'hidden',
      pointerEvents: 'none',
    },
    appTitleText: {
      margin: 0,
      fontSize: 'var(--qc-title-size)',
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
      lineHeight: 1,
      display: 'inline-block',
      alignSelf: 'center',
      whiteSpace: 'nowrap',
    },
    appTitleUnderline: {
      marginTop: '4px',
      height: '3px',
      width: '100%',
      background: 'linear-gradient(90deg, rgba(0,245,255,0) 0%, rgba(0,245,255,0.8) 16%, rgba(180,0,255,0.95) 50%, rgba(255,59,127,0.8) 84%, rgba(255,59,127,0) 100%)',
      borderRadius: 3,
      boxShadow: '0 0 18px rgba(180,0,255,0.45), 0 0 28px rgba(0,245,255,0.25)',
      alignSelf: 'center',
      flex: '0 0 auto',
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
      backgroundColor: theme.boardAreaBackground,
    },
    boardStack: {
      width: '100%',
      height: '100%',
      maxWidth: 'min(96vmin, 1200px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'stretch',
      gap: '8px',
      boxSizing: 'border-box',
    },
    playerBar: () => {
      const bg = playerBarColors.background;
      const txt = playerBarColors.text;
      return {
        width: '100%',
        minHeight: 'clamp(36px, 6.5vh, 64px)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        padding: '0 12px',
        boxSizing: 'border-box',
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        backgroundColor: bg,
        boxShadow: `0 4px 12px ${theme.shadow}`,
        color: txt,
        userSelect: 'none',
      };
    },
    playerInfo: {
      display: 'grid',
      gridTemplateRows: '1fr 1fr',
      alignItems: 'stretch',
      justifyItems: 'start',
      height: '100%',
      flex: '1 1 auto',
      padding: '4px 6px',
      boxSizing: 'border-box',
      minWidth: 0,
    },
    playerNameRow: {
      display: 'flex',
      alignItems: 'flex-end',
      height: '100%',
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontSize: 'clamp(0.9rem, 2.2vw, 1.1rem)',
      color: 'currentColor',
      lineHeight: 1,
    },
    playerRatingRow: {
      display: 'flex',
      alignItems: 'flex-start',
      height: '100%',
      fontWeight: 600,
      letterSpacing: '0.03em',
      fontSize: 'clamp(0.72rem, 1.8vw, 0.95rem)',
      color: 'currentColor',
      opacity: 0.82,
      lineHeight: 1,
    },
    capturedArea: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
      opacity: 0.9,
      fontSize: '0.9rem',
      flex: '0 1 auto',
      height: '100%',
      maxHeight: '100%',
    },
    capturedIconWrap: {
      height: '95%',
      aspectRatio: '1 / 1',
      width: 'auto',
      display: 'grid',
      placeItems: 'center',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
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
    winnerOverlay: {
      position: 'fixed',
      inset: 0,
      display: showWinPopup ? 'flex' : 'none',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
      zIndex: 9999,
    },
    winnerModal: {
      backgroundColor: '#111',
      color: '#fff',
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      boxShadow: `0 12px 32px ${theme.shadow}`,
      padding: '20px 24px',
      width: 'min(90vw, 420px)',
      display: 'grid',
      gap: 12,
      textAlign: 'center',
    },
    winnerTitle: {
      fontSize: '1.2rem',
      fontWeight: 800,
      letterSpacing: '0.02em',
      margin: 0,
    },
    winnerSub: {
      fontSize: '0.95rem',
      opacity: 0.9,
      margin: 0,
    },
    winnerButtonRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginTop: 8,
    },
    primaryBtn: {
      padding: '10px 16px',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.15)',
      backgroundColor: '#1f51ff',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
    },
  };

  const HeaderPieceIcon = ({ t }) => {
    const [useFallback, setUseFallback] = useState(false);
    const [pxSize, setPxSize] = useState(32);
    const wrapRef = useRef(null);

    useEffect(() => {
      const el = wrapRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          const raw = Math.min(cr.width, cr.height);
          const snapped = Math.max(16, Math.floor(raw));
          if (snapped !== pxSize) setPxSize(snapped);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [pxSize]);

    const srcSvg = TYPE_TO_SVG[t] || TYPE_TO_SVG.p;
    const sideVars = svgStyles.white || {};

    const pngSrc = TYPE_TO_STYLISH_PNG[t] || TYPE_TO_STYLISH_PNG.p;

    const sizeScale = useMemo(() => {
      if (t === 'q' || t === 'k') return 1.0;
      if (t === 'p') return 0.8;
      return 0.9;
    }, [t]);

    const innerStyle = useMemo(() => ({
      width: `${Math.round(sizeScale * 100)}%`,
      height: `${Math.round(sizeScale * 100)}%`,
      objectFit: 'contain',
      objectPosition: 'bottom center',
      display: 'block',
      alignSelf: 'flex-end',
    }), [sizeScale]);

    const renderSize = Math.max(16, Math.floor(pxSize * sizeScale));

    return (
      <div ref={wrapRef} className="qc-title-icon-wrap" style={styles.titleIconWrap} aria-hidden>
        {!useFallback ? (
          <img
            className="qc-title-icon-img"
            src={pngSrc}
            alt=""
            decoding="async"
            fetchpriority="high"
            style={innerStyle}
            onError={() => setUseFallback(true)}
          />
        ) : (
          <RasterizedSvgImg
            srcSvgUrl={srcSvg}
            cssVarMap={sideVars}
            idPrefix={`hdr-${t}`}
            size={renderSize}
            renderHint={renderSize <= 32 ? 'crisp' : 'precision'}
            className="qc-title-icon-fallback"
            style={innerStyle}
            alt=""
          />
        )}
      </div>
    );
  };

  const handleSquareClick = (data) => {
    if (!canMakeMove) {
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      return;
    }
    const { square } = data;
    const piece = getPieceAtSquare(square);

    if (piece) {
      if (piece.side === sideToMove) {
        // If a piece is already selected and we clicked another same-side piece, try castling
        if (selectedId && selectedId !== piece.id) {
          const { canCastle, reason, plan } = canCastleBetween(selectedId, piece.id);
          if (canCastle) {
            const result = castlePieces(selectedId, piece.id);
            if (result.success) {
              // Record both piece moves for history
              dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: piece.side }));
              dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: piece.side }));
              setSelectedId(null);
              setTrayHighlights([]);
              setInfoMessage('');
              return;
            } else {
              if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Castling failed.');
            }
          } else {
            setInfoMessage(reason || 'Cannot castle with these pieces.');
          }
        }
        setSelectedId(piece.id);
        setTrayHighlights([]);
      }
      return;
    }

    if (selectedId) {
      const movingPiece = pieces.find((p) => p.id === selectedId);
      if (!movingPiece || movingPiece.side !== sideToMove) {
        setSelectedId(null);
        return;
      }
      const legal = new Set(getLegalMoves(selectedId));
      if (legal.has(square)) {
        const fromSquare = movingPiece && movingPiece.square ? movingPiece.square : null;
        const result = movePiece(selectedId, square);
        if (result.success && fromSquare) {
          dispatch(addMove({ from: fromSquare, to: square, side: movingPiece.side }));
          setInfoMessage('');
        } else if (!result.success) {
          if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Illegal move.');
        }
        setSelectedId(null);
      } else {
        setInfoMessage('Illegal move.');
        setSelectedId(null);
      }
    }
  };

  const handlePieceClick = ({ id }) => {
    if (!canMakeMove) {
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      return;
    }
    const clicked = pieces.find((x) => x.id === id);
    if (!clicked) return;

    if (clicked.side === sideToMove) {
      if (selectedId && selectedId !== id) {
        // Attempt castling when clicking a different same-side piece while one is already selected
        const { canCastle, reason, plan } = canCastleBetween(selectedId, id);
        if (canCastle) {
          const result = castlePieces(selectedId, id);
          if (result.success) {
            dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: clicked.side }));
            dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: clicked.side }));
            setSelectedId(null);
            setTrayHighlights([]);
            setInfoMessage('');
            return;
          } else {
            if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Castling failed.');
          }
        }
      }
      setSelectedId(id);
      setTrayHighlights([]);
      return;
    }

    if (selectedId) {
      const movingPiece = pieces.find((p) => p.id === selectedId);
      if (!movingPiece || movingPiece.side !== sideToMove) {
        setSelectedId(null);
        return;
      }
      const legal = new Set(getLegalMoves(selectedId));
      const destSquare = clicked.square;
      if (destSquare && legal.has(destSquare)) {
        const fromSquare = movingPiece.square || null;
        const result = movePiece(selectedId, destSquare);
        if (result.success && fromSquare) {
          dispatch(addMove({ from: fromSquare, to: destSquare, side: movingPiece.side }));
          setInfoMessage('');
        } else if (!result.success) {
          if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Illegal move.');
        }
        setSelectedId(null);
      } else {
        setInfoMessage('Illegal move.');
        setSelectedId(null);
      }
    }
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

  const checkHighlights = useMemo(() => {
    if (!showCheckOverlay) return [];
    const list = [];
    const opponent = sideToMove === 'white' ? 'black' : 'white';
    const squares = (checkingSquaresBySide && checkingSquaresBySide[opponent]) ? checkingSquaresBySide[opponent] : [];
    for (const sq of squares) {
      list.push({ square: sq, color: 'rgba(255, 0, 0, 0.22)' });
    }
    return list;
  }, [checkingSquaresBySide, sideToMove, showCheckOverlay]);

  const combinedHighlights = useMemo(() => {
    const combined = [];
    if (baseHighlights && baseHighlights.length) combined.push(...baseHighlights);
    if (checkHighlights && checkHighlights.length) combined.push(...checkHighlights);
    if (trayHighlights && trayHighlights.length) combined.push(...trayHighlights);
    return combined;
  }, [baseHighlights, checkHighlights, trayHighlights]);

  const whiteCaptured = useMemo(() => {
    return pieces
      .filter((p) => p.captured && p.side === 'white')
      .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
  }, [pieces]);

  const blackCaptured = useMemo(() => {
    return pieces
      .filter((p) => p.captured && p.side === 'black')
      .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
  }, [pieces]);

  const CapturedIcon = ({ piece }) => {
    const wrapRef = useRef(null);
    const [pxSize, setPxSize] = useState(26);

    useEffect(() => {
      const el = wrapRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          const raw = Math.min(cr.width, cr.height);
          const snapped = Math.max(12, Math.floor(raw));
          if (snapped !== pxSize) setPxSize(snapped);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [pxSize]);

    const types = Array.isArray(piece.possibleTypes) ? piece.possibleTypes : [];
    const order = ['p', 'n', 'b', 'r', 'q'];
    const pickType = order.find((x) => types.includes(x));
    const t = pickType || (types.includes('k') ? 'p' : 'p');

    const srcSvg = TYPE_TO_SVG[t] || TYPE_TO_SVG.p;
    const sideVars = piece.side === 'white' ? (svgStyles.white || {}) : (svgStyles.black || {});

    return (
      <div
        ref={wrapRef}
        className="qc-captured-icon-wrap"
        style={styles.capturedIconWrap}
        title={`Captured ${t}`}
        aria-label={`Captured ${t}`}
      >
        <RasterizedSvgImg
          srcSvgUrl={srcSvg}
          cssVarMap={sideVars}
          idPrefix={`cap-${piece.id}-${t}`}
          size={pxSize}
          renderHint="precision"
          className="qc-captured-icon-img"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          alt={`Captured ${t}`}
        />
      </div>
    );
  };

  const handleBoardResize = useCallback((px) => {
    setTrayHeight(px);
  }, []);

  const handleSquareRightClick = useCallback(() => {}, []);

  const handleSetHighlights = useCallback((arr) => {
    setTrayHighlights(Array.isArray(arr) ? arr : []);
  }, []);

  const handleClearHighlights = useCallback(() => {
    setTrayHighlights([]);
  }, []);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleOpenRules = useCallback(() => setRulesOpen(true), []);

  const handleStartGame = useCallback((settings) => {
    dispatch(setGameSettings(settings));
    dispatch(resetGame());
    // In a real app, this would also reset the useQuantumGameState hook's internal state.
    setInfoMessage('New game started.');
  }, [dispatch]);

  const handlePieceDragStart = useCallback((piece) => {
    if (!piece) return false;
    if (!canMakeMove) return false;
    if (piece.side !== sideToMove) return false;
    setSelectedId(piece.id);
    setTrayHighlights([]);
    return true;
  }, [sideToMove, canMakeMove]);

  const handlePieceDrop = useCallback(({ id, from, to }) => {
    if (!canMakeMove) { 
      setInfoMessage(gameOver ? `Game over. ${winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins.` : ''}` : 'Cannot make moves while viewing history.');
      setSelectedId(null); 
      return; 
    }
    const movingPiece = pieces.find((p) => p.id === id);
    if (!movingPiece) {
      setSelectedId(null);
      return;
    }
    if (!to) {
      setSelectedId(null);
      return;
    }

    // If dropped on a same-side piece, attempt castling before standard legality checks
    const targetAtDest = getPieceAtSquare(to);
    if (targetAtDest && targetAtDest.side === movingPiece.side) {
      const { canCastle, reason, plan } = canCastleBetween(id, targetAtDest.id);
      if (canCastle) {
        const result = castlePieces(id, targetAtDest.id);
        if (result.success) {
          dispatch(addMove({ from: plan.piece1_from, to: plan.piece1_to, side: movingPiece.side }));
          dispatch(addMove({ from: plan.piece2_from, to: plan.piece2_to, side: movingPiece.side }));
          setInfoMessage('');
        } else {
          if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Castling failed.');
        }
      } else {
        setInfoMessage(reason || 'Cannot castle with these pieces.');
      }
      // Same-side drop but not eligible for castling; cancel the drag
      setSelectedId(null);
      return;
    }

    // Standard move path
    const legal = new Set(getLegalMoves(id));
    if (!legal.has(to)) {
      setInfoMessage('Illegal move.');
      setSelectedId(null);
      return;
    }
    const fromSquare = movingPiece.square || from || null;
    const result = movePiece(id, to);
    if (result.success && fromSquare) {
      dispatch(addMove({ from: fromSquare, to, side: movingPiece.side }));
      setInfoMessage('');
    } else if (!result.success) {
      if (result.hasOwnProperty('reason')) setInfoMessage(result.reason || 'Move failed due to game constraints.');
    }
    setSelectedId(null);
  }, [pieces, getPieceAtSquare, canCastleBetween, castlePieces, getLegalMoves, movePiece, dispatch, canMakeMove, gameOver, winner]);

  const handleDragHover = useCallback(() => {}, []);

  // Seek handler from the move history tray. Move index -1 means end of history, otherwise show board after that move.
  const handleSeekToIndex = useCallback((moveIndex) => {
    setSelectedId(null);
    if (typeof moveIndex !== 'number') return;
    if (moveIndex < 0) {
      setViewIndex(Math.max(0, historyLength - 1));
    } else {
      // snapshots are offset by 1: snapshot 0 is initial position
      const snapIndex = Math.max(0, Math.min(historyLength - 1, moveIndex + 1));
      setViewIndex(snapIndex);
    }
  }, [historyLength, setViewIndex]);

  function colorsEqual(a, b) {
    if (!a || !b) return false;
    return a.icon === b.icon && a.bandFill === b.bandFill && a.bandStroke === b.bandStroke;
  }

  const handleAcceptSettings = useCallback(async (settings) => {
    const whiteChanged = !colorsEqual(whiteColors, settings.white);
    const blackChanged = !colorsEqual(blackColors, settings.black);
    const anyPieceColorChanged = whiteChanged || blackChanged;

    // Apply only changed piece colors to avoid triggering unnecessary re-renders and re-rasterization
    if (whiteChanged) setWhiteColors(settings.white);
    if (blackChanged) setBlackColors(settings.black);

    // Always apply non-piece settings
    setBoardColors(settings.board);
    setPlayerBarColors(settings.playerBar);
    setShowCoordinates(settings.coordinates);
    setShowCheckOverlay(settings.checkOverlay);

    if (!anyPieceColorChanged) {
      // Nothing to do for raster caches if piece colors did not change
      return;
    }

    const effectiveWhite = whiteChanged ? settings.white : whiteColors;
    const effectiveBlack = blackChanged ? settings.black : blackColors;

    const newSvgStyles = {
      white: {
        ['--band-fill']: effectiveWhite.bandFill,
        ['--band-stroke']: effectiveWhite.bandStroke,
        ['--icon-color']: effectiveWhite.icon,
      },
      black: {
        ['--band-fill']: effectiveBlack.bandFill,
        ['--band-stroke']: effectiveBlack.bandStroke,
        ['--icon-color']: effectiveBlack.icon,
      },
    };

    invalidateRasterPngs('piece-colors-changed');
    await prewarmAllPiecePngs({
      cssVarsBySide: newSvgStyles,
      sizes: [currentPieceSize, 64, 26],
      renderHint: currentPieceSize <= 56 ? 'crisp' : 'precision',
    });
  }, [whiteColors, blackColors, setWhiteColors, setBlackColors, setBoardColors, setPlayerBarColors, setShowCoordinates, setShowCheckOverlay, currentPieceSize]);

  const winnerText = useMemo(() => {
    if (!gameOver) return '';
    if (!winner) return 'Game over.';
    const w = winner[0].toUpperCase() + winner.slice(1);
    return `${w} wins by checkmate!`;
  }, [gameOver, winner]);

  return (
    <div className="qc-app-container" style={styles.appContainer}>
      <header className="qc-app-header" style={styles.appHeader}>
        <div className="qc-app-title-wrap" style={styles.appTitleWrap}>
          <div className="qc-app-title-row" style={styles.appTitleRow}>
            <div className="qc-title-strip qc-title-strip--left" style={styles.titleStrip('left')} aria-hidden>
              <HeaderPieceIcon t="q" />
              <HeaderPieceIcon t="b" />
              <HeaderPieceIcon t="n" />
            </div>
            <div className="qc-app-title-center-group" style={styles.appTitleCenterGroup}>
              <h1 className="qc-app-title-text" style={styles.appTitleText}>Quantum Chess</h1>
            </div>
            <div className="qc-title-strip qc-title-strip--right" style={styles.titleStrip('right')} aria-hidden>
              <HeaderPieceIcon t="p" />
              <HeaderPieceIcon t="r" />
              <HeaderPieceIcon t="k" />
            </div>
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
              <div className="qc-player-info qc-player-info--black" style={styles.playerInfo}>
                <div className="qc-player-name-row qc-player-name-row--black" style={styles.playerNameRow}>
                  <span className="qc-player-name-text qc-player-name-text--black">{blackPlayer}</span>
                </div>
                <div className="qc-player-rating-row qc-player-rating-row--black" style={styles.playerRatingRow}>
                  <span className="qc-player-rating-text qc-player-rating-text--black">Rating: {blackRating}</span>
                </div>
              </div>
              <div className="qc-captured-area qc-captured-area--black" style={styles.capturedArea} aria-label="Black captured pieces area">
                {blackCaptured.map((p) => (
                  <CapturedIcon key={`capicon-${p.id}`} piece={p} />
                ))}
              </div>
            </div>

            <div className="qc-board-row" style={styles.boardRow}>
              <Board
                orientation={userTeam}
                showCoordinates={showCoordinates}
                highlights={combinedHighlights}
                onSquareClick={handleSquareClick}
                onSquareRightClick={handleSquareRightClick}
                onPieceClick={handlePieceClick}
                onPieceDragStart={handlePieceDragStart}
                onPieceDrop={handlePieceDrop}
                onDragHover={handleDragHover}
                pieces={pieces}
                selectedId={selectedId}
                legalMoves={selectedMoves}
                maxVisualSize={boardSize > 0 ? `${boardSize}px` : 'min(85vmin, 720px)'}
                borderColor="transparent"
                shadow="rgba(0, 0, 0, 0.15)"
                pieceSvgStyles={svgStyles}
                onResize={handleBoardResize}
                squareColors={boardColors}
              />

              <SideTray
                height={trayHeight}
                infoMessage={infoMessage}
                onOpenSettings={handleOpenSettings}
                onOpenRules={handleOpenRules}
                onStartGame={handleStartGame}
                onSetHighlights={handleSetHighlights}
                onClearHighlights={handleClearHighlights}
                onSeekToIndex={handleSeekToIndex}
              />
            </div>

            <div
              className="qc-player-bar qc-player-bar--bottom"
              style={styles.playerBar('white')}
              data-side="white"
              ref={bottomBarRef}
            >
              <div className="qc-player-info qc-player-info--white" style={styles.playerInfo}>
                <div className="qc-player-name-row qc-player-name-row--white" style={styles.playerNameRow}>
                  <span className="qc-player-name-text qc-player-name-text--white">{whitePlayer}</span>
                </div>
                <div className="qc-player-rating-row qc-player-rating-row--white" style={styles.playerRatingRow}>
                  <span className="qc-player-rating-text qc-player-rating-text--white">Rating: {whiteRating}</span>
                </div>
              </div>
              <div className="qc-captured-area qc-captured-area--white" style={styles.capturedArea} aria-label="White captured pieces area">
                {whiteCaptured.map((p) => (
                  <CapturedIcon key={`capicon-${p.id}`} piece={p} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Winner Popup */}
      <div className="qc-winner-overlay" style={styles.winnerOverlay} role="dialog" aria-modal={showWinPopup} aria-hidden={!showWinPopup}>
        <div className="qc-winner-modal" style={styles.winnerModal}>
          <h2 className="qc-winner-title" style={styles.winnerTitle}>Checkmate</h2>
          <p className="qc-winner-sub" style={styles.winnerSub}>{winnerText}</p>
          <div className="qc-winner-button-row" style={styles.winnerButtonRow}>
            <button
              className="qc-winner-button"
              style={styles.primaryBtn}
              onClick={() => setShowWinPopup(false)}
              autoFocus
            >
              OK
            </button>
          </div>
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        whiteColors={whiteColors}
        blackColors={blackColors}
        boardColors={boardColors}
        playerBarColors={playerBarColors}
        showCoordinates={showCoordinates}
        showCheckOverlay={showCheckOverlay}
        defaultWhiteColors={DEFAULT_WHITE}
        defaultBlackColors={DEFAULT_BLACK}
        defaultBoardColors={DEFAULT_BOARD}
        defaultPlayerBarColors={DEFAULT_PLAYER_BAR_COLORS}
        onAccept={handleAcceptSettings}
      />

      <RulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
      />
    </div>
  );
}
