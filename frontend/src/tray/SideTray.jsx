// frontend/src/tray/SideTray.jsx
// Purpose: Right-side tray with a two-row header: top row holds all action buttons aligned right, bottom row shows the full-width title on its own line. Hosts move history, new game options, and in-game actions without horizontal scrolling.
// Imports From: ./MoveHistoryPanel.jsx, ./NewGamePanel.jsx, ../components/IconButton.jsx, ../theme.js
// Exported To: ../App.jsx

import React, { useMemo, useState, useEffect } from 'react';
import MoveHistoryPanel from './MoveHistoryPanel.jsx';
import NewGamePanel from './NewGamePanel.jsx';
import IconButton from '../components/IconButton.jsx';
import theme from '../theme.js';
import { Settings as SettingsIcon, BookOpen as BookOpenIcon, Plus as PlusIcon, Flag as FlagIcon, Handshake as HandshakeIcon, User as UserIcon } from 'lucide-react';

export default function SideTray({
  height = 0,
  stacked = false,
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
  onRequestNewGame = () => {},
  newGameSignal = 0,
  onOpenAccount = () => {},
  accountSignedIn = false,
  onOfferDraw = () => {},
  onboarding = false,
  onDismissOnboarding = () => {},
}) {
  const [view, setView] = useState('new-game'); // 'history' or 'new-game'

  useEffect(() => {
    if (isPlaying) {
      setView('history');
    }
  }, [isPlaying]);

  // App bumps this after the player confirms "End & New Game": jump straight
  // to the new-game setup panel.
  useEffect(() => {
    if (newGameSignal > 0) setView('new-game');
  }, [newGameSignal]);

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
        width: stacked ? '100%' : 'clamp(260px, 38vmin, 360px)',
        minWidth: stacked ? 0 : 240,
        height: stacked ? 'auto' : (height || '100%'),
        flex: stacked ? '1 1 0' : undefined,
        minHeight: stacked ? 140 : undefined,
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
        overflow: stacked ? 'auto' : 'hidden',
        WebkitOverflowScrolling: 'touch',
      },
      actionGroup: {
        display: 'flex',
        alignItems: 'center',
        columnGap: 8,
        flexWrap: 'wrap',
      },
    }),
    [height, stacked]
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
                  icon={PlusIcon}
                  size={18}
                  width={32}
                  height={32}
                  title="New Game"
                  ariaLabel="End this game and start a new one"
                  className="qc-side-tray-new-game-btn"
                  onClick={onRequestNewGame}
                  bg={'transparent'}
                  color={theme.success}
                  hoverInvert={true}
                  hoverBg={theme.success}
                  hoverColor={'#ffffff'}
                />
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
              icon={UserIcon}
              size={16}
              width={32}
              height={32}
              title={accountSignedIn ? 'Account' : 'Sign In'}
              ariaLabel="Open account panel"
              className="qc-side-tray-account-btn"
              onClick={onOpenAccount}
              bg={theme.secondary}
              color={accountSignedIn ? theme.success : theme.primary}
              hoverInvert={true}
              glow={onboarding && !accountSignedIn}
              glowColor="#7ee787"
              hint={onboarding && !accountSignedIn ? 'Sign up — get a rating & save games' : ''}
              hintColor="#7ee787"
            />
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
              glow={onboarding}
              glowColor="#4fc3f7"
              hint={onboarding ? 'New? Rules & interactive tutorial' : ''}
              hintColor="#4fc3f7"
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
              glow={onboarding}
              glowColor="#c792ea"
              hint={onboarding ? 'Customize colors, board & reminders' : ''}
              hintColor="#c792ea"
              hoverInvert={true}
            />
          </div>
        </div>

        <div className="qc-side-tray-header-bottom" style={styles.headerBottomRow}>
          <span className="qc-side-tray-title" style={styles.headerTitle}>{titleText}</span>
        </div>

        {onboarding ? (
          <div
            className="qc-onboard-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              padding: '7px 10px',
              borderRadius: 8,
              background: 'rgba(79,195,247,0.08)',
              border: '1px solid rgba(79,195,247,0.4)',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            <span style={{ flex: 1, color: theme.textSecondary }}>
              👋 New here? Hover the glowing buttons.
            </span>
            <button
              type="button"
              className="qc-onboard-gotit"
              onClick={onDismissOnboarding}
              style={{
                flex: 'none',
                padding: '4px 12px',
                borderRadius: 7,
                border: 'none',
                background: theme.primary,
                color: theme.secondary,
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        ) : null}
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
