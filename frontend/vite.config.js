// frontend/vite.config.js
// Purpose: Vite config for the scaffolded app. Logs dev-server errors to logs/frontend-error.log, injects a browser error reporter module into index.html so runtime errors are posted to /api/client-error, and triggers full reload on backend Python changes.
// Imports From: None
// Exported To: 'pnpm run dev' and production builds.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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

function injectClientReporter() {
  return {
    name: 'inject-client-error-reporter',
    // apply to both dev and build so production bundles include the reporter as well
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/src/errors/clientErrorReporter.js' },
          injectTo: 'head',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [errorFileLogger(), react(), fullReloadOnBackendPy(), injectClientReporter()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://backend:8000', changeOrigin: true },
    },
    watch: {
      usePolling: true,
      interval: 100,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    },
  },
});
