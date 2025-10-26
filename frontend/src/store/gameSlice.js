// frontend/src/store/gameSlice.js
// Purpose: Define the game slice to track game-level state, including a move list with side metadata and current turn tracking.
// Imports From: None
// Exported To: ./index.js, ../App.jsx, ../tray/MoveHistoryPanel.jsx

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  moves: [],
  turn: 'white',
};

function nextTurn(side) {
  return side === 'white' ? 'black' : 'white';
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    addMove(state, action) {
      const { from, to, side } = action.payload || {};
      const validSquares = typeof from === 'string' && typeof to === 'string';
      const validSide = side === 'white' || side === 'black';
      if (validSquares && validSide) {
        state.moves.push({ from, to, side });
        state.turn = nextTurn(side);
      }
    },
    resetGame(state) {
      state.moves = [];
      state.turn = 'white';
    },
  },
});

export const { addMove, resetGame } = gameSlice.actions;
export default gameSlice.reducer;
