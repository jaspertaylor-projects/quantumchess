// frontend/src/ladder/BotLadderPanel.jsx
// Purpose: The vs-AI opponent picker — a dropdown whose trigger is the selected
// bot's character card and whose menu is the unlock ladder: free bots easiest
// first, cleared rungs checked, the next rung highlighted, locked rungs faded
// behind a lock (hover: "Beat <previous bot> to unlock"). Subscribers get the
// premium roster appended; everyone else gets a one-line premium teaser.
// Imports From: react, ../theme.js, ../components/ChevronBadge.jsx, ../ai/bots.js, ../account/botProgress.js
// Exported To: ../tray/NewGamePanel.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import { Lock as LockIcon } from 'lucide-react';
import ChevronBadge from '../components/ChevronBadge.jsx';
import { FREE_BOTS, PREMIUM_BOTS, getBotById, getBotAvatarUrl } from '../ai/bots.js';
import { fetchBotProgress, BOT_PROGRESS_EVENT } from '../account/botProgress.js';

const TIER_TAG = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

function BotCard({ bot, boss, premium, cleared, next, locked, lockHint, selected, onClick, trigger = false, open = false }) {
  const accent = boss || premium ? 'rgba(246,196,69,' : 'rgba(127,231,255,';
  // Locked cards fade their contents (not the button itself) so the hover
  // tooltip overlay renders at full strength on top of them.
  const [hovered, setHovered] = useState(false);
  const fade = { opacity: locked ? 0.38 : 1, transition: 'opacity 0.15s ease' };
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-pressed={trigger ? undefined : selected}
      aria-expanded={trigger ? open : undefined}
      aria-disabled={locked || undefined}
      aria-label={locked ? `${bot.name} — ${lockHint}` : undefined}
      title={locked ? undefined : trigger ? 'Choose your opponent' : `Play ${bot.name}`}
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
        cursor: locked ? 'not-allowed' : 'pointer',
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
          {boss ? (premium ? '★ Premium final boss' : 'Final boss') : premium ? `★ Premium · ${TIER_TAG[bot.tier] || bot.tier}` : TIER_TAG[bot.tier] || bot.tier} · {bot.rating}
        </span>
      </span>
      {trigger ? (
        <ChevronBadge open={open} gold={boss || premium} />
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
                : next
                  ? (boss || premium ? '#f6c445' : '#7fe7ff')
                  : 'rgba(255,255,255,0.3)',
          }}
        >
          {locked ? <LockIcon size={13} strokeWidth={2.5} /> : cleared ? '✓ CLEARED' : next ? 'NEXT UP' : ''}
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
  isPaid = false,
  onRequirePremium = null,
}) {
  const user = auth && auth.user ? auth.user : null;
  // Easiest rung first; the free final boss is the last free rung.
  const ladder = useMemo(() => [...FREE_BOTS].sort((a, b) => a.rating - b.rating), []);
  const premiumLadder = useMemo(() => [...PREMIUM_BOTS].sort((a, b) => a.rating - b.rating), []);
  const trackedIds = useMemo(
    () => [...ladder, ...(isPaid ? premiumLadder : [])].map((b) => b.id),
    [ladder, premiumLadder, isPaid]
  );

  const [open, setOpen] = useState(false);
  const [clearedIds, setClearedIds] = useState(() => new Set());
  const [progressLoaded, setProgressLoaded] = useState(false);
  const rootRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setClearedIds(new Set());
      setProgressLoaded(true);
      return;
    }
    const rows = await fetchBotProgress(user, trackedIds);
    setClearedIds(new Set(rows.map((r) => r.bot_id)));
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

  // The next rung is the easiest free bot not yet cleared; it and everything
  // already cleared are playable, the rest are locked behind it.
  const nextBotId = useMemo(() => {
    const next = ladder.find((b) => !clearedIds.has(b.id));
    return next ? next.id : null;
  }, [ladder, clearedIds]);

  const isUnlocked = useCallback(
    (bot) => {
      if (bot.premium) return isPaid;
      return clearedIds.has(bot.id) || bot.id === nextBotId;
    },
    [clearedIds, nextBotId, isPaid]
  );

  // Keep the selection playable: if progress says the chosen bot is locked
  // (fresh account, signed out, or a premium pick after a lapse), fall back
  // to the next rung.
  useEffect(() => {
    if (!progressLoaded) return;
    const selected = getBotById(selectedBotId);
    if (selected && isUnlocked(selected)) return;
    // With every free bot cleared there is no "next", so the boss is the home rung.
    const fallbackId = nextBotId || ladder[ladder.length - 1].id;
    if (selectedBotId !== fallbackId) onSelectBot(fallbackId);
  }, [progressLoaded, selectedBotId, isUnlocked, nextBotId, ladder, onSelectBot]);

  const selectedBot = getBotById(selectedBotId) || ladder[0];
  const clearedCount = ladder.filter((b) => clearedIds.has(b.id)).length;

  const pick = (bot) => {
    onSelectBot(bot.id);
    setOpen(false);
  };

  return (
    <section ref={rootRef} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <BotCard
        bot={selectedBot}
        boss={selectedBot.id === ladder[ladder.length - 1].id || selectedBot.id === premiumLadder[premiumLadder.length - 1].id}
        premium={Boolean(selectedBot.premium)}
        cleared={clearedIds.has(selectedBot.id)}
        next={false}
        locked={false}
        selected
        trigger
        open={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open ? (
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.45 }}>
            {user
              ? `Beat each bot in a fair game to unlock the next. ${clearedCount}/${ladder.length} cleared.`
              : 'Beat each bot in a fair game to unlock the next.'}
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
              Sign in free to save bot unlocks.
            </button>
          ) : null}
          <div style={{ display: 'grid', gap: 6 }}>
            {ladder.map((bot, i) => {
              const locked = !isUnlocked(bot);
              return (
                <BotCard
                  key={bot.id}
                  bot={bot}
                  boss={i === ladder.length - 1}
                  premium={false}
                  cleared={clearedIds.has(bot.id)}
                  next={bot.id === nextBotId}
                  locked={locked}
                  lockHint={locked ? `Beat ${ladder[i - 1].name} to unlock` : null}
                  selected={bot.id === selectedBotId}
                  onClick={() => pick(bot)}
                />
              );
            })}
          </div>
          {isPaid ? (
            <>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: '0.07em',
                  color: '#f6c445',
                  textTransform: 'uppercase',
                  marginTop: 2,
                }}
              >
                ★ Premium roster
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {premiumLadder.map((bot, i) => (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    boss={i === premiumLadder.length - 1}
                    premium
                    cleared={clearedIds.has(bot.id)}
                    next={false}
                    locked={false}
                    selected={bot.id === selectedBotId}
                    onClick={() => pick(bot)}
                  />
                ))}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onRequirePremium || onOpenAccount}
              title="Upgrade to play the premium roster"
              style={{
                padding: '9px 12px',
                borderRadius: 10,
                border: '1px solid rgba(246,196,69,0.5)',
                background: 'rgba(246,196,69,0.08)',
                color: '#f6c445',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              ★ {premiumLadder.length} more bots available to monthly subscribers
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
