// frontend/src/theme.js
// Purpose: Defines the application's color theme as a simple JS object.
// Imports From: None
// Exported To: frontend/src/App.jsx, frontend/src/errors/ErrorBoundary.jsx, frontend/src/main.jsx

const theme = {
  primary: '#61dafb', // React Blue
  secondary: '#282c34', // Header background
  background: '#20232a', // App container background
  cardBackground: '#282c34',
  textPrimary: '#ffffff',
  textSecondary: '#a8b2d1',
  textMuted: '#999999', // For less important text like timestamps
  textSuccess: '#a6e22e', // For success messages
  buttonBackground: '#61dafb',
  buttonText: '#20232a',
  error: '#ff6b6b',
  border: '#444444',
  shadow: 'rgba(0, 0, 0, 0.2)',
  globalBackground: '#242424',
  globalText: 'rgba(255, 255, 255, 0.87)',
  // Generic button styles for global CSS
  buttonGenericBackground: '#1a1a1a',
  buttonGenericBorder: 'transparent',
  buttonGenericBackgroundHover: '#313131',
  buttonGenericBorderHover: '#646cff',
};

export default theme;
