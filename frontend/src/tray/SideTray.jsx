// frontend/src/tray/SideTray.jsx
// Purpose: Right-side tray that contains move history and quick actions. Proxies highlight and seek events up to the App, and adapts to the board's height.
// Imports From: ./MoveHistoryPanel.jsx, ../components/IconButton.jsx, ../theme.js
// Exported To: ../App.jsx

import React, { useMemo } from 'react';
import MoveHistoryPanel from './MoveHistoryPanel.jsx';
import IconButton from '../components/IconButton.jsx';
import theme from '../theme.js';
import { Settings as SettingsIcon, BookOpen as BookOpenIcon, Plus as PlusIcon } from 'lucide-react';

export default function SideTray({
  height = 0,
  infoMessage = '',
  onOpenSettings = () => {},
  onOpenRules = () => {},
  onOpenNewGame = () => {},
  onSetHighlights = () => {},
  onClearHighlights = () => {},
  onSeekToIndex = () => {},
}) {
  const styles = useMemo(() => ({
    root: {
      width: 'min(38vmin, 340px)',
      minWidth: 220,
      height: height || '100%',
      maxHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      background: 'rgba(255,255,255,0.04)',
      boxShadow: `0 6px 18px ${theme.shadow}`,
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: 8,
      borderBottom: `1px solid ${theme.border}`,
      background: 'rgba(255,255,255,0.03)',
    },
    headerTitle: {
      fontSize: 14,
      fontWeight: 800,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: theme.textSecondary,
    },
    spacer: { flex: 1 },
    content: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
  }), [height]);

  return (
    <aside className="qc-side-tray-root" style={styles.root} aria-label="Move history and controls">
      <div className="qc-side-tray-header" style={styles.header}>
        <IconButton
          icon={PlusIcon}
          size={18}
          width={32}
          height={32}
          title="New Game"
          ariaLabel="Start a new game"
          className="qc-side-tray-new-game-btn"
          onClick={onOpenNewGame}
          bg={'#22c55e'}
          color={'#ffffff'}
          hoverInvert={true}
          hoverBg="transparent"
        />
        <span className="qc-side-tray-title" style={styles.headerTitle}>Game</span>
        <div className="qc-side-tray-spacer" style={styles.spacer} />
        <IconButton
          icon={BookOpenIcon}
          size={16}
          width={32}
          height={32}
          title="Rules"
          ariaLabel="Open rules"
          className="qc-side-tray-rules-btn"
          onClick={onOpenRules}
          bg={theme.secondary}
          color={theme.primary}
          hoverInvert={true}
        />
        <IconButton
          icon={SettingsIcon}
          size={16}
          width={32}
          height={32}
          title="Settings"
          ariaLabel="Open settings"
          className="qc-side-tray-settings-btn"
          onClick={onOpenSettings}
          bg={theme.secondary}
          color={theme.primary}
          hoverInvert={true}
        />
      </div>

      <div className="qc-side-tray-content" style={styles.content}>
        <MoveHistoryPanel
          infoMessage={infoMessage}
          onHighlightMove={onSetHighlights}
          onClearHighlights={onClearHighlights}
          onSeekToIndex={onSeekToIndex}
        />
      </div>
    </aside>
  );
}
