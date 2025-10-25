// frontend/src/main.jsx
// Purpose: Mount the app and wrap it with the ErrorBoundary so React render/lifecycle errors are captured and reported.
// Imports From: ./App.jsx, ./index.css, ./errors/ErrorBoundary.jsx
// Exported To: index.html (Vite entry)

import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './errors/ErrorBoundary.jsx';
import App from './App.jsx';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
