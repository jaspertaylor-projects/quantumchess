// frontend/src/chessboard/useBoardInteractions.js
// Purpose: Hook that measures the board surface, keeps square size in sync with layout, and converts pointer events to board coordinates.
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
      const size = Math.min(rect.width, rect.height);
      const cell = size / 8;
      setDimensions({ width: size, height: size, cell });
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
      const colFromLeft = clampToBoard(Math.floor(x / (dimensions.width / 8)));
      const rowFromTop = clampToBoard(Math.floor(y / (dimensions.height / 8)));
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
