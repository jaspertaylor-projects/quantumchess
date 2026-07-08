// frontend/src/tray/NewGamePanel.jsx
// Purpose: New game configuration panel with responsive layouts that wrap options and eliminate horizontal scrolling.
// Imports From: ../theme.js
// Exported To: ./SideTray.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import { BOTS, DEFAULT_BOT_ID, getBotById } from '../ai/bots.js';

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

function OptionSelect({ label, value, options, onChange, ariaLabel }) {
  const styles = useMemo(
    () => ({
      root: {
        width: '100%',
      },
      select: {
        width: '100%',
        padding: '10px 12px',
        fontSize: 14,
        fontWeight: 700,
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: 'rgba(255,255,255,0.04)',
        color: theme.textPrimary,
        outline: 'none',
        cursor: 'pointer',
      },
      option: {
        background: theme.secondary,
        color: theme.textPrimary,
      },
      srOnly: {
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      },
    }),
    []
  );

  return (
    <div className="qc-new-game-option-select" style={styles.root}>
      <label className="qc-new-game-option-select-label" style={styles.srOnly}>
        {label}
      </label>
      <select
        className="qc-new-game-option-select-input"
        style={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel || label}
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className="qc-new-game-option-select-option"
            style={styles.option}
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// submitSignal: bump to start a game with the settings exactly as shown —
// same as clicking the Start Game button (the board CTA uses this when the
// setup panel is already on screen).
export default function NewGamePanel({ onStartGame, isPaid = false, onRequirePremium = null, submitSignal = 0 }) {
  const [gameMode, setGameMode] = useState('ai'); // 'local', 'ai', 'online'
  const [aiBotId, setAiBotId] = useState(DEFAULT_BOT_ID);
  const [preferredSide, setPreferredSide] = useState('random'); // 'white', 'black', 'random'
  const [isRanked, setIsRanked] = useState(false); // boolean
  const [timeControl, setTimeControl] = useState('5+0'); // '3+0', '5+0', '10+0'

  const selectedBot = getBotById(aiBotId);
  const premiumLocked = Boolean(gameMode === 'ai' && selectedBot && selectedBot.premium && !isPaid);

  const handleStart = () => {
    const bot = getBotById(aiBotId);
    // Premium bots are browsable by everyone (that's the pitch) but only
    // playable on the paid tier — the block lands here, not in the list.
    if (gameMode === 'ai' && bot && bot.premium && !isPaid) {
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
  useEffect(() => {
    if (submitSignal > 0) handleStartRef.current();
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
        position: 'relative',
        flex: 1,
        minHeight: 200,
      },
      animatedSection: (visible) => ({
        position: 'absolute',
        width: '100%',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
        pointerEvents: visible ? 'auto' : 'none',
        display: 'flex',
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
      { value: 'local', label: 'Local 2 Player' },
      { value: 'ai', label: 'vs. AI' },
      { value: 'online', label: 'Online' },
    ],
    []
  );

  const tierTag = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const aiBotOptions = useMemo(
    () => BOTS.map((b) => ({
      value: b.id,
      label: b.premium
        ? `★ Premium · ${b.name} (${b.rating})${isPaid ? '' : ' 🔒'}`
        : `${tierTag[b.tier]} · ${b.name} (${b.rating})`,
    })),
    [isPaid]
  );

  const preferredSideOptions = useMemo(
    () => [
      { value: 'white', label: 'White' },
      { value: 'black', label: 'Black' },
      { value: 'random', label: 'Random' },
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
            <OptionSelect
              label="Opponent"
              ariaLabel="Select AI opponent"
              value={aiBotId}
              options={aiBotOptions}
              onChange={setAiBotId}
            />
            {premiumLocked ? (
              <div
                className="qc-new-game-premium-hint"
                style={{
                  fontSize: 12, lineHeight: 1.45, borderRadius: 8, padding: '7px 10px',
                  border: '1px solid rgba(246,196,69,0.55)', background: 'rgba(246,196,69,0.08)',
                  color: '#f6c445',
                }}
              >
                ★ {selectedBot.name} is a Premium bot — upgrade for $3/month to play the premium roster.
              </div>
            ) : null}
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
