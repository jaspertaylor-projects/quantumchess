// frontend/src/errors/ErrorBoundary.jsx
// Purpose: Catch React render/lifecycle errors, render a friendly fallback, and report details (incl. componentStack) to /api/client-error so they land in logs/frontend-error.log.
// Imports From: ../theme.js
// Exported To: frontend/src/main.jsx

import React from 'react';
import theme from '../theme.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: (error && error.message) || 'RenderError' };
  }

  componentDidCatch(error, info) {
    try {
      const payload = {
        severity: 'error',
        message: (error && error.message) || 'RenderError',
        stack: (error && error.stack) || '',
        source: 'ReactErrorBoundary',
        line: 0,
        col: 0,
        url:
          typeof window !== 'undefined' && window.location && window.location.href
            ? window.location.href
            : '',
        userAgent:
          typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '',
        componentStack: (info && info.componentStack) || '',
      };

      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // Best-effort reporting; never block UI.
    }
  }

  render() {
    if (this.state.hasError) {
      const styles = {
        pvErrorBoundaryContainer: {
          backgroundColor: theme.globalBackground,
          color: theme.textPrimary,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'sans-serif',
          boxSizing: 'border-box',
        },
        pvErrorBoundaryTitle: {
          color: theme.error,
          marginBottom: '1rem',
        },
        pvErrorBoundaryMessage: {
          color: theme.textSecondary,
          fontFamily: 'monospace',
          backgroundColor: theme.secondary,
          padding: '1rem',
          borderRadius: '8px',
          maxWidth: '800px',
          wordBreak: 'break-word',
          textAlign: 'left',
        },
      };

      return (
        <div className="pv-error-boundary" style={styles.pvErrorBoundaryContainer}>
          <h1 className="pv-error-boundary__title" style={styles.pvErrorBoundaryTitle}>
            Something went wrong
          </h1>
          <p className="pv-error-boundary__message" style={styles.pvErrorBoundaryMessage}>
            {this.state.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
