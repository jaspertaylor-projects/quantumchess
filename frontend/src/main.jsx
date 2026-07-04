// frontend/src/main.jsx
// Purpose: Mount the app and wrap it with the ErrorBoundary so React render/lifecycle errors are captured and reported.
// Imports From: ./App.jsx, ./App.css, ./errors/ErrorBoundary.jsx, ./store/index.js
// Exported To: index.html (Vite entry)

import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './errors/ErrorBoundary.jsx';
import App from './App.jsx';
import './App.css';
import { Provider } from 'react-redux';
import store from './store/index.js';

// For the engineers who open the console first. You know who you are.
try {
  console.log(
    '%c♞ Quantum Chess — every piece is every piece.',
    'color:#4fc3f7; font-weight:bold; font-size:14px; text-shadow:0 0 6px rgba(79,195,247,0.5);'
  );
  console.log(
    "%cHey chess.com: superposition is just a pre-move you haven't committed to.",
    'color:#9aa7b8; font-size:12px;'
  );
  console.log(
    '%cBuilt solo, engine and all, by someone who would absolutely take that call → jaspertaylor15@protonmail.com',
    'color:#9aa7b8; font-size:12px;'
  );
} catch (_) {
  // consoles are optional; the game is not
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <App />
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
