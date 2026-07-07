// frontend/src/tray/SideTray.jsx
// Purpose: Right-side tray with a two-row header: top row holds all action buttons aligned right, bottom row shows the full-width title on its own line. Hosts move history, new game options, and in-game actions without horizontal scrolling.
// Imports From: ./MoveHistoryPanel.jsx, ./NewGamePanel.jsx, ../components/IconButton.jsx, ../theme.js
// Exported To: ../App.jsx

import React, { useMemo, useState, useEffect } from 'react';
import MoveHistoryPanel from './MoveHistoryPanel.jsx';
import NewGamePanel from './NewGamePanel.jsx';
import IconButton from '../components/IconButton.jsx';
import theme from '../theme.js';
import { Settings as SettingsIcon, BookOpen as BookOpenIcon, Plus as PlusIcon, Flag as FlagIcon, Handshake as HandshakeIcon, User as UserIcon, Puzzle as PuzzleIcon, Play as PlayIcon, GraduationCap as GraduationCapIcon, X as XIcon } from 'lucide-react';

// Big labeled home-menu button. The pre-game tray is a menu, not a form:
// setup, puzzle, tutorial, rules, account, settings each get a full-width
// row (hover styles live in App.css under .qc-menu-btn).
function MenuButton({ icon: Icon, label, onClick, primary = false, accent = null, dot = false, glow = null, className = '', bg = null, fg = null }) {
  const background = primary ? (bg || theme.success) : 'rgba(255,255,255,0.04)';
  const color = primary ? (fg || '#ffffff') : theme.textPrimary;
  return (
    <button
      type="button"
      className={`qc-menu-btn ${primary ? 'qc-menu-btn--primary' : ''} ${className}`}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        boxSizing: 'border-box',
        padding: primary ? '16px 18px' : '13px 18px',
        borderRadius: 12,
        border: `1px solid ${primary ? background : theme.border}`,
        background,
        color,
        fontWeight: 800,
        fontSize: primary ? 16 : 14.5,
        letterSpacing: '0.03em',
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        boxShadow: glow ? `0 0 0 1.5px ${glow}, 0 0 12px ${glow}88` : 'none',
      }}
    >
      <Icon size={primary ? 22 : 19} color={primary ? color : (accent || theme.primary)} />
      <span style={{ flex: 1 }}>{label}</span>
      {dot ? (
        <span
          aria-hidden="true"
          style={{
            width: 10, height: 10, borderRadius: 999,
            background: primary ? color : '#f6c445',
            border: '1.5px solid rgba(10,12,20,0.9)',
          }}
        />
      ) : null}
    </button>
  );
}

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
  isOnlineGame = false,
  searching = false,
  onCancelSearch = () => {},
  newGameSignal = 0,
  onOpenAccount = () => {},
  accountSignedIn = false,
  onOfferDraw = () => {},
  onboarding = false,
  onDismissOnboarding = () => {},
  isPaid = false,
  onRequirePremium = null,
  onOpenPuzzle = () => {},
  puzzleUnsolved = false,
  onOpenTutorial = () => {},
  attentionSignal = 0, // bump to flash the tray (board Start CTA clicked)
}) {
  const [view, setView] = useState('menu'); // 'menu' | 'new-game' | 'history'
  // Onboarding coach-sign shown on hover of a glowing button. Anchored to the
  // button-row's right edge (= tray content edge) so it never clips.
  const [coachHint, setCoachHint] = useState(null); // { text, color }
  const [glowing, setGlowing] = useState(false);

  // The board's "Start a Game" pill points players here: snap to the setup
  // view and pulse a green ring around the tray so the eye lands on it.
  useEffect(() => {
    if (!attentionSignal) return undefined;
    setView('new-game');
    setGlowing(true);
    const t = setTimeout(() => setGlowing(false), 1150);
    return () => clearTimeout(t);
  }, [attentionSignal]);

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
        position: 'relative', // anchor for the onboarding coach-sign
      },
    }),
    [height, stacked]
  );

  const titleText = view === 'new-game' ? 'New Game'
    : view === 'history' ? 'Last Game'
    : 'Quantum Chess';

  return (
    <aside
      className="qc-side-tray-root"
      style={{ ...styles.root, animation: glowing ? 'qc-panel-glow 1.1s ease-in-out 1' : 'none' }}
      aria-label="Move history and controls"
    >
      {(isPlaying || view !== 'menu' || onboarding) ? (
      <div className="qc-side-tray-header" style={styles.header}>
        <div className="qc-side-tray-header-top" style={styles.headerTopRow}>
          {/* Pre-game the title sits inline with the lone X/menu row; the
              two-row split only earns its space in-game with many icons. */}
          {!isPlaying && view !== 'menu' ? (
            <span className="qc-side-tray-title" style={{ ...styles.headerTitle, flex: 1, alignSelf: 'center' }}>
              {titleText}
            </span>
          ) : null}
          <div className="qc-side-tray-actions-right" style={styles.actionGroup}>
            {!isPlaying ? (
              // Pre-game the tray is a two-level menu: the home view needs no
              // header buttons (everything is a big row below); the setup and
              // post-game views get a single X back to the menu.
              view === 'menu' ? null : (
                <IconButton
                  icon={XIcon}
                  size={18}
                  width={32}
                  height={32}
                  title="Back to menu"
                  ariaLabel="Back to menu"
                  className="qc-side-tray-back-btn"
                  onClick={() => setView('menu')}
                  bg={theme.secondary}
                  color={theme.error}
                  hoverInvert={true}
                />
              )
            ) : searching ? null : (
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

            {isPlaying ? (<>
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
              suppressTitle={onboarding}
              onHoverChange={onboarding
                ? (h) => setCoachHint(h ? { text: 'Rules & tutorial', color: '#4fc3f7' } : null)
                : null}
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
              suppressTitle={onboarding}
              onHoverChange={onboarding
                ? (h) => setCoachHint(h ? { text: 'Customize the board', color: '#c792ea' } : null)
                : null}
              hoverInvert={true}
            />
            </>) : null}

            {onboarding && coachHint ? (
              <div
                className="qc-onboard-hint"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  whiteSpace: 'nowrap',
                  width: 'max-content',
                  zIndex: 80,
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'rgba(10,12,20,0.97)',
                  border: `1.5px solid ${coachHint.color}`,
                  color: coachHint.color,
                  fontSize: 14,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  letterSpacing: '0.02em',
                  textAlign: 'center',
                  boxShadow: `0 0 10px ${coachHint.color}88, 0 0 2px ${coachHint.color} inset`,
                  pointerEvents: 'none',
                }}
              >
                {coachHint.text}
              </div>
            ) : null}
          </div>
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
              👋 New here? Start with the Tutorial.
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
      ) : null}

      <div className="qc-side-tray-content" style={styles.content}>
        {searching ? (
          <div
            className="qc-side-tray-searching"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              margin: 10,
              marginBottom: 0,
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: 'rgba(97,218,251,0.06)',
              fontSize: 13,
              fontWeight: 700,
              color: theme.textSecondary,
            }}
          >
            <span>Searching for an opponent…</span>
            <button
              type="button"
              className="qc-side-tray-cancel-search"
              onClick={onCancelSearch}
              style={{
                flex: 'none',
                padding: '6px 14px',
                borderRadius: 7,
                border: `1px solid ${theme.border}`,
                background: theme.secondary,
                color: theme.error,
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        ) : null}
        {view === 'history' || isPlaying ? (
          <MoveHistoryPanel
            infoMessage={infoMessage}
            onHighlightMove={onSetHighlights}
            onClearHighlights={onClearHighlights}
            onSeekToIndex={onSeekToIndex}
            externalIndex={externalIndex}
          />
        ) : view === 'new-game' ? (
          <NewGamePanel onStartGame={handleStartGame} isPaid={isPaid} onRequirePremium={onRequirePremium} />
        ) : (
          <div
            className="qc-side-tray-menu"
            style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, overflowY: 'auto' }}
          >
            <MenuButton
              icon={PlayIcon} label="Play Game" primary
              className="qc-menu-btn--play"
              onClick={() => { setView('new-game'); onDismissOnboarding(); }}
            />
            <MenuButton
              icon={PuzzleIcon} label="Daily Puzzle" primary dot={puzzleUnsolved}
              bg="#f6c445" fg="#1a1a1a"
              className="qc-menu-btn--puzzle"
              onClick={() => { onOpenPuzzle(); }}
            />
            <MenuButton
              icon={GraduationCapIcon} label="Tutorial" accent="#4fc3f7"
              className="qc-menu-btn--tutorial"
              glow={onboarding ? '#4fc3f7' : null}
              onClick={() => { onOpenTutorial(); }}
            />
            <MenuButton
              icon={BookOpenIcon} label="Rules" accent="#c792ea"
              className="qc-menu-btn--rules"
              onClick={() => { onOpenRules(); }}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
