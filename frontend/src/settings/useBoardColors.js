// frontend/src/settings/useBoardColors.js
// Purpose: Manage board square colors (light and dark), persist them to localStorage, and provide setters and reset.
// Imports From: ../theme.js, ./usePersistentSetting.js
// Exported To: ../App.jsx, ./SettingsModal.jsx

import theme from '../theme.js';
import usePersistentSetting from './usePersistentSetting.js';

const STORAGE_KEY = 'qcBoardSquareColors';

export const DEFAULT_BOARD = {
  light: theme.boardLight,
  dark: theme.boardDark,
};

export default function useBoardColors() {
  const [boardColors, setBoardColors, resetBoardColors] = usePersistentSetting(STORAGE_KEY, DEFAULT_BOARD);

  return {
    boardColors,
    setBoardColors,
    resetBoardColors,
  };
}
