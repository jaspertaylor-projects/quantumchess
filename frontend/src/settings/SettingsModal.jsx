// frontend/src/settings/SettingsModal.jsx
// Purpose: Modal dialog for configuring per-side SVG color variables, board square colors, player bar colors, and toggling coordinate labels; includes icon-only actions for restore defaults and close.
// Imports From: ../theme.js, ../components/IconButton.jsx
// Exported To: ../App.jsx

import React, { useState, useEffect } from 'react';
import theme from '../theme.js';
import { X, RotateCcw } from 'lucide-react';
import IconButton from '../components/IconButton.jsx';

export default function SettingsModal({
  open = false,
  onClose = () => {},
  whiteColors,
  blackColors,
  boardColors,
  playerBarColors,
  showCoordinates,
  defaultWhiteColors,
  defaultBlackColors,
  defaultBoardColors,
  defaultPlayerBarColors,
  onAccept = () => {},
}) {
  const [localWhite, setLocalWhite] = useState(whiteColors);
  const [localBlack, setLocalBlack] = useState(blackColors);
  const [localBoard, setLocalBoard] = useState(boardColors);
  const [localPlayerBar, setLocalPlayerBar] = useState(playerBarColors);
  const [localShowCoordinates, setLocalShowCoordinates] = useState(showCoordinates);

  useEffect(() => {
    if (open) {
      setLocalWhite(whiteColors);
      setLocalBlack(blackColors);
      setLocalBoard(boardColors);
      setLocalPlayerBar(playerBarColors);
      setLocalShowCoordinates(showCoordinates);
    }
  }, [open, whiteColors, blackColors, boardColors, playerBarColors, showCoordinates]);

  if (!open) return null;

  const handleAccept = () => {
    onAccept({
      white: localWhite,
      black: localBlack,
      board: localBoard,
      playerBar: localPlayerBar,
      coordinates: localShowCoordinates,
    });
    onClose();
  };

  const handleReset = () => {
    if (defaultWhiteColors) setLocalWhite(defaultWhiteColors);
    if (defaultBlackColors) setLocalBlack(defaultBlackColors);
    if (defaultBoardColors) setLocalBoard(defaultBoardColors);
    if (defaultPlayerBarColors) setLocalPlayerBar(defaultPlayerBarColors);
  };

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
    checkboxInput: {
      width: 44,
      height: 24,
      display: 'inline-block',
      cursor: 'pointer',
      accentColor: theme.primary,
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
    acceptButton: {
      padding: '8px 16px',
      borderRadius: 8,
      border: 'none',
      backgroundColor: theme.primary,
      color: theme.secondary,
      fontWeight: 700,
      fontSize: 14,
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    },
    fullSpan: {
      gridColumn: '1 / -1',
    },
  };

  const handleWhite = (key) => (e) => setLocalWhite((p) => ({ ...p, [key]: e.target.value }));
  const handleBlack = (key) => (e) => setLocalBlack((p) => ({ ...p, [key]: e.target.value }));
  const handleBoard = (key) => (e) => setLocalBoard((p) => ({ ...p, [key]: e.target.value }));
  const handlePlayerBar = (key) => (e) => setLocalPlayerBar((p) => ({ ...p, [key]: e.target.value }));

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
          <IconButton
            icon={X}
            size={20}
            title="Close settings"
            ariaLabel="Close settings"
            className="qc-settings-close"
            onClick={onClose}
            width={36}
            height={36}
            radius={8}
            bg={theme.secondary}
            color={theme.error}
            hoverInvert={true}
            shadow="transparent"
          />
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
                value={localWhite.icon}
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
                value={localWhite.bandFill}
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
                value={localWhite.bandStroke}
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
                value={localBlack.icon}
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
                value={localBlack.bandFill}
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
                value={localBlack.bandStroke}
                onChange={handleBlack('bandStroke')}
                aria-label="Black band stroke color"
              />
            </div>
          </div>

          <div className="qc-settings-card qc-settings-card--player-bars" style={{ ...styles.card, ...styles.fullSpan }}>
            <div className="qc-settings-card-title" style={styles.cardTitle}>Player Bars</div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-playerbar-background" style={styles.label}>Bar Background</label>
              <input
                id="qc-playerbar-background"
                type="color"
                className="qc-color-input qc-color-input--playerbar-background"
                style={styles.colorInput}
                value={localPlayerBar.background}
                onChange={handlePlayerBar('background')}
                aria-label="Player bar background color"
              />
            </div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-playerbar-text" style={styles.label}>Bar Text</label>
              <input
                id="qc-playerbar-text"
                type="color"
                className="qc-color-input qc-color-input--playerbar-text"
                style={styles.colorInput}
                value={localPlayerBar.text}
                onChange={handlePlayerBar('text')}
                aria-label="Player bar text color"
              />
            </div>
          </div>

          <div className="qc-settings-card qc-settings-card--board" style={{ ...styles.card, ...styles.fullSpan }}>
            <div className="qc-settings-card-title" style={styles.cardTitle}>Board Squares</div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-board-light" style={styles.label}>Light Squares</label>
              <input
                id="qc-board-light"
                type="color"
                className="qc-color-input qc-color-input--board-light"
                style={styles.colorInput}
                value={localBoard.light}
                onChange={handleBoard('light')}
                aria-label="Light square color"
              />
            </div>

            <div className="qc-settings-row" style={styles.row}>
              <label htmlFor="qc-board-dark" style={styles.label}>Dark Squares</label>
              <input
                id="qc-board-dark"
                type="color"
                className="qc-color-input qc-color-input--board-dark"
                style={styles.colorInput}
                value={localBoard.dark}
                onChange={handleBoard('dark')}
                aria-label="Dark square color"
              />
            </div>

            <div className="qc-settings-row qc-settings-row--coordinates" style={styles.row}>
              <label htmlFor="qc-board-coordinates-toggle" style={styles.label}>Show Coordinates</label>
              <input
                id="qc-board-coordinates-toggle"
                type="checkbox"
                className="qc-checkbox-input qc-checkbox-input--coordinates"
                style={styles.checkboxInput}
                checked={!!localShowCoordinates}
                onChange={(e) => setLocalShowCoordinates(e.target.checked)}
                aria-label="Toggle board coordinates"
              />
            </div>
          </div>
        </div>

        <p className="qc-settings-hint" style={styles.hint}>
          Hint: Piece colors apply to quantum piece SVGs via CSS variables. Player bar colors apply to both top and bottom bars. Board colors affect light/dark square backgrounds.
        </p>

        <div className="qc-settings-footer" style={styles.footer}>
          <IconButton
            icon={RotateCcw}
            size={18}
            title="Restore default colors"
            ariaLabel="Restore default colors"
            className="qc-settings-reset"
            onClick={handleReset}
            width={36}
            height={36}
            radius={8}
            bg={theme.secondary}
            color={theme.primary}
            hoverInvert={true}
          />
          <button
            className="qc-settings-accept-button"
            style={styles.acceptButton}
            onClick={handleAccept}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
