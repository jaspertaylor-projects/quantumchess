// frontend/src/store/index.js
// Purpose: Configure and export the Redux store for the frontend application, registering domain reducers.
// Imports From: ./gameSlice.js
// Exported To: ../main.jsx

import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './gameSlice.js';

const store = configureStore({
  reducer: {
    game: gameReducer,
  },
});

export default store;
