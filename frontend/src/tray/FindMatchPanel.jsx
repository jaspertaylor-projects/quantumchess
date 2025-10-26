// frontend/src/tray/FindMatchPanel.jsx
// Purpose: Simple matchmaking panel placeholder; provides basic UI for future integration and consistent tray content layout.
// Imports From: ../theme.js
// Exported To: ./SideTray.jsx

import React, { useMemo } from 'react';
import theme from '../theme.js';
import { Search as SearchIcon, Users as UsersIcon } from 'lucide-react';

export default function FindMatchPanel() {
  const styles = useMemo(() => ({
    root: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: 12,
      boxSizing: 'border-box',
      gap: 12,
      overflow: 'auto',
    },
    card: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: 12,
    },
    title: {
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
      gap: 8,
    },
    button: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      background: theme.primary,
      color: theme.buttonText,
      border: 'none',
      borderRadius: 8,
      padding: '10px 12px',
      cursor: 'pointer',
      fontWeight: 700,
    },
    muted: {
      fontSize: 12,
      color: theme.textMuted,
    },
    statRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      color: theme.textSecondary,
      fontSize: 13,
    },
    dot: (color) => ({
      width: 8,
      height: 8,
      borderRadius: 999,
      background: color,
    }),
  }), []);

  return (
    <div className="qc-find-match-root" style={styles.root}>
      <div className="qc-find-match-card" style={styles.card}>
        <div className="qc-find-match-title" style={styles.title}>Quick Match</div>
        <div className="qc-find-match-row" style={styles.row}>
          <span>Find an opponent and start a game</span>
          <button type="button" className="qc-find-match-button" style={styles.button} onClick={() => alert('Matchmaking placeholder')}> 
            <SearchIcon size={16} />
            <span>Find Match</span>
          </button>
        </div>
        <div className="qc-find-match-muted" style={styles.muted}>Backend integration pending. This is a placeholder for future matchmaking workflows.</div>
      </div>

      <div className="qc-find-stats-card" style={styles.card}>
        <div className="qc-find-stats-title" style={styles.title}>Activity</div>
        <div className="qc-find-stats-row" style={styles.statRow}>
          <div style={styles.dot('#34d399')} />
          <UsersIcon size={14} />
          <span>Players Online</span>
          <span style={{ marginLeft: 'auto', color: theme.textPrimary }}>42</span>
        </div>
        <div className="qc-find-stats-row" style={styles.statRow}>
          <div style={styles.dot('#60a5fa')} />
          <span>Open Lobbies</span>
          <span style={{ marginLeft: 'auto', color: theme.textPrimary }}>7</span>
        </div>
      </div>
    </div>
  );
}
