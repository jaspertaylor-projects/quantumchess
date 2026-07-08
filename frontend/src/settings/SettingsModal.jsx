// frontend/src/settings/SettingsModal.jsx
// Purpose: Modal dialog for configuring per-side SVG color variables, board square colors, player bar colors, and toggling coordinate labels; includes icon-only actions for restore defaults and close.
// Imports From: ../theme.js, ../components/IconButton.jsx, ../components/ModalShell.jsx
// Exported To: ../App.jsx

import React, { useState, useEffect } from 'react';
import theme from '../theme.js';
import { X, RotateCcw, ChevronDown } from 'lucide-react';
import IconButton from '../components/IconButton.jsx';
import ModalShell from '../components/ModalShell.jsx';
import { DEFAULT_INDICATORS, INDICATOR_LABELS, INDICATOR_PRESETS, PRESET_LABELS, matchIndicatorPreset } from './useIndicatorSettings.js';
import SayingsEditor from '../sayings/SayingsEditor.jsx';

export default function SettingsModal({
  open = false,
  onClose = () => {},
  auth = null, // sayings save to the profile when signed in
  localSayings = {},
  onSaveLocalSayings = () => {},
  whiteColors,
  blackColors,
  boardColors,
  playerBarColors,
  indicators,
  showCoordinates,
  showCheckOverlay,
  defaultWhiteColors,
  defaultBlackColors,
  defaultBoardColors,
  defaultPlayerBarColors,
  onAccept = async () => {},
}) {
  const [localWhite, setLocalWhite] = useState(whiteColors);
  const [localBlack, setLocalBlack] = useState(blackColors);
  const [localBoard, setLocalBoard] = useState(boardColors);
  const [localPlayerBar, setLocalPlayerBar] = useState(playerBarColors);
  const [localIndicators, setLocalIndicators] = useState(indicators || DEFAULT_INDICATORS);
  const [localShowCoordinates, setLocalShowCoordinates] = useState(showCoordinates);
  const [localShowCheckOverlay, setLocalShowCheckOverlay] = useState(showCheckOverlay);
  const [isAccepting, setIsAccepting] = useState(false);
  const [openSection, setOpenSection] = useState(null);

  useEffect(() => {
    if (open) {
      setOpenSection(null);
      setLocalWhite(whiteColors);
      setLocalBlack(blackColors);
      setLocalBoard(boardColors);
      setLocalPlayerBar(playerBarColors);
      setLocalIndicators(indicators || DEFAULT_INDICATORS);
      setLocalShowCoordinates(showCoordinates);
      setLocalShowCheckOverlay(showCheckOverlay);
    }
  }, [open, whiteColors, blackColors, boardColors, playerBarColors, indicators, showCoordinates, showCheckOverlay]);

  if (!open) return null;

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onAccept({
        white: localWhite,
        black: localBlack,
        board: localBoard,
        playerBar: localPlayerBar,
        indicators: localIndicators,
        coordinates: localShowCoordinates,
        checkOverlay: localShowCheckOverlay,
      });
      onClose(); // Close only on success
    } catch (error) {
      console.error('Failed to apply settings:', error);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReset = () => {
    if (defaultWhiteColors) setLocalWhite(defaultWhiteColors);
    if (defaultBlackColors) setLocalBlack(defaultBlackColors);
    if (defaultBoardColors) setLocalBoard(defaultBoardColors);
    if (defaultPlayerBarColors) setLocalPlayerBar(defaultPlayerBarColors);
    setLocalIndicators({ ...DEFAULT_INDICATORS });
  };

  const activePreset = matchIndicatorPreset(localIndicators);
  const applyPreset = (name) => {
    const preset = INDICATOR_PRESETS[name];
    if (preset) setLocalIndicators({ ...preset });
  };

  const PRESET_HINTS = {
    total: 'Every visual hint on.',
    amateur: 'Hides check arrows. The default.',
    master: 'Also hides red check rings and weak-measurement circles.',
    grandmaster: 'Also hides decoherence dots and all insignia (promotion, entanglement, recoherence).',
    goat: 'Also hides the piece icons inside 3+ possibility bands. Bands only.',
  };

  const styles = {
    panel: {
      width: 'min(92vw, 560px)',
      maxWidth: '560px',
      maxHeight: '90vh',
      overflowY: 'auto',
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
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
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
    sectionCard: {
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      overflow: 'hidden',
    },
    sectionToggle: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '11px 12px',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      textAlign: 'left',
    },
    sectionBody: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '2px 12px 12px',
    },
    chevron: (isOpen) => ({
      transform: isOpen ? 'rotate(180deg)' : 'none',
      transition: 'transform 150ms ease',
      color: theme.textSecondary,
      flex: 'none',
    }),
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
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minWidth: 120,
    },
    spinner: {
      border: '2px solid rgba(255,255,255,0.3)',
      borderTop: '2px solid #fff',
      borderRadius: '50%',
      width: 16,
      height: 16,
      animation: 'spin 1s linear infinite',
    },
    fullSpan: {
      gridColumn: '1 / -1',
    },
  };

  const handleWhite = (key) => (e) => setLocalWhite((p) => ({ ...p, [key]: e.target.value }));
  const handleBlack = (key) => (e) => setLocalBlack((p) => ({ ...p, [key]: e.target.value }));
  const handleBoard = (key) => (e) => setLocalBoard((p) => ({ ...p, [key]: e.target.value }));
  const handlePlayerBar = (key) => (e) => setLocalPlayerBar((p) => ({ ...p, [key]: e.target.value }));

  // Accordion drawer: one section open at a time keeps the panel short.
  const renderSection = (id, title, body) => {
    const isOpen = openSection === id;
    return (
      <div className={`qc-settings-card qc-settings-card--${id}`} style={styles.sectionCard}>
        <button
          type="button"
          className="qc-settings-section-toggle"
          style={styles.sectionToggle}
          onClick={() => setOpenSection(isOpen ? null : id)}
          aria-expanded={isOpen}
        >
          <span className="qc-settings-card-title" style={styles.cardTitle}>{title}</span>
          <ChevronDown size={16} style={styles.chevron(isOpen)} />
        </button>
        {isOpen ? <div className="qc-settings-section-body" style={styles.sectionBody}>{body}</div> : null}
      </div>
    );
  };

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      zIndex={999}
      ariaLabelledBy="qc-settings-title"
      backdropClassName="qc-settings-backdrop"
      panelClassName="qc-settings-panel"
      panelStyle={styles.panel}
    >
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
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
          {renderSection('white', 'White Team', <>
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
          </>)}

          {renderSection('black', 'Black Team', <>
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
          </>)}

          {renderSection('player-bars', 'Player Bars', <>
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
          </>)}

          {renderSection('sayings', 'Sayings', (
            <SayingsEditor auth={auth} localSayings={localSayings} onSaveLocalSayings={onSaveLocalSayings} />
          ))}

          {renderSection('board', 'Board Squares', <>
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

            <div className="qc-settings-row qc-settings-row--check-overlay" style={styles.row}>
              <label htmlFor="qc-board-check-overlay-toggle" style={styles.label}>Show Check Overlay</label>
              <input
                id="qc-board-check-overlay-toggle"
                type="checkbox"
                className="qc-checkbox-input qc-checkbox-input--check-overlay"
                style={styles.checkboxInput}
                checked={!!localShowCheckOverlay}
                onChange={(e) => setLocalShowCheckOverlay(e.target.checked)}
                aria-label="Toggle check overlay"
              />
            </div>
          </>)}

          {renderSection('indicators', 'Visual Reminders', <>
          <div className="qc-settings-preset-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.keys(INDICATOR_PRESETS).map((name) => {
              const selected = activePreset === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={`qc-settings-preset-btn qc-settings-preset-btn--${name}`}
                  onClick={() => applyPreset(name)}
                  aria-pressed={selected}
                  title={PRESET_HINTS[name]}
                  style={{
                    flex: '1 1 auto',
                    padding: '7px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: selected ? theme.primary : 'transparent',
                    color: selected ? theme.secondary : theme.textSecondary,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {PRESET_LABELS[name]}
                </button>
              );
            })}
            <span
              className="qc-settings-preset-custom"
              style={{
                flex: '1 1 auto',
                padding: '7px 10px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 8,
                border: `1px dashed ${theme.border}`,
                background: activePreset ? 'transparent' : theme.primary,
                color: activePreset ? theme.textSecondary : theme.secondary,
                textAlign: 'center',
                opacity: activePreset ? 0.55 : 1,
                whiteSpace: 'nowrap',
              }}
              title="Pick and choose below to build your own mix"
            >
              Custom
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: theme.textSecondary }}>
            {activePreset ? PRESET_HINTS[activePreset] : 'Custom mix — toggle anything below.'}
            {' '}Each level hides everything the previous one hides, plus more.
          </p>

          {Object.keys(DEFAULT_INDICATORS).map((key) => (
            <div key={key} className={`qc-settings-row qc-settings-row--indicator-${key}`} style={styles.row}>
              <label htmlFor={`qc-indicator-${key}-toggle`} style={styles.label}>{INDICATOR_LABELS[key] || key}</label>
              <input
                id={`qc-indicator-${key}-toggle`}
                type="checkbox"
                className={`qc-checkbox-input qc-checkbox-input--indicator-${key}`}
                style={styles.checkboxInput}
                checked={Boolean(localIndicators && localIndicators[key])}
                onChange={(e) => setLocalIndicators((prev) => ({ ...prev, [key]: e.target.checked }))}
                aria-label={`Toggle ${INDICATOR_LABELS[key] || key}`}
              />
            </div>
          ))}
          </>)}
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
            disabled={isAccepting}
          >
            {isAccepting ? (
              <>
                <div style={styles.spinner} />
                <span>Applying...</span>
              </>
            ) : (
              'Accept'
            )}
          </button>
        </div>
    </ModalShell>
  );
}
