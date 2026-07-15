// frontend/src/store/settingsSlice.js
// Purpose: Define a Redux slice for managing new game settings including game mode, AI settings, matchmaking flags, and preferred side for AI games.
// Imports From: None
// Exported To: ./index.js, ../App.jsx

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Match the setup panel's first-use defaults. Every submitted setup then
  // replaces these values so reopening New Game starts where the player left
  // off, including after entering or cancelling matchmaking.
  gameMode: 'ai', // 'local', 'ai', 'online'
  aiBotId: null,
  aiDifficulty: 'medium', // 'easy', 'medium', 'hard'
  preferredSide: 'random', // 'white', 'black', 'random' (AI games only)
  isRanked: false, // boolean
  timeControl: '5+0', // '3+0', '5+0', '10+0'
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setGameSettings(state, action) {
      const { gameMode, aiBotId, aiDifficulty, preferredSide, isRanked, timeControl } = action.payload || {};
      state.gameMode = gameMode ?? state.gameMode;
      state.aiBotId = aiBotId ?? state.aiBotId;
      state.aiDifficulty = aiDifficulty ?? state.aiDifficulty;
      state.preferredSide = preferredSide ?? state.preferredSide;
      state.isRanked = isRanked ?? state.isRanked;
      state.timeControl = timeControl ?? state.timeControl;
    },
  },
});

export const { setGameSettings } = settingsSlice.actions;
export default settingsSlice.reducer;
