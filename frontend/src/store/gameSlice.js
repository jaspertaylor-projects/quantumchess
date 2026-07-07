// frontend/src/store/gameSlice.js
// Purpose: Define the game slice to track game-level state, including a move list with side metadata, current turn tracking, and the user's team (board orientation).
// Imports From: None
// Exported To: ./index.js, ../App.jsx, ../tray/MoveHistoryPanel.jsx

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  moves: [],
  turn: 'white',
  userTeam: 'white',
};

function nextTurn(side) {
  return side === 'white' ? 'black' : 'white';
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    addMove(state, action) {
      const { from, to, side, castle, enPassant } = action.payload || {};
      const validSquares = typeof from === 'string' && typeof to === 'string';
      const validSide = side === 'white' || side === 'black';
      if (validSquares && validSide) {
        // castle/enPassant flags make the record losslessly replayable for
        // game review (a castle is stored as two flagged half-moves).
        // enPassant is stored explicitly even when false: its presence marks
        // the record as lossless, so replay never second-guesses it.
        const move = { from, to, side, enPassant: Boolean(enPassant) };
        if (castle) move.castle = true;
        state.moves.push(move);
        state.turn = nextTurn(side);
      }
    },
    resetGame(state) {
      state.moves = [];
      state.turn = 'white';
    },
    setUserTeam(state, action) {
      const val = action.payload;
      if (val === 'white' || val === 'black') {
        state.userTeam = val;
      }
    },
  },
});

export const { addMove, resetGame, setUserTeam } = gameSlice.actions;
export default gameSlice.reducer;
