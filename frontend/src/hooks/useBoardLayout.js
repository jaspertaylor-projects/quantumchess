// frontend/src/hooks/useBoardLayout.js
// Purpose: Responsive board sizing — owns the stage/bar refs, measures the
// space left for the board (reserving the side tray on wide layouts),
// quantizes the board to whole cells, and prewarms piece SVGs at the
// resulting size. Extracted from App.jsx.
// Imports From: ../chessboard/svgPrewarm.js
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prewarmAllPieceSvgs, prewarmCapturedPieceSvgs } from '../chessboard/svgPrewarm.js';

// The side tray's CSS width: clamp(260px, 38vmin, 360px).
function trayWidthPx() {
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  return Math.min(360, Math.max(260, Math.round(0.38 * vmin)));
}

export default function useBoardLayout({ gameStarted, svgStyles }) {
  const boardStageRef = useRef(null);
  const topBarRef = useRef(null);
  const bottomBarRef = useRef(null);
  const [boardSize, setBoardSize] = useState(0);
  const [trayHeight, setTrayHeight] = useState(0);

  // Narrow-screen (phone) layout: stack the tray under the board.
  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 760 : false));
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const el = boardStageRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const rawWidth = Math.floor(rect.width);
      const rawHeight = Math.floor(rect.height);

      const topH = topBarRef.current ? Math.ceil(topBarRef.current.getBoundingClientRect().height) : 0;
      const bottomH = bottomBarRef.current ? Math.ceil(bottomBarRef.current.getBoundingClientRect().height) : 0;
      // Matches boardStage's gap on each side of the board row.
      const verticalGaps = isNarrow ? 8 : 16;
      const availableHeight = Math.max(0, rawHeight - topH - bottomH - verticalGaps);

      // In the side-by-side layout the tray sits next to the board, so its
      // width must be reserved or the row overflows and gets clipped on wide
      // monitors.
      let widthBudget = rawWidth;
      if (!isNarrow) {
        widthBudget = Math.max(0, rawWidth - trayWidthPx() - 16);
      }

      const rawSize = Math.min(widthBudget, availableHeight);
      const cell = Math.max(1, Math.floor(rawSize / 8));
      setBoardSize(cell * 8);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The player bars mount when a game starts and change the space available
    // to the board; watch them too so the board re-fits around them.
    if (topBarRef.current) ro.observe(topBarRef.current);
    if (bottomBarRef.current) ro.observe(bottomBarRef.current);
    window.addEventListener('orientationchange', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [isNarrow, gameStarted]);

  const currentPieceSize = useMemo(() => {
    if (!boardSize || boardSize <= 0) return 64;
    return Math.max(8, Math.floor(boardSize / 8));
  }, [boardSize]);

  // Player bars span exactly the board + gap + side tray, centered with them.
  const barsWidth = useMemo(() => {
    if (!boardSize || boardSize <= 0 || isNarrow) return null;
    return boardSize + 12 + trayWidthPx();
  }, [boardSize, isNarrow]);

  const barWrapStyle = useMemo(() => ({
    width: barsWidth ? `${barsWidth}px` : '100%',
    maxWidth: '100%',
  }), [barsWidth]);

  useEffect(() => {
    if (!currentPieceSize || currentPieceSize <= 0) return;
    prewarmAllPieceSvgs({ cssVarsBySide: svgStyles });
    prewarmCapturedPieceSvgs({ cssVarsBySide: svgStyles });
  }, [currentPieceSize, svgStyles]);

  const handleBoardResize = useCallback((px) => {
    setTrayHeight(px);
  }, []);

  return {
    boardStageRef,
    topBarRef,
    bottomBarRef,
    isNarrow,
    boardSize,
    currentPieceSize,
    barWrapStyle,
    trayHeight,
    handleBoardResize,
  };
}
