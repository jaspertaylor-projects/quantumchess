// frontend/src/store/settingsSlice.js
// Purpose: Define a Redux slice for managing new game settings.
// Imports From: None
// Exported To: ./index.js, ../App.jsx

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  gameMode: 'local', // 'local', 'ai', 'online'
  aiDifficulty: 'medium', // 'easy', 'medium', 'hard'
  isRanked: false, // boolean
  timeControl: '5+0', // '3+0', '5+0', '10+0'
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setGameSettings(state, action) {
      const { gameMode, aiDifficulty, isRanked, timeControl } = action.payload;
      state.gameMode = gameMode ?? state.gameMode;
      state.aiDifficulty = aiDifficulty ?? state.aiDifficulty;
      state.isRanked = isRanked ?? state.isRanked;
      state.timeControl = timeControl ?? state.timeControl;
    },
  },
});

export const { setGameSettings } = settingsSlice.actions;
export default settingsSlice.reducer;
