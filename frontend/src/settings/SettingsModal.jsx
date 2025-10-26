// frontend/src/settings/SettingsModal.jsx
// Purpose: A modal dialog for selecting per-side SVG color presets with a simple, accessible UI.
// Imports From: ./usePieceColors.js
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';
import { X } from 'lucide-react';

export default function SettingsModal({ open, onClose, presets, whiteKey, blackKey, onChangeWhite, onChangeBlack }) {
  if (!open) return null;

  const styles = {
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999,
    },
    panel: {
      width: 'min(92vw, 520px)',
      maxWidth: '520px',
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      backgroundColor: theme.cardBackground,
      boxShadow: `0 12px 32px ${theme.shadow}`,
      color: theme.textPrimary,
      padding: 16,
      boxSizing: 'border-box',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    title: {
      margin: 0,
      fontSize: '1.125rem',
      fontWeight: 800,
      letterSpacing: '0.04em',
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: 'transparent',
      color: theme.textPrimary,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
    },
    section: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      marginTop: 12,
    },
    field: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: 12,
    },
    label: {
      fontSize: 13,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 700,
    },
    select: {
      width: '100%',
      padding: '8px 10px',
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      backgroundColor: '#1a1a1a',
      color: theme.textPrimary,
      cursor: 'pointer',
    },
    hint: {
      marginTop: 12,
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 1.4,
    },
  };

  return (
    <div className="qc-settings-backdrop" style={styles.backdrop} onClick={onClose}>
      <div
        className="qc-settings-panel"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qc-settings-title"
      >
        <div className="qc-settings-header" style={styles.header}>
          <h2 id="qc-settings-title" className="qc-settings-title" style={styles.title}>Settings</h2>
          <button
            type="button"
            aria-label="Close settings"
            className="qc-settings-close"
            style={styles.closeBtn}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="qc-settings-section" style={styles.section}>
          <div className="qc-settings-field" style={styles.field}>
            <label htmlFor="qc-select-white" style={styles.label}>White Team Color</label>
            <select
              id="qc-select-white"
              className="qc-select-white"
              style={styles.select}
              value={whiteKey}
              onChange={(e) => onChangeWhite(e.target.value)}
            >
              {presets.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="qc-settings-field" style={styles.field}>
            <label htmlFor="qc-select-black" style={styles.label}>Black Team Color</label>
            <select
              id="qc-select-black"
              className="qc-select-black"
              style={styles.select}
              value={blackKey}
              onChange={(e) => onChangeBlack(e.target.value)}
            >
              {presets.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="qc-settings-hint" style={styles.hint}>
          Tip: Colors are applied using CSS filters to tint the piece SVGs. Choose contrasting colors for best readability.
        </p>
      </div>
    </div>
  );
}
