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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <App />
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
