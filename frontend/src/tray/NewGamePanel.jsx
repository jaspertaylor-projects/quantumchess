// frontend/src/tray/NewGamePanel.jsx
// Purpose: New game configuration panel with responsive layouts that wrap options and eliminate horizontal scrolling.
// The vs-AI opponent is picked through the BotLadderPanel dropdown (unlock ladder + premium roster) — no separate bot list.
// Imports From: ../theme.js, ../components/ChevronBadge.jsx, ../ai/bots.js, ../ladder/BotLadderPanel.jsx
// Exported To: ./SideTray.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import ChevronBadge from '../components/ChevronBadge.jsx';
import { DEFAULT_BOT_ID, getBotById, devUnlockAllBots } from '../ai/bots.js';
import BotLadderPanel from '../ladder/BotLadderPanel.jsx';

function OptionButton({ label, selected, onClick }) {
  const styles = {
    button: {
      flex: '1 1 0',
      padding: '10px 12px',
      fontSize: 14,
      fontWeight: 600,
      border: `1px solid ${theme.border}`,
      background: selected ? theme.primary : 'transparent',
      color: selected ? theme.buttonText : theme.textSecondary,
      cursor: 'pointer',
      transition: 'background 0.2s ease, color 0.2s ease',
      textAlign: 'center',
      minWidth: 0,
      borderRadius: 8,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
  };

  return (
    <button
      type="button"
      style={styles.button}
      onClick={onClick}
      className="qc-new-game-option-btn"
      aria-pressed={selected}
    >
      {label}
    </button>
  );
}

// Stylized replacement for a native <select>: the trigger is a card with the
// chosen option's label + hint and the shared rotating chevron badge; opening
// it expands the options inline as mini cards, matching the bot ladder picker.
function OptionSelect({ label, value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) || options[0];
  const accent = 'rgba(127,231,255,';

  const optionText = (opt, isTrigger = false) => (
    <span style={{ display: 'grid', minWidth: 0, gap: 1 }}>
      <span
        style={{
          fontSize: isTrigger ? 14 : 13,
          fontWeight: 850,
          letterSpacing: '0.015em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {opt.label}
      </span>
      {opt.hint ? (
        <span style={{ fontSize: 11, color: theme.textSecondary, fontWeight: 700 }}>
          {opt.hint}
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="qc-new-game-option-select" ref={rootRef} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel || label}
        title={`Choose ${label.toLowerCase()}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          minWidth: 0,
          padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          background: 'rgba(255,255,255,0.04)',
          color: theme.textPrimary,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {optionText(selected, true)}
        <ChevronBadge open={open} />
      </button>
      {open ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                aria-pressed={isSelected}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  minWidth: 0,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: isSelected ? `1px solid ${accent}0.85)` : `1px solid ${theme.border}`,
                  background: isSelected
                    ? `linear-gradient(90deg, ${accent}0.16), rgba(255,255,255,0.05))`
                    : 'rgba(255,255,255,0.03)',
                  color: theme.textPrimary,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {optionText(opt)}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 950,
                    letterSpacing: '0.07em',
                    whiteSpace: 'nowrap',
                    color: isSelected ? '#7fe7ff' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  {isSelected ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// submitSignal: bump to start a game with the settings exactly as shown —
// same as clicking the Start Game button (the board CTA uses this when the
// setup panel is already on screen).
export default function NewGamePanel({
  onStartGame,
  initialSettings = {},
  isPaid = false,
  onRequirePremium = null,
  submitSignal = 0,
  auth = null,
  onOpenAccount = () => {},
}) {
  // Seed each newly opened setup panel from the last submitted game. Queueing
  // counts as submission, so cancelling a search does not throw away the
  // player's chosen mode, match type, clock, side, or bot.
  const [gameMode, setGameMode] = useState(() => initialSettings.gameMode || 'ai'); // 'local', 'ai', 'online'
  const [aiBotId, setAiBotId] = useState(() => initialSettings.aiBotId || DEFAULT_BOT_ID);
  const [preferredSide, setPreferredSide] = useState(() => initialSettings.preferredSide || 'random'); // 'white', 'black', 'random'
  const [isRanked, setIsRanked] = useState(() => Boolean(initialSettings.isRanked)); // boolean
  const [timeControl, setTimeControl] = useState(() => initialSettings.timeControl || '5+0'); // '3+0', '5+0', '10+0'

  const selectedBot = getBotById(aiBotId);
  // Dev playtest override (?allbots) skips the premium gate too.
  const unlockAll = devUnlockAllBots();
  const premiumLocked = Boolean(gameMode === 'ai' && selectedBot && selectedBot.premium && !isPaid && !unlockAll);

  const handleStart = () => {
    const bot = getBotById(aiBotId);
    // Premium bots are browsable by everyone (that's the pitch) but only
    // playable on the paid tier — the block lands here, not in the list.
    if (gameMode === 'ai' && bot && bot.premium && !isPaid && !unlockAll) {
      if (onRequirePremium) onRequirePremium();
      return;
    }
    onStartGame({
      gameMode,
      aiBotId,
      aiDifficulty: bot ? bot.tier : 'medium',
      preferredSide,
      isRanked,
      timeControl,
    });
  };

  const handleStartRef = useRef(handleStart);
  handleStartRef.current = handleStart;
  // Only bumps AFTER mount count as "go": the tray keeps its signal counter
  // across games, so a remounting panel must not fire on a stale value
  // (clicking the green Play Game button after a game would instantly start
  // one instead of showing this options page).
  const lastSubmitSignalRef = useRef(submitSignal);
  useEffect(() => {
    if (submitSignal > lastSubmitSignalRef.current) handleStartRef.current();
    lastSubmitSignalRef.current = submitSignal;
  }, [submitSignal]);

  const styles = useMemo(
    () => ({
      panel: {
        padding: 16,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden',
      },
      section: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
      label: {
        fontSize: 13,
        fontWeight: 700,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      buttonGroup: {
        display: 'flex',
        width: '100%',
        gap: 8,
        flexWrap: 'wrap',
      },
      animatedSectionContainer: {
        // Sized by the visible section (the vs-AI ladder is tall). flexShrink
        // 0 stops the panel's fixed-height flex column from squashing it —
        // the panel scrolls instead and the footer stays below the content.
        position: 'relative',
        flexShrink: 0,
        minHeight: 200,
      },
      animatedSection: (visible) => ({
        position: visible ? 'relative' : 'absolute',
        width: '100%',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
        pointerEvents: visible ? 'auto' : 'none',
        display: visible ? 'flex' : 'none',
        flexDirection: 'column',
        gap: 20,
      }),
      footer: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 'auto',
        paddingTop: 16,
        flexWrap: 'wrap',
      },
      footerButton: (primary = false) => ({
        padding: '10px 20px',
        fontSize: 14,
        fontWeight: 700,
        borderRadius: 8,
        border: primary ? 'none' : `1px solid ${theme.border}`,
        background: primary ? theme.success : 'transparent',
        color: primary ? theme.textPrimary : theme.textSecondary,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }),
    }),
    []
  );

  const gameModeOptions = useMemo(
    () => [
      { value: 'local', label: 'Local 2 Player', hint: 'Pass & play on one device' },
      { value: 'ai', label: 'vs. AI', hint: 'Climb the bot ladder' },
      { value: 'online', label: 'Online', hint: 'Matchmaking & friend challenges' },
    ],
    []
  );

  const preferredSideOptions = useMemo(
    () => [
      { value: 'white', label: 'White', hint: 'Move first' },
      { value: 'black', label: 'Black', hint: 'Move second' },
      { value: 'random', label: 'Random', hint: 'Let the universe decide' },
    ],
    []
  );


  return (
    <div className="qc-new-game-panel" style={styles.panel}>
      <div className="qc-new-game-section" style={styles.section}>
        <span className="qc-new-game-label" style={styles.label}>
          Game Mode
        </span>
        <OptionSelect
          label="Game Mode"
          ariaLabel="Select game mode"
          value={gameMode}
          options={gameModeOptions}
          onChange={setGameMode}
        />
      </div>

      <div className="qc-animated-section-container" style={styles.animatedSectionContainer}>
        <div className="qc-animated-section-ai" style={styles.animatedSection(gameMode === 'ai')}>
          <div className="qc-new-game-section" style={styles.section}>
            <span className="qc-new-game-label" style={styles.label}>
              Opponent
            </span>
            <BotLadderPanel
              auth={auth}
              onOpenAccount={onOpenAccount}
              selectedBotId={aiBotId}
              onSelectBot={setAiBotId}
              isPaid={isPaid}
              onRequirePremium={onRequirePremium}
            />
          </div>
          <div className="qc-new-game-section" style={styles.section}>
            <span className="qc-new-game-label" style={styles.label}>
              Your Side
            </span>
            <OptionSelect
              label="Your Side"
              ariaLabel="Select your side"
              value={preferredSide}
              options={preferredSideOptions}
              onChange={setPreferredSide}
            />
          </div>
        </div>

        <div className="qc-animated-section-online" style={styles.animatedSection(gameMode === 'online')}>
          <div className="qc-new-game-section" style={styles.section}>
            <span className="qc-new-game-label" style={styles.label}>
              Match Type
            </span>
            <div className="qc-new-game-button-group" style={styles.buttonGroup}>
              <OptionButton label="Unranked" selected={!isRanked} onClick={() => setIsRanked(false)} />
              <OptionButton label="Ranked" selected={isRanked} onClick={() => setIsRanked(true)} />
            </div>
          </div>
          <div className="qc-new-game-section" style={styles.section}>
            <span className="qc-new-game-label" style={styles.label}>
              Time Control
            </span>
            <div className="qc-new-game-button-group" style={styles.buttonGroup}>
              <OptionButton label="3 + 0" selected={timeControl === '3+0'} onClick={() => setTimeControl('3+0')} />
              <OptionButton label="5 + 0" selected={timeControl === '5+0'} onClick={() => setTimeControl('5+0')} />
              <OptionButton label="10 + 0" selected={timeControl === '10+0'} onClick={() => setTimeControl('10+0')} />
            </div>
          </div>
          <div className="qc-new-game-section" style={styles.section}>
            <span className="qc-new-game-label" style={styles.label}>
              Play a Friend
            </span>
            <button
              type="button"
              className="qc-new-game-challenge"
              style={{ ...styles.footerButton(false), alignSelf: 'flex-start' }}
              onClick={() => onStartGame({
                gameMode: 'online',
                privateFriend: true,
                preferredSide,
                isRanked: false,
                timeControl,
              })}
            >
              ⚔ Challenge a Friend — get a link
            </button>
          </div>
        </div>
      </div>

      <div className="qc-new-game-footer" style={styles.footer}>
        {/* No Cancel here — cancelling only exists while queued for an
            online match, next to the "Searching…" banner. */}
        <button type="button" className="qc-new-game-start" style={styles.footerButton(true)} onClick={handleStart}>
          {premiumLocked ? 'Unlock Premium' : 'Start Game'}
        </button>
      </div>
    </div>
  );
}
