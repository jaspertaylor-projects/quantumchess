// frontend/src/tray/SideTray.jsx
// Purpose: Right-side tray with a two-row header: top row holds all action buttons aligned right, bottom row shows the full-width title on its own line. Hosts move history, new game options, and in-game actions without horizontal scrolling.
// Imports From: ./MoveHistoryPanel.jsx, ./NewGamePanel.jsx, ../components/IconButton.jsx, ../theme.js
// Exported To: ../App.jsx

import React, { useMemo, useState, useEffect } from 'react';
import MoveHistoryPanel from './MoveHistoryPanel.jsx';
import NewGamePanel from './NewGamePanel.jsx';
import IconButton from '../components/IconButton.jsx';
import theme from '../theme.js';
import { Settings as SettingsIcon, BookOpen as BookOpenIcon, Plus as PlusIcon, Flag as FlagIcon, Handshake as HandshakeIcon } from 'lucide-react';

export default function SideTray({
  height = 0,
  infoMessage = '',
  onOpenSettings = () => {},
  onOpenRules = () => {},
  onStartGame = () => {},
  onSetHighlights = () => {},
  onClearHighlights = () => {},
  onSeekToIndex = () => {},
  externalIndex = undefined,
  isPlaying = false,
  onResign = () => {},
  onOfferDraw = () => {},
}) {
  const [view, setView] = useState('new-game'); // 'history' or 'new-game'

  useEffect(() => {
    if (isPlaying) {
      setView('history');
    }
  }, [isPlaying]);

  const handleStartGame = (settings) => {
    onStartGame(settings);
    setView('history');
  };

  const handleCancelNewGame = () => {
    setView('history');
  };

  const styles = useMemo(
    () => ({
      root: {
        width: 'clamp(260px, 38vmin, 360px)',
        minWidth: 240,
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
        flexDirection: 'column',
        padding: 8,
        borderBottom: `1px solid ${theme.border}`,
        background: 'rgba(255,255,255,0.03)',
        overflow: 'hidden',
        gap: 6,
      },
      headerTopRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        rowGap: 8,
        columnGap: 8,
      },
      headerBottomRow: {
        display: 'block',
        width: '100%',
      },
      headerTitle: {
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: theme.textSecondary,
        minWidth: 0,
        overflow: 'visible',
        textOverflow: 'clip',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
      },
      content: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      },
      actionGroup: {
        display: 'flex',
        alignItems: 'center',
        columnGap: 8,
        flexWrap: 'wrap',
      },
    }),
    [height]
  );

  const titleText = !isPlaying ? 'New Game' : 'Game Actions';

  return (
    <aside className="qc-side-tray-root" style={styles.root} aria-label="Move history and controls">
      <div className="qc-side-tray-header" style={styles.header}>
        <div className="qc-side-tray-header-top" style={styles.headerTopRow}>
          <div className="qc-side-tray-actions-right" style={styles.actionGroup}>
            {!isPlaying ? (
              <>
                <IconButton
                  icon={PlusIcon}
                  size={18}
                  width={32}
                  height={32}
                  title="New Game"
                  ariaLabel="Start a new game"
                  className="qc-side-tray-new-game-btn"
                  onClick={() => setView('new-game')}
                  bg={'transparent'}
                  color={theme.success}
                  hoverInvert={true}
                  hoverBg={theme.success}
                  hoverColor={'#ffffff'}
                />
              </>
            ) : (
              <>
                <IconButton
                  icon={FlagIcon}
                  size={18}
                  width={32}
                  height={32}
                  title="Resign"
                  ariaLabel="Resign the current game"
                  className="qc-side-tray-resign-btn"
                  onClick={onResign}
                  bg={theme.secondary}
                  color={theme.danger || '#ff3b30'}
                  hoverInvert={true}
                />
                <IconButton
                  icon={HandshakeIcon}
                  size={18}
                  width={32}
                  height={32}
                  title="Offer Draw"
                  ariaLabel="Offer a draw"
                  className="qc-side-tray-offer-draw-btn"
                  onClick={onOfferDraw}
                  bg={theme.secondary}
                  color={theme.warning || '#f5a524'}
                  hoverInvert={true}
                />
              </>
            )}

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
        </div>

        <div className="qc-side-tray-header-bottom" style={styles.headerBottomRow}>
          <span className="qc-side-tray-title" style={styles.headerTitle}>{titleText}</span>
        </div>
      </div>

      <div className="qc-side-tray-content" style={styles.content}>
        {view === 'history' || isPlaying ? (
          <MoveHistoryPanel
            infoMessage={infoMessage}
            onHighlightMove={onSetHighlights}
            onClearHighlights={onClearHighlights}
            onSeekToIndex={onSeekToIndex}
            externalIndex={externalIndex}
          />
        ) : (
          <NewGamePanel onStartGame={handleStartGame} onCancel={handleCancelNewGame} />
        )}
      </div>
    </aside>
  );
}
