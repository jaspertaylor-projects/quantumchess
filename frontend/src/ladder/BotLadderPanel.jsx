// frontend/src/ladder/BotLadderPanel.jsx
// Purpose: The bot picker: human matches earn opponents; Premium opens its own roster.
// Imports From: react, ../theme.js, ../components/ChevronBadge.jsx, ../ai/bots.js, ../account/botProgress.js
// Exported To: ../tray/NewGamePanel.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import { Lock as LockIcon } from 'lucide-react';
import ChevronBadge from '../components/ChevronBadge.jsx';
import {
  ACTIVE_BOTS, MATCH_UNLOCK_BOTS, PREMIUM_BOTS, BOT_ACCESS, STARTER_BOT_ID, botAccess, botAccessLabel,
  canAccessBot, canPlayBot, getActiveBotById, getBotAvatarUrl, devUnlockAllBots,
} from '../ai/bots.js';
import { fetchBotProgress, fetchBotUnlocks, BOT_PROGRESS_EVENT } from '../account/botProgress.js';
import { botAccountAccess } from '../account/billing.js';

const TIER_TAG = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

function BotCard({ bot, boss, cleared, next = false, locked, lockHint, selected, onClick, onLockedClick = null, trigger = false, open = false }) {
  const paidAccess = botAccess(bot) !== BOT_ACCESS.FREE;
  const accent = boss || paidAccess ? 'rgba(246,196,69,' : 'rgba(127,231,255,';
  // Locked cards fade their contents (not the button itself) so the hover
  // tooltip overlay renders at full strength on top of them.
  const [hovered, setHovered] = useState(false);
  const fade = { opacity: locked ? 0.38 : 1, transition: 'opacity 0.15s ease' };
  return (
    <button
      type="button"
      onClick={locked ? onLockedClick || undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-pressed={trigger ? undefined : selected}
      aria-expanded={trigger ? open : undefined}
      aria-disabled={(locked && !onLockedClick) || undefined}
      aria-label={locked ? `${bot.name} — ${lockHint}` : undefined}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        minWidth: 0,
        padding: boss || trigger ? '10px 12px' : '8px 10px',
        borderRadius: 10,
        border: selected && !trigger
          ? `1px solid ${accent}0.85)`
          : next
            ? `1px solid ${accent}0.55)`
            : `1px solid ${cleared ? 'rgba(74,222,128,0.4)' : theme.border}`,
        background: selected && !trigger
          ? `linear-gradient(90deg, ${accent}0.16), rgba(255,255,255,0.05))`
          : cleared
            ? 'rgba(74,222,128,0.07)'
            : next
              ? `linear-gradient(90deg, ${accent}0.1), rgba(255,255,255,0.04))`
              : 'rgba(255,255,255,0.03)',
        color: theme.textPrimary,
        cursor: locked && !onLockedClick ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        opacity: cleared && !selected && !trigger ? 0.82 : 1,
      }}
    >
      <img
        src={getBotAvatarUrl(bot)}
        alt=""
        width={boss || trigger ? 34 : 26}
        height={boss || trigger ? 34 : 26}
        style={{
          ...fade,
          borderRadius: 999,
          objectFit: 'cover',
          filter: locked ? 'grayscale(1)' : 'none',
          border: `2px solid ${cleared ? 'rgba(74,222,128,0.6)' : (selected && !trigger) || next ? `${accent}0.7)` : 'rgba(255,255,255,0.16)'}`,
        }}
      />
      <span style={{ ...fade, display: 'grid', minWidth: 0 }}>
        <span
          style={{
            fontSize: boss || trigger ? 14 : 13,
            fontWeight: 900,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {bot.name}
        </span>
        <span style={{ fontSize: 11, color: theme.textSecondary, fontWeight: 700 }}>
          {boss ? '★ Final boss' : botAccessLabel(bot)} · {TIER_TAG[bot.tier] || bot.tier} · {bot.rating}
        </span>
      </span>
      {trigger ? (
        <ChevronBadge open={open} gold={boss || paidAccess} />
      ) : (
        <span
          style={{
            ...fade,
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 10,
            fontWeight: 950,
            letterSpacing: '0.07em',
            whiteSpace: 'nowrap',
            color: locked
              ? 'rgba(255,255,255,0.8)'
              : cleared
                ? '#86efac'
                : selected
                  ? (boss || paidAccess ? '#f6c445' : '#7fe7ff')
                  : 'rgba(255,255,255,0.3)',
          }}
        >
          {locked ? <LockIcon size={13} strokeWidth={2.5} /> : cleared ? '✓ BEATEN' : ''}
        </span>
      )}
      {locked && lockHint ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            background: 'rgba(8,10,18,0.78)',
            backdropFilter: 'blur(2px)',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.18s ease',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              maxWidth: 'calc(100% - 16px)',
              padding: '5px 11px',
              borderRadius: 999,
              border: '1px solid rgba(246,196,69,0.55)',
              background: 'rgba(246,196,69,0.12)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
              color: '#f6c445',
              fontSize: 11.5,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <LockIcon size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            {lockHint}
          </span>
        </span>
      ) : null}
    </button>
  );
}

export default function BotLadderPanel({
  auth = null,
  onOpenAccount = () => {},
  selectedBotId = null,
  onSelectBot = () => {},
  onRequirePremium = null,
}) {
  const user = auth && auth.user ? auth.user : null;
  const unlockAll = devUnlockAllBots();
  const accountAccess = botAccountAccess(auth && auth.profile);
  const roster = useMemo(() => [...ACTIVE_BOTS].sort((a, b) => a.rating - b.rating), []);
  const trackedIds = useMemo(() => roster.map((bot) => bot.id), [roster]);
  const groups = useMemo(() => ([
    { access: BOT_ACCESS.FREE, title: 'Starter & match unlocks' },
    { access: BOT_ACCESS.PREMIUM, title: 'Premium' },
  ].map((group) => ({
    ...group,
    bots: roster.filter((bot) => botAccess(bot) === group.access),
  }))), [roster]);

  const [open, setOpen] = useState(false);
  const [clearedIds, setClearedIds] = useState(() => new Set());
  const [unlockedIds, setUnlockedIds] = useState(() => new Set([STARTER_BOT_ID]));
  const [progressLoaded, setProgressLoaded] = useState(false);
  const rootRef = useRef(null);

  const refresh = useCallback(async () => {
    const [clears, unlocks] = await Promise.all([
      fetchBotProgress(user, trackedIds),
      fetchBotUnlocks(user, trackedIds),
    ]);
    const cleared = new Set(clears.map((row) => row.bot_id));
    setClearedIds(cleared);
    setUnlockedIds(new Set([
      STARTER_BOT_ID,
      ...cleared,
      ...unlocks.map((row) => row.bot_id),
    ]));
    setProgressLoaded(true);
  }, [user, trackedIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(BOT_PROGRESS_EVENT, refresh);
    return () => window.removeEventListener(BOT_PROGRESS_EVENT, refresh);
  }, [refresh]);

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

  const isUnlocked = useCallback(
    (bot) => {
      return unlockAll || canPlayBot(bot, accountAccess, unlockedIds);
    },
    [accountAccess, unlockedIds, unlockAll]
  );

  // Keep a stale saved choice from bypassing either progression or account
  // access after an account changes.
  useEffect(() => {
    if (!progressLoaded) return;
    const selected = getActiveBotById(selectedBotId);
    if (selected && isUnlocked(selected)) return;
    const fallbackId = roster.find(isUnlocked)?.id || STARTER_BOT_ID;
    if (selectedBotId !== fallbackId) onSelectBot(fallbackId);
  }, [progressLoaded, selectedBotId, isUnlocked, roster, onSelectBot]);

  const selectedBot = getActiveBotById(selectedBotId) || getActiveBotById(STARTER_BOT_ID);
  const unlockedCount = roster.filter(isUnlocked).length;

  const pick = (bot) => {
    onSelectBot(bot.id);
    setOpen(false);
  };

  const lockFor = (bot) => {
    if (!canAccessBot(bot, accountAccess)) {
      return 'Unlock with Premium — $10 once';
    }
    return 'Earn through human matches — win, lose or draw';
  };

  return (
    <section ref={rootRef} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <BotCard
        bot={selectedBot}
        boss={selectedBot.id === 'rudolf-einstein'}
        cleared={clearedIds.has(selectedBot.id)}
        locked={false}
        selected
        trigger
        open={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open ? (
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.45 }}>
            Isaac is ready from the start. Each completed human match unlocks the next of {MATCH_UNLOCK_BOTS.length} opponents — win, lose or draw.
            {' '}{unlockedCount}/{roster.length} available. Premium opens {PREMIUM_BOTS.length} more bots; match unlocks are earned by everyone.
          </div>
          {!user ? (
            <button
              type="button"
              onClick={onOpenAccount}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(127,231,255,0.45)',
                background: 'rgba(0,245,255,0.1)',
                color: theme.textPrimary,
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Sign in to save future unlocks to your account.
            </button>
          ) : null}
          {groups.map((group) => (
            <div key={group.access} style={{ display: 'grid', gap: 6 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.07em',
                color: group.access === BOT_ACCESS.FREE ? theme.textSecondary : '#f6c445',
                textTransform: 'uppercase',
                marginTop: 2,
              }}>
                {group.title} · {group.bots.length}
              </div>
              {group.bots.map((bot) => {
                const locked = !isUnlocked(bot);
                const accessLocked = !canAccessBot(bot, accountAccess);
                return (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    boss={bot.id === 'rudolf-einstein'}
                    cleared={clearedIds.has(bot.id)}
                    locked={locked}
                    lockHint={locked ? lockFor(bot) : null}
                    selected={bot.id === selectedBotId}
                    onClick={() => pick(bot)}
                    onLockedClick={accessLocked ? (onRequirePremium || onOpenAccount) : null}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
