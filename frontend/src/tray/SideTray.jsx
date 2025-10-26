// frontend/src/tray/SideTray.jsx
// Purpose: Right-side tray that matches the chessboard height and shows either matchmaking or move history based on game state; includes a clearly visible settings button on the right.
// Imports From: ../theme.js, ./FindMatchPanel.jsx, ./MoveHistoryPanel.jsx, ../components/IconButton.jsx
// Exported To: ../App.jsx

import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import theme from '../theme.js';
import FindMatchPanel from './FindMatchPanel.jsx';
import MoveHistoryPanel from './MoveHistoryPanel.jsx';
import { Settings as SettingsIcon } from 'lucide-react';
import IconButton from '../components/IconButton.jsx';

export default function SideTray({
  height = 0,
  onOpenSettings = () => {},
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
          bg={theme.primary}
          color={theme.secondary}
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
    </aside>
  );
}
