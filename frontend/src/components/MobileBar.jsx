// frontend/src/components/MobileBar.jsx
// Purpose: Fixed bottom action bar for narrow (phone) layouts, replacing the
// stacked side tray. Home screen shows New Game / Sign Up / Tutorial /
// Settings; in-game it shows compact move navigation (jump-to-start, back,
// forward, jump-to-end) plus resign/draw. Deliberately plain — no glow, no
// animation.
// Imports From: ../theme.js, ./IconButton.jsx
// Exported To: ../App.jsx

import React from 'react';
import theme from '../theme.js';
import IconButton from './IconButton.jsx';
import {
  Plus as PlusIcon,
  User as UserIcon,
  GraduationCap as GraduationCapIcon,
  Settings as SettingsIcon,
  Flag as FlagIcon,
  Handshake as HandshakeIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ChevronsLeft as ChevronsLeftIcon,
  ChevronsRight as ChevronsRightIcon,
  Puzzle as PuzzleIcon,
} from 'lucide-react';

export default function MobileBar({
  isPlaying = false,
  hasGameHistory = false,
  searching = false,
  isOnlineGame = false,
  infoMessage = '',
  moveCount = 0,
  currentMoveIndex = -1,
  onSeek = () => {},
  onNewGame = () => {},
  onOpenAccount = () => {},
  accountSignedIn = false,
  onOpenTutorial = () => {},
  onOpenSettings = () => {},
  onResign = () => {},
  onOfferDraw = () => {},
  onCancelSearch = () => {},
  onOpenPuzzle = () => {},
  puzzleUnsolved = false,
}) {
  const styles = {
    root: {
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 90,
      background: 'rgba(12, 14, 22, 0.97)',
      borderTop: `1px solid ${theme.border}`,
      paddingBottom: 'env(safe-area-inset-bottom)',
      boxSizing: 'border-box',
    },
    info: {
      // Floats above the bar instead of stacking inside it: an appearing
      // info line must never push the button row (the intro toggles "Not
      // your turn." constantly and the bar would bounce).
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: '100%',
      padding: '4px 12px',
      fontSize: 12,
      lineHeight: 1.35,
      color: 'rgba(255, 206, 84, 0.9)',
      textAlign: 'center',
      borderTop: `1px solid ${theme.border}`,
      borderBottom: `1px solid ${theme.border}`,
      background: 'rgba(24, 20, 10, 0.97)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      gap: 6,
      padding: '8px 10px',
      // Same height in menu and in-game modes: the taller (labeled) home row
      // sets the floor so switching modes never resizes the bar mid-intro.
      minHeight: 63,
      boxSizing: 'border-box',
    },
    homeButton: (primary = false) => ({
      flex: '1 1 0',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      padding: '6px 4px',
      borderRadius: 10,
      border: 'none',
      background: primary ? theme.success : 'transparent',
      color: primary ? '#ffffff' : theme.textSecondary,
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }),
    navCounter: {
      minWidth: 44,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: 700,
      color: theme.textSecondary,
      fontVariantNumeric: 'tabular-nums',
    },
    divider: {
      width: 1,
      alignSelf: 'stretch',
      margin: '4px 2px',
      background: theme.border,
      flex: 'none',
    },
    cancelButton: {
      padding: '8px 18px',
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: theme.secondary,
      color: theme.danger || '#ff6b6b',
      fontWeight: 800,
      fontSize: 13,
      cursor: 'pointer',
    },
    searchText: {
      fontSize: 13,
      fontWeight: 700,
      color: theme.textSecondary,
    },
  };

  const navBtn = (Icon, label, onClick, disabled) => (
    <IconButton
      icon={Icon}
      size={18}
      width={38}
      height={38}
      title={label}
      ariaLabel={label}
      onClick={disabled ? () => {} : onClick}
      bg={'transparent'}
      color={disabled ? theme.border : theme.primary}
      hoverInvert={!disabled}
      hoverColor={theme.secondary}
      shadow="transparent"
    />
  );

  let content;
  if (searching) {
    content = (
      <div style={styles.row}>
        <span style={styles.searchText}>Searching for an opponent…</span>
        <button type="button" style={styles.cancelButton} onClick={onCancelSearch}>
          Cancel
        </button>
      </div>
    );
  } else if (isPlaying || hasGameHistory) {
    const atStart = currentMoveIndex < 0;
    const atEnd = currentMoveIndex >= moveCount - 1;
    content = (
      <div style={styles.row}>
        {navBtn(ChevronsLeftIcon, 'Jump to start', () => onSeek(-1), atStart)}
        {navBtn(ChevronLeftIcon, 'Previous move', () => onSeek(currentMoveIndex - 1), atStart)}
        <span style={styles.navCounter}>
          {moveCount > 0 ? `${currentMoveIndex + 1}/${moveCount}` : '0/0'}
        </span>
        {navBtn(ChevronRightIcon, 'Next move', () => onSeek(currentMoveIndex + 1), atEnd)}
        {navBtn(ChevronsRightIcon, 'Jump to latest', () => onSeek(moveCount - 1), atEnd)}
        <span style={styles.divider} />
        {(!isPlaying || !isOnlineGame) ? (
          <IconButton
            icon={PlusIcon}
            size={18}
            width={38}
            height={38}
            title={isPlaying ? 'New Game' : 'Play another game'}
            ariaLabel={isPlaying ? 'End this game and start a new one' : 'Start another game'}
            onClick={onNewGame}
            bg={'transparent'}
            color={theme.success}
            hoverInvert={true}
            hoverColor={'#ffffff'}
            shadow="transparent"
          />
        ) : null}
        {isPlaying ? (
          <>
            <IconButton
              icon={FlagIcon}
              size={18}
              width={38}
              height={38}
              title="Resign"
              ariaLabel="Resign the current game"
              onClick={onResign}
              bg={'transparent'}
              color={theme.danger || '#ff3b30'}
              hoverInvert={true}
              hoverColor={'#ffffff'}
              shadow="transparent"
            />
            <IconButton
              icon={HandshakeIcon}
              size={18}
              width={38}
              height={38}
              title="Offer Draw"
              ariaLabel="Offer a draw"
              onClick={onOfferDraw}
              bg={'transparent'}
              color={theme.warning || '#f5a524'}
              hoverInvert={true}
              hoverColor={theme.secondary}
              shadow="transparent"
            />
          </>
        ) : null}
      </div>
    );
  } else {
    content = (
      <div style={styles.row}>
        <button type="button" style={styles.homeButton(true)} onClick={onNewGame}>
          <PlusIcon size={18} />
          New Game
        </button>
        <button type="button" style={{ ...styles.homeButton(), position: 'relative' }} onClick={onOpenPuzzle}>
          <PuzzleIcon size={18} color="#f6c445" />
          Puzzle
          {puzzleUnsolved ? (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', top: 4, right: '26%', width: 8, height: 8,
                borderRadius: 999, background: '#f6c445',
                border: '1.5px solid rgba(10,12,20,0.9)', pointerEvents: 'none',
              }}
            />
          ) : null}
        </button>
        <button type="button" style={styles.homeButton()} onClick={onOpenAccount}>
          <UserIcon size={18} color={accountSignedIn ? theme.success : undefined} />
          {accountSignedIn ? 'Account' : 'Sign Up'}
        </button>
        <button type="button" style={styles.homeButton()} onClick={onOpenTutorial}>
          <GraduationCapIcon size={18} />
          Tutorial
        </button>
        <button type="button" style={styles.homeButton()} onClick={onOpenSettings}>
          <SettingsIcon size={18} />
          Settings
        </button>
      </div>
    );
  }

  return (
    <nav className="qc-mobile-bar" style={styles.root} aria-label="Game controls">
      {infoMessage ? <div className="qc-mobile-bar-info" style={styles.info}>{infoMessage}</div> : null}
      {content}
    </nav>
  );
}
