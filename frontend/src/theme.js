// frontend/src/theme.js
// Purpose: Defines the application's color theme as a simple JS object.
// Imports From: None
// Exported To: frontend/src/App.jsx, frontend/src/chessboard/Board.jsx, frontend/src/errors/ErrorBoundary.jsx, frontend/src/main.jsx, frontend/src/settings/useBoardColors.js, frontend/src/tray/NewGamePanel.jsx, frontend/src/tray/SideTray.jsx, frontend/src/tutorial/MiniBoard.jsx

const theme = {
  primary: '#61dafb', // React Blue
  secondary: '#282c34', // Header background
  background: '#20232a', // App container background
  cardBackground: '#282c34',
  textPrimary: '#ffffff',
  textSecondary: '#a8b2d1',
  textMuted: '#999999', // For less important text like timestamps
  textSuccess: '#a6e22e', // For success messages
  success: '#15803d', // A darker green for success actions
  buttonBackground: '#61dafb',
  buttonText: '#20232a',
  error: '#ff6b6b',
  border: '#444444',
  shadow: 'rgba(0, 0, 0, 0.2)',
  // Status colors shared by the puzzle/review UIs
  good: '#7ee787', // "correct/solved" green
  warn: '#f6c445', // "careful/partial" amber
  // Modal backdrop — every modal overlay uses the same scrim
  scrim: 'rgba(0, 0, 0, 0.55)',
  // Default board squares (the user can override via Settings → Board Colors)
  boardLight: '#cbd5c0', // Muted sage — bright enough for clarity without glare
  boardDark: '#71866f', // Desaturated forest green for comfortable contrast
  globalBackground: '#242424',
  globalText: 'rgba(255, 255, 255, 0.87)',
  // Board area background surrounding the chessboard
  boardAreaBackground: 'rgb(0, 0, 22)',
  // Generic button styles for global CSS
  buttonGenericBackground: '#1a1a1a',
  buttonGenericBorder: 'transparent',
  buttonGenericBackgroundHover: '#313131',
  buttonGenericBorderHover: '#646cff',
  tray: {
    background: '#282c34',
  },
};

export default theme;
