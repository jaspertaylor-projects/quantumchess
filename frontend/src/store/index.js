// frontend/src/store/index.js
// Purpose: Configure and export the Redux store.
// Imports From: ./gameSlice.js, ./settingsSlice.js
// Exported To: ../main.jsx

import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './gameSlice.js';
import settingsReducer from './settingsSlice.js';

export default configureStore({
  reducer: {
    game: gameReducer,
    settings: settingsReducer,
  },
});
