// frontend/src/tray/SideTray.jsx
// Purpose: Right-side tray that matches the chessboard height and shows either matchmaking or move history based on game state; includes settings and rules access. Renders a footer with a View Rules button beneath the main content.
// Imports From: ../theme.js, ./FindMatchPanel.jsx, ./MoveHistoryPanel.jsx, ../components/IconButton.jsx
// Exported To: ../App.jsx

import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import theme from '../theme.js';
import FindMatchPanel from './FindMatchPanel.jsx';
import MoveHistoryPanel from './MoveHistoryPanel.jsx';
import { Settings as SettingsIcon, Book as BookIcon } from 'lucide-react';
import IconButton from '../components/IconButton.jsx';

export default function SideTray({
  height = 0,
  onOpenSettings = () => {},
  onOpenRules = () => {},
  onSetHighlights = () => {},
  onClearHighlights = () => {},
}) {
  const movesLength = useSelector((s) => s.game.moves.length);
  const inGame = movesLength > 0;

  const styles = useMemo(
    () => ({
      root: {
        height: height > 0 ? `${height}px` : '0px',
        minHeight: height > 0 ? `${height}px` : '0px',
        width: 'min(38vw, 380px)',
        minWidth: 260,
        display: height > 0 ? 'flex' : 'none',
        flexDirection: 'column',
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        backgroundColor: theme.cardBackground,
        color: theme.textPrimary,
        boxShadow: `0 8px 24px ${theme.shadow}`,
        overflow: 'hidden',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderBottom: `1px solid ${theme.border}`,
        userSelect: 'none',
        background: 'rgba(255,255,255,0.02)',
      },
      title: {
        fontSize: 13,
        color: theme.textSecondary,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 800,
      },
      content: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      },
      footer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: 10,
        borderTop: `1px solid ${theme.border}`,
        background: 'rgba(255,255,255,0.02)',
      },
      rulesButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.buttonGenericBackground,
        color: theme.textPrimary,
        cursor: 'pointer',
        fontWeight: 700,
        letterSpacing: '0.04em',
        transition: 'background-color 0.15s ease, transform 0.06s ease',
      },
    }),
    [height]
  );

  const headerTitle = inGame ? 'Move History' : 'Matchmaking Lobby';

  return (
    <aside className="qc-side-tray-root" style={styles.root} aria-label="Right side game tray">
      <div className="qc-side-tray-header" style={styles.header}>
        <div className="qc-side-tray-title" style={styles.title}>{headerTitle}</div>
        <IconButton
          icon={SettingsIcon}
          size={18}
          title="Settings"
          ariaLabel="Open settings"
          className="qc-side-tray-settings"
          onClick={onOpenSettings}
          bg={theme.secondary}
          color={theme.primary}
          hoverInvert={true}
        />
      </div>

      <div className="qc-side-tray-content" style={styles.content}>
        {inGame ? (
          <MoveHistoryPanel onHighlightMove={onSetHighlights} onClearHighlights={onClearHighlights} />
        ) : (
          <FindMatchPanel />
        )}
      </div>

      <div className="qc-side-tray-footer" style={styles.footer}>
        <button
          type="button"
          className="qc-side-tray-rules-button"
          style={styles.rulesButton}
          onClick={onOpenRules}
          aria-label="View game rules"
          title="View Rules"
        >
          <BookIcon size={18} />
          <span>View Rules</span>
        </button>
      </div>
    </aside>
  );
}
