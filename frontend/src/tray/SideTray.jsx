// frontend/src/tray/SideTray.jsx
// Purpose: Right-side tray container rendered next to the board; hosts mode tabs (Find Match, Move History) and a settings button in the top-right; height matches the chessboard.
// Imports From: ../theme.js, ./FindMatchPanel.jsx, ./MoveHistoryPanel.jsx
// Exported To: ../App.jsx

import React, { useMemo, useState } from 'react';
import theme from '../theme.js';
import FindMatchPanel from './FindMatchPanel.jsx';
import MoveHistoryPanel from './MoveHistoryPanel.jsx';
import { Settings as SettingsIcon, History as HistoryIcon, Search as SearchIcon } from 'lucide-react';

export default function SideTray({
  height = 0,
  onOpenSettings = () => {},
  onSetHighlights = () => {},
  onClearHighlights = () => {},
}) {
  const [mode, setMode] = useState('find'); // 'find' | 'history'

  const styles = useMemo(() => ({
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
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 10px 10px 10px',
      borderBottom: `1px solid ${theme.border}`,
      userSelect: 'none',
      gap: 8,
    },
    tabs: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: 4,
    },
    tabBtn: (active) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 10px',
      borderRadius: 8,
      border: 'none',
      background: active ? theme.primary : 'transparent',
      color: active ? theme.buttonText : theme.textPrimary,
      cursor: 'pointer',
    }),
    growTitle: {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: 13,
      color: theme.textSecondary,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      fontWeight: 800,
      pointerEvents: 'none',
    },
    settingsBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: 'transparent',
      color: theme.textPrimary,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
    },
    content: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
  }), [height]);

  return (
    <aside className="qc-side-tray-root" style={styles.root} aria-label="Right side game tray">
      <div className="qc-side-tray-header" style={styles.header}>
        <div className="qc-side-tray-tabs" style={styles.tabs} role="tablist" aria-label="Tray modes">
          <button
            type="button"
            className="qc-side-tray-tab qc-side-tray-tab--find"
            style={styles.tabBtn(mode === 'find')}
            aria-selected={mode === 'find'}
            role="tab"
            onClick={() => setMode('find')}
          >
            <SearchIcon size={16} />
            <span>Find Match</span>
          </button>
          <button
            type="button"
            className="qc-side-tray-tab qc-side-tray-tab--history"
            style={styles.tabBtn(mode === 'history')}
            aria-selected={mode === 'history'}
            role="tab"
            onClick={() => setMode('history')}
          >
            <HistoryIcon size={16} />
            <span>Move History</span>
          </button>
        </div>

        <div className="qc-side-tray-title" style={styles.growTitle} aria-hidden="true">
          Quantum Tools
          
        </div>

        <button
          type="button"
          aria-label="Open settings"
          title="Settings"
          className="qc-side-tray-settings"
          style={styles.settingsBtn}
          onClick={onOpenSettings}
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      <div className="qc-side-tray-content" style={styles.content}>
        {mode === 'find' ? (
          <FindMatchPanel />
        ) : (
          <MoveHistoryPanel onHighlightMove={onSetHighlights} onClearHighlights={onClearHighlights} />
        )}
      </div>
    </aside>
  );
}
