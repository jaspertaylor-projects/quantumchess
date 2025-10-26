// frontend/src/settings/SettingsModal.jsx
// Purpose: Modal dialog for configuring per-side SVG color variables with native color pickers and a one-click restore-defaults action.
// Imports From: ../theme.js
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';
import { X, RotateCcw } from 'lucide-react';

export default function SettingsModal({
  open = false,
  onClose = () => {},
  whiteColors = { icon: '#ffffff', bandFill: '#1f2937', bandStroke: '#f2f2f2' },
  blackColors = { icon: '#111827', bandFill: '#e5e7eb', bandStroke: '#111827' },
  onChangeWhite = () => {},
  onChangeBlack = () => {},
  onReset = () => {},
}) {
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
      width: 'min(92vw, 560px)',
      maxWidth: '560px',
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
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      marginTop: 12,
    },
    card: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: 12,
    },
    cardTitle: {
      fontSize: 13,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 800,
    },
    row: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: 10,
    },
    label: {
      fontSize: 13,
      color: theme.textSecondary,
      letterSpacing: '0.04em',
      fontWeight: 700,
    },
    colorInput: {
      width: 44,
      height: 32,
      padding: 0,
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: 'transparent',
      cursor: 'pointer',
    },
    hint: {
      marginTop: 12,
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 1.4,
    },
    footer: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 16,
    },
    resetBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: 'transparent',
      color: theme.textPrimary,
      cursor: 'pointer',
    },
  };

  const handleWhite = (key) => (e) => onChangeWhite({ [key]: e.target.value });
  const handleBlack = (key) => (e) => onChangeBlack({ [key]: e.target.value });

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

        <div className="qc-settings-grid" style={styles.grid}>
          <div className="qc-settings-card qc-settings-card--white" style={styles.card}>
            <div className="qc-settings-card-title" style={styles.cardTitle}>White Team</div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-white-icon" style={styles.label}>Icon Color</label>
              <input
                id="qc-white-icon"
                type="color"
                className="qc-color-input qc-color-input--white-icon"
                style={styles.colorInput}
                value={whiteColors.icon}
                onChange={handleWhite('icon')}
                aria-label="White icon color"
              />
            </div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-white-band-fill" style={styles.label}>Band Fill</label>
              <input
                id="qc-white-band-fill"
                type="color"
                className="qc-color-input qc-color-input--white-band-fill"
                style={styles.colorInput}
                value={whiteColors.bandFill}
                onChange={handleWhite('bandFill')}
                aria-label="White band fill color"
              />
            </div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-white-band-stroke" style={styles.label}>Band Stroke</label>
              <input
                id="qc-white-band-stroke"
                type="color"
                className="qc-color-input qc-color-input--white-band-stroke"
                style={styles.colorInput}
                value={whiteColors.bandStroke}
                onChange={handleWhite('bandStroke')}
                aria-label="White band stroke color"
              />
            </div>
          </div>

          <div className="qc-settings-card qc-settings-card--black" style={styles.card}>
            <div className="qc-settings-card-title" style={styles.cardTitle}>Black Team</div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-black-icon" style={styles.label}>Icon Color</label>
              <input
                id="qc-black-icon"
                type="color"
                className="qc-color-input qc-color-input--black-icon"
                style={styles.colorInput}
                value={blackColors.icon}
                onChange={handleBlack('icon')}
                aria-label="Black icon color"
              />
            </div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-black-band-fill" style={styles.label}>Band Fill</label>
              <input
                id="qc-black-band-fill"
                type="color"
                className="qc-color-input qc-color-input--black-band-fill"
                style={styles.colorInput}
                value={blackColors.bandFill}
                onChange={handleBlack('bandFill')}
                aria-label="Black band fill color"
              />
            </div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-black-band-stroke" style={styles.label}>Band Stroke</label>
              <input
                id="qc-black-band-stroke"
                type="color"
                className="qc-color-input qc-color-input--black-band-stroke"
                style={styles.colorInput}
                value={blackColors.bandStroke}
                onChange={handleBlack('bandStroke')}
                aria-label="Black band stroke color"
              />
            </div>
          </div>
        </div>

        <div className="qc-settings-footer" style={styles.footer}>
          <p className="qc-settings-hint" style={styles.hint}>
            Hint: Colors are applied to quantum piece SVGs via CSS variables. Choose contrasting colors for icon and bands for best readability.
          </p>
          <button
            type="button"
            className="qc-settings-reset"
            style={styles.resetBtn}
            onClick={onReset}
            aria-label="Restore default colors"
            title="Restore default colors"
          >
            <RotateCcw size={18} />
            <span>Restore Defaults</span>
          </button>
        </div>
      </div>
    </div>
  );
}
