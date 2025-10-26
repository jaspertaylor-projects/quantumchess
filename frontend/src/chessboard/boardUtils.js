// frontend/src/chessboard/boardUtils.js
// Purpose: Utilities for board coordinate conversions, labeling, and square helpers used by the chessboard feature.
// Imports From: None
// Exported To: frontend/src/chessboard/Board.jsx, frontend/src/chessboard/useBoardInteractions.js

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export function toAlgebraic(fileIndex, rankIndex) {
  if (
    typeof fileIndex !== 'number' ||
    typeof rankIndex !== 'number' ||
    fileIndex < 0 ||
    fileIndex > 7 ||
    rankIndex < 0 ||
    rankIndex > 7
  )
    return null;
  return `${FILES[fileIndex]}${RANKS[rankIndex]}`;
}

export function fromAlgebraic(square) {
  if (!square || typeof square !== 'string' || square.length < 2) return null;
  const fileChar = square[0].toLowerCase();
  const rankChar = square.slice(1);
  const fileIndex = FILES.indexOf(fileChar);
  const rankIndex = RANKS.indexOf(rankChar);
  if (fileIndex === -1 || rankIndex === -1) return null;
  return { fileIndex, rankIndex };
}

export function clampToBoard(value) {
  return Math.max(0, Math.min(7, value));
}

export function isDarkSquare(rowIndexFromTop, colIndexFromLeft) {
  return (rowIndexFromTop + colIndexFromLeft) % 2 === 1;
}

export function fileLabelForColumn(colIndex, orientation) {
  if (orientation === 'black') {
    return FILES[7 - colIndex];
  }
  return FILES[colIndex];
}

export function rankLabelForRow(rowIndex, orientation) {
  // rowIndex is 0 at top, 7 at bottom
  if (orientation === 'black') {
    // From black's perspective, top is rank 1
    return RANKS[rowIndex];
  }
  // From white's perspective, top is rank 8
  return RANKS[7 - rowIndex];
}

export function toBoardIndex(fileIndex, rankIndex) {
  return rankIndex * 8 + fileIndex;
}

export function fromBoardIndex(index) {
  const fileIndex = index % 8;
  const rankIndex = Math.floor(index / 8);
  return { fileIndex, rankIndex };
}

export function getOrientationAdjustedIndices(rowFromTop, colFromLeft, orientation) {
  let fileIndex;
  let rankIndex;
  if (orientation === 'black') {
    fileIndex = 7 - colFromLeft;
    rankIndex = rowFromTop;
  } else {
    fileIndex = colFromLeft;
    rankIndex = 7 - rowFromTop;
  }
  return { fileIndex, rankIndex };
}
