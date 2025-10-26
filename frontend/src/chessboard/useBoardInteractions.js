// frontend/src/chessboard/useBoardInteractions.js
// Purpose: Hook that measures the board surface, keeps square size in sync with layout, and converts pointer events to board coordinates. Snaps dimensions to an 8px grid to prevent subpixel blurring.
// Imports From: ./boardUtils.js
// Exported To: frontend/src/chessboard/Board.jsx

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampToBoard,
  getOrientationAdjustedIndices,
  toAlgebraic,
} from './boardUtils.js';

export default function useBoardInteractions({ orientation = 'white' } = {}) {
  const surfaceRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, cell: 0 });

  useEffect(() => {
    if (!surfaceRef.current) return;

    const el = surfaceRef.current;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const rawW = Math.floor(rect.width);
      const rawH = Math.floor(rect.height);
      const size = Math.min(rawW, rawH);
      const cell = Math.max(1, Math.floor(size / 8));
      const snapped = cell * 8; // Avoid fractional cells for crisp rendering
      setDimensions({ width: snapped, height: snapped, cell });
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const eventToSquare = useCallback(
    (e) => {
      if (!surfaceRef.current || dimensions.cell <= 0) return null;
      const rect = surfaceRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const colFromLeft = clampToBoard(Math.floor((x / rect.width) * 8));
      const rowFromTop = clampToBoard(Math.floor((y / rect.height) * 8));
      const { fileIndex, rankIndex } = getOrientationAdjustedIndices(
        rowFromTop,
        colFromLeft,
        orientation
      );
      const square = toAlgebraic(fileIndex, rankIndex);
      return {
        square,
        fileIndex,
        rankIndex,
        index: rankIndex * 8 + fileIndex,
        boardX: colFromLeft,
        boardY: rowFromTop,
        clientX: e.clientX,
        clientY: e.clientY,
      };
    },
    [dimensions, orientation]
  );

  return { surfaceRef, dimensions, eventToSquare };
}
