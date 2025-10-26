// frontend/src/App.jsx
// Purpose: Render the Quantum Chess UI with a responsive header where the title fills the header height and aligns on the same baseline as decorative PNG piece icons; renders the interactive board, captured pieces, and settings/rules modals; manages SVG raster cache.
// Imports From: ./App.css, ./theme.js, ./chessboard/Board.jsx, ./chessboard/useQuantumGameState.js, ./settings/SettingsModal.jsx, ./settings/usePieceColors.js, ./settings/useBoardColors.js, ./tray/SideTray.jsx, ./tray/RulesModal.jsx, ./store/gameSlice.js, ./chessboard/rasterPrewarm.js, ./chessboard/RasterizedSvgImg.jsx, ./assets/*.svg
// Exported To: None
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import './App.css';
import theme from './theme.js';
import Board from './chessboard/Board.jsx';
import useQuantumGameState from './chessboard/useQuantumGameState.js';
import SettingsModal from './settings/SettingsModal.jsx';
import usePieceColors from './settings/usePieceColors.js';
import useBoardColors from './settings/useBoardColors.js';
import SideTray from './tray/SideTray.jsx';
import RulesModal from './tray/RulesModal.jsx';
import { useDispatch } from 'react-redux';
import { addMove } from './store/gameSlice.js';
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

  const { pieces, sideToMove, getPieceAtSquare, getLegalMoves, movePiece } = useQuantumGameState();

  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [trayHighlights, setTrayHighlights] = useState([]);
  const [showCoordinates, setShowCoordinates] = useState(false);

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

  useEffect(() => {
    if (!currentPieceSize || currentPieceSize <= 0) return;
    prewarmAllPiecePngs({ cssVarsBySide: svgStyles, sizes: [currentPieceSize, 64, 26], renderHint: currentPieceSize <= 56 ? 'crisp' : 'precision' });
  }, [currentPieceSize, svgStyles]);

  useEffect(() => {
    if (!currentPieceSize || currentPieceSize <= 0) return;
    invalidateRasterPngs('piece-colors-changed');
    prewarmAllPiecePngs({ cssVarsBySide: svgStyles, sizes: [currentPieceSize, 64, 26], renderHint: currentPieceSize <= 56 ? 'crisp' : 'precision' });
  }, [svgStyles, currentPieceSize]);

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
      backgroundColor: '#000',
      padding: '0 12px',
      borderRadius: 0,
      textAlign: 'center',
      width: '100%',
      boxSizing: 'border-box',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      justifyContent: 'center',
      minHeight: 'clamp(64px, 12vh, 112px)',
    },
    appTitleWrap: {
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'center',
      width: '100%',
      boxSizing: 'border-box',
      padding: '0',
      minHeight: 'clamp(56px, 10vh, 88px)',
    },
    appTitleRow: {
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'stretch',
      gap: 'clamp(8px, 1.6vw, 16px)',
      padding: '0 clamp(10px, 1.8vw, 16px)',
      borderRadius: 14,
      backgroundColor: '#000',
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      width: '100vw',
      margin: '0 auto',
      height: '100%',
      marginLeft: 'calc(50% - 50vw)',
      marginRight: 'calc(50% - 50vw)',
    },
    appTitleCenterGroup: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 'clamp(6px, 1.2vw, 10px)',
      flex: '0 1 auto',
      minWidth: 0,
      backgroundColor: 'transparent',
      padding: '0 14px',
      borderRadius: 12,
      height: '100%',
    },
    titleStrip: (side) => ({
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
      gap: 'clamp(6px, 1vw, 12px)',
      width: '100%',
      minWidth: 0,
      height: '100%',
    }),
    titleIconWrap: {
      height: '100%',
      aspectRatio: '1 / 1',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
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
      lineHeight: 1,
      display: 'block',
      alignSelf: 'flex-end',
    },
    appTitleUnderline: {
      marginTop: '4px',
      height: '3px',
      width: '100vw',
      background: 'linear-gradient(90deg, rgba(0,245,255,0) 0%, rgba(0,245,255,0.8) 16%, rgba(180,0,255,0.95) 50%, rgba(255,59,127,0.8) 84%, rgba(255,59,127,0) 100%)',
      borderRadius: 3,
      boxShadow: '0 0 18px rgba(180,0,255,0.45), 0 0 28px rgba(0,245,255,0.25)',
      alignSelf: 'center',
      marginLeft: 'calc(50% - 50vw)',
      marginRight: 'calc(50% - 50vw)',
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
      maxWidth: 'min(96vmin, 1200px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'stretch',
      gap: '8px',
      boxSizing: 'border-box',
    },
    playerBar: (side) => {
      const bg = side === 'white' ? boardColors.light : boardColors.dark;
      const txt = side === 'white' ? blackColors.bandFill : whiteColors.bandFill;
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
    playerName: {
      display: 'flex',
      alignItems: 'flex-end',
      height: '100%',
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontSize: 'clamp(0.85rem, 2vw, 1.05rem)',
      color: 'currentColor',
      paddingBottom: 2,
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
    const { square } = data;
    const piece = getPieceAtSquare(square);

    if (piece) {
      if (piece.side === sideToMove) {
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
        const applied = movePiece(selectedId, square);
        if (applied && fromSquare) {
          dispatch(addMove({ from: fromSquare, to: square, side: movingPiece.side }));
        }
        setSelectedId(null);
      } else {
        setSelectedId(null);
      }
    }
  };

  const handlePieceClick = ({ id }) => {
    const clicked = pieces.find((x) => x.id === id);
    if (!clicked) return;

    if (clicked.side === sideToMove) {
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
        const applied = movePiece(selectedId, destSquare);
        if (applied && fromSquare) {
          dispatch(addMove({ from: fromSquare, to: destSquare, side: movingPiece.side }));
        }
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

  const combinedHighlights = useMemo(() => {
    if (!trayHighlights || trayHighlights.length === 0) return baseHighlights;
    return [...baseHighlights, ...trayHighlights];
  }, [baseHighlights, trayHighlights]);

  const whiteCaptured = useMemo(() => {
    return pieces
      .filter((p) => p.captured && p.side === 'black')
      .sort((a, b) => (a.captureIndex ?? -Infinity) - (b.captureIndex ?? -Infinity));
  }, [pieces]);

  const blackCaptured = useMemo(() => {
    return pieces
      .filter((p) => p.captured && p.side === 'white')
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

  const handlePieceDragStart = useCallback((piece) => {
    if (!piece) return false;
    if (piece.side !== sideToMove) return false;
    setSelectedId(piece.id);
    setTrayHighlights([]);
    return true;
  }, [sideToMove]);

  const handlePieceDrop = useCallback(({ id, from, to }) => {
    const movingPiece = pieces.find((p) => p.id === id);
    if (!movingPiece) {
      setSelectedId(null);
      return;
    }
    if (!to) {
      setSelectedId(null);
      return;
    }
    const legal = new Set(getLegalMoves(id));
    if (!legal.has(to)) {
      setSelectedId(null);
      return;
    }
    const fromSquare = movingPiece.square || from || null;
    const applied = movePiece(id, to);
    if (applied && fromSquare) {
      dispatch(addMove({ from: fromSquare, to, side: movingPiece.side }));
    }
    setSelectedId(null);
  }, [pieces, getLegalMoves, movePiece, dispatch]);

  const handleDragHover = useCallback(() => {}, []);

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
              <span className="qc-player-name qc-player-name--black" style={styles.playerName}>{blackPlayer}</span>
              <div className="qc-captured-area qc-captured-area--black" style={styles.capturedArea} aria-label="Black captured pieces area">
                {blackCaptured.map((p) => (
                  <CapturedIcon key={`capicon-${p.id}`} piece={p} />
                ))}
              </div>
            </div>

            <div className="qc-board-row" style={styles.boardRow}>
              <Board
                orientation="white"
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
                onOpenSettings={handleOpenSettings}
                onOpenRules={handleOpenRules}
                onSetHighlights={handleSetHighlights}
                onClearHighlights={handleClearHighlights}
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
                {whiteCaptured.map((p) => (
                  <CapturedIcon key={`capicon-${p.id}`} piece={p} />
                ))}
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
        showCoordinates={showCoordinates}
        onChangeShowCoordinates={(val) => setShowCoordinates(Boolean(val))}
      />

      <RulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
      />
    </div>
  );
}
