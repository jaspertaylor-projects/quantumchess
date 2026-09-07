// frontend/vite.config.js
// Purpose: Vite config for the scaffolded app. Logs dev-server errors, injects a browser error reporter, reloads on backend changes, and enables importing SVGs as React components. Proxies HTTP and WebSocket paths to the backend during development.
// Imports From: None
// Exported To: 'pnpm run dev' and production builds.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import fs from 'node:fs';
import path from 'node:path';

function errorFileLogger() {
  const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'frontend-error.log');

  const ensureLogDir = () => {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }
  };
  const stamp = () => new Date().toISOString();
  const serialize = (args) =>
    args
      .map((a) => {
        if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
      })
      .join(' ');
  const writeLine = (prefix, args) => {
    try { ensureLogDir(); fs.appendFileSync(LOG_FILE, `[${stamp()}] ${prefix} ${serialize(args)}\n`); } catch { /* ignore */ }
  };

  return {
    name: 'error-file-logger',
    apply: 'serve',
    configureServer(server) {
      const originalConsoleError = console.error;
      console.error = (...args) => { writeLine('console.error', args); originalConsoleError(...args); };

      const originalLoggerError = server.config.logger.error.bind(server.config.logger);
      server.config.logger.error = (...args) => { writeLine('vite.logger.error', args); originalLoggerError(...args); };

      process.on('uncaughtException', (err) => writeLine('uncaughtException', [err]));
      process.on('unhandledRejection', (reason) => writeLine('unhandledRejection', [reason]));

      if (server.httpServer) {
        server.httpServer.on('clientError', (err) => writeLine('http.clientError', [err]));
        server.httpServer.on('error', (err) => writeLine('http.error', [err]));
      }
    },
  };
}

function fullReloadOnBackendPy() {
  const PATTERNS = [path.join(process.cwd(), 'backend', '**', '*.py')];
  return {
    name: 'full-reload-backend-python',
    apply: 'serve',
    configureServer(server) {
      for (const pattern of PATTERNS) {
        try { server.watcher.add(pattern); } catch { /* ignore */ }
      }
      let debounce;
      const scheduleReload = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => server.ws.send({ type: 'full-reload' }), 120);
      };
      const onFsEvent = (file) => { if (file && file.endsWith('.py')) scheduleReload(); };
      server.watcher.on('add', onFsEvent);
      server.watcher.on('change', onFsEvent);
      server.watcher.on('unlink', onFsEvent);
    },
  };
}

// The client error reporter is imported by src/main.jsx so it gets bundled;
// injecting a raw /src script tag here broke on production builds.

export default defineConfig({
  plugins: [errorFileLogger(), svgr(), react(), fullReloadOnBackendPy()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // HTTP + WS under /api (current setup used by matchmakingClient.js)
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        ws: true,
      },

      // Optional: forward common bare websocket prefixes if you add non-/api WS routes later.
      '/ws': {
        target: 'ws://backend:8000',
        changeOrigin: true,
        ws: true,
      },
      '/socket': {
        target: 'ws://backend:8000',
        changeOrigin: true,
        ws: true,
      },
    },
    watch: {
      usePolling: true,
      interval: 100,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    },
  },
  build: {
    // Public HTML entry points: homepage, daily puzzle, and the rulebook.
    // The rulebook enhances its static text with the live board examples.
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), 'index.html'),
        puzzle: path.resolve(process.cwd(), 'puzzle.html'),
        rules: path.resolve(process.cwd(), 'rules.html'),
      },
    },
  },
});
