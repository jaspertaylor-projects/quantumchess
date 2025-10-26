// frontend/src/store/gameSlice.js
// Purpose: Define the game slice to track game-level state, starting with a move list [{ from, to }].
// Imports From: None
// Exported To: ./index.js, ../App.jsx

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  moves: [],
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    addMove(state, action) {
      const { from, to } = action.payload || {};
      if (typeof from === 'string' && typeof to === 'string') {
        state.moves.push({ from, to });
      }
    },
    resetGame(state) {
      state.moves = [];
    },
  },
});

export const { addMove, resetGame } = gameSlice.actions;
export default gameSlice.reducer;
