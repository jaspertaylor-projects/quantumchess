// frontend/src/main.jsx
// Purpose: Route first-time visitors through the crawlable welcome experience,
// then mount the game surface with error reporting and Redux state.
// Imports From: ./App.jsx, ./welcome/*, ./App.css, ./errors/ErrorBoundary.jsx, ./store/index.js
// Exported To: index.html (Vite entry)

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
// Imported (not <script>-injected) so the build bundles it — a raw /src
// path in index.html 404s in production.
import './errors/clientErrorReporter.js';
import ErrorBoundary from './errors/ErrorBoundary.jsx';
import App from './App.jsx';
import './App.css';
import './Styles/scrollbar.css';
import { Provider } from 'react-redux';
import store from './store/index.js';
import WelcomeLanding from './welcome/WelcomeLanding.jsx';

// A deploy replaces the hashed chunk files; a session loaded BEFORE it fails
// its next lazy import (e.g. opening the daily puzzle) and the click looks
// dead. Reload once to pick up the fresh index.html + assets; the session
// flag prevents a reload loop if the failure is something else.
window.addEventListener('vite:preloadError', (event) => {
  let alreadyTried = false;
  try {
    alreadyTried = sessionStorage.getItem('qcChunkReloadV1') === '1';
    if (!alreadyTried) sessionStorage.setItem('qcChunkReloadV1', '1');
  } catch (_) { /* storage-blocked: still reload once per event default */ }
  if (!alreadyTried) {
    event.preventDefault();
    window.location.reload();
  }
});
import {
  LEGACY_ONBOARD_STORAGE_KEY,
  WELCOME_ACTION,
  WELCOME_STORAGE_KEY,
  playUrlFrom,
  resolveWelcomeEntry,
} from './welcome/welcomeRouting.js';

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
    '%cBuilt solo, engine and all, by someone who would absolutely take that call → contact@quantumchess.ninja',
    'color:#9aa7b8; font-size:12px;'
  );
} catch (_) {
  // consoles are optional; the game is not
}

const storageHas = (key) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch (_) {
    return false;
  }
};

const rememberWelcomeChoice = () => {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, '1');
    // The old first-visit flag also controls the in-game glow coach. Choosing
    // an entry door replaces that old automatic onboarding behavior.
    localStorage.setItem(LEGACY_ONBOARD_STORAGE_KEY, '1');
  } catch (_) {
    // Storage is an enhancement; every door must still work without it.
  }
};

const setWelcomeScrollLock = (locked) => {
  document.documentElement.classList.toggle('qc-welcome-active', locked);
  document.body.classList.toggle('qc-welcome-active', locked);
};

const resolveInitialEntry = () => {
  const entry = resolveWelcomeEntry({
    pathname: window.location.pathname,
    search: window.location.search,
    welcomeSeen: storageHas(WELCOME_STORAGE_KEY),
    legacyOnboardSeen: storageHas(LEGACY_ONBOARD_STORAGE_KEY),
  });

  if (entry.surface === 'play') {
    rememberWelcomeChoice();
    const cleanPlayUrl = `${playUrlFrom(window.location.search)}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== cleanPlayUrl) {
      window.history.replaceState({}, '', cleanPlayUrl);
    }
  }
  return entry;
};

const initialEntry = resolveInitialEntry();
setWelcomeScrollLock(initialEntry.surface === 'welcome');

function RootExperience() {
  const [entry, setEntry] = useState(initialEntry);

  const handleWelcomeChoice = (action) => {
    rememberWelcomeChoice();
    setWelcomeScrollLock(false);
    if (action === WELCOME_ACTION.RULES) return;
    const cleanPlayUrl = `${playUrlFrom(window.location.search)}${window.location.hash}`;
    window.history.replaceState({}, '', cleanPlayUrl);
    setEntry({ surface: 'play', action });
  };

  if (entry.surface === 'welcome') {
    return <WelcomeLanding onChoose={handleWelcomeChoice} />;
  }
  return <App entryAction={entry.action} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <RootExperience />
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
