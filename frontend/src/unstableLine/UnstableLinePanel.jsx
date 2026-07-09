// frontend/src/unstableLine/UnstableLinePanel.jsx
// SHELVED (2026-07-08): parked until post-launch — see ./unstableLine.js.
// Purpose: Account-gated route map for Enter the Unstable Line.
// Imports From: react, ../theme.js, ../ai/bots.js, ../account/botProgress.js,
// ./unstableLine.js
// Exported To: (none — shelved)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import theme from '../theme.js';
import { FREE_BOTS, getBotAvatarUrl, getBotById } from '../ai/bots.js';
import { fetchBotProgress } from '../account/botProgress.js';
import {
  beginnerUnlockBots,
  createUnstableLineRun,
  downsideById,
  hasUnstableLineDevUnlock,
  isUnstableLineDevUnlockAvailable,
  loadUnstableLineRun,
  nextUnstableChoices,
  pickupById,
  saveUnstableLineRun,
  setUnstableLineDevUnlock,
  startUnstableFight,
  syncUnstableLineRun,
  unstableLineMapBots,
  UNSTABLE_BOSS_ID,
  UNSTABLE_DEV_USER,
} from './unstableLine.js';

function BotPip({ bot, cleared = false }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        padding: '4px 7px',
        borderRadius: 999,
        border: `1px solid ${cleared ? 'rgba(74,222,128,0.5)' : theme.border}`,
        background: cleared ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
        color: cleared ? '#86efac' : theme.textSecondary,
        fontSize: 11.5,
        fontWeight: 800,
      }}
    >
      <img
        src={getBotAvatarUrl(bot)}
        alt=""
        width="18"
        height="18"
        style={{ borderRadius: 999, objectFit: 'cover', flex: '0 0 auto' }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bot.name}
      </span>
    </span>
  );
}

function StackList({ title, ids, resolver, empty }) {
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ids.length ? ids.map((id) => {
          const item = resolver(id);
          return item ? (
            <span
              key={id}
              style={{
                border: `1px solid ${theme.border}`,
                background: 'rgba(255,255,255,0.05)',
                color: theme.textPrimary,
                borderRadius: 999,
                padding: '4px 7px',
                fontSize: 11.5,
                fontWeight: 800,
              }}
              title={item.text}
            >
              {item.name}
            </span>
          ) : null;
        }) : (
          <span style={{ color: theme.textSecondary, fontSize: 12 }}>{empty}</span>
        )}
      </div>
    </div>
  );
}

function NodeButton({
  node,
  bot,
  downside,
  pickup,
  enabled,
  defeated,
  busy,
  onClick,
  avatarSize,
  boss = false,
}) {
  return (
    <button
      type="button"
      disabled={!enabled || busy}
      onClick={onClick}
      title={enabled ? `Fight ${bot.name}` : 'Not on the current branch'}
      style={{
        position: 'relative',
        zIndex: 2,
        width: boss ? 'min(260px, 100%)' : 'min(210px, 100%)',
        minHeight: boss ? 148 : 166,
        justifySelf: 'center',
        borderRadius: 18,
        border: enabled
          ? boss
            ? '1px solid rgba(246,196,69,0.8)'
            : '1px solid rgba(127,231,255,0.72)'
          : defeated
            ? '1px solid rgba(74,222,128,0.42)'
            : '1px solid rgba(255,255,255,0.12)',
        background: defeated
          ? 'linear-gradient(180deg, rgba(74,222,128,0.13), rgba(255,255,255,0.045))'
          : enabled
            ? boss
              ? 'linear-gradient(180deg, rgba(246,196,69,0.18), rgba(255,255,255,0.05))'
              : 'linear-gradient(180deg, rgba(0,245,255,0.17), rgba(180,0,255,0.08), rgba(255,255,255,0.045))'
            : 'rgba(255,255,255,0.035)',
        color: theme.textPrimary,
        opacity: defeated ? 0.68 : enabled ? 1 : 0.38,
        cursor: enabled && !busy ? 'pointer' : 'default',
        display: 'grid',
        justifyItems: 'center',
        alignContent: 'start',
        gap: 7,
        padding: boss ? 16 : 12,
        textAlign: 'center',
        boxShadow: enabled
          ? boss
            ? '0 0 30px rgba(246,196,69,0.26), 0 16px 42px rgba(0,0,0,0.32)'
            : '0 0 28px rgba(0,245,255,0.24), 0 14px 36px rgba(0,0,0,0.28)'
          : 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          color: defeated ? '#86efac' : enabled ? (boss ? '#f6c445' : '#7fe7ff') : 'rgba(255,255,255,0.25)',
          fontSize: 11,
          fontWeight: 950,
          letterSpacing: '0.08em',
        }}
      >
        {defeated ? 'CLEAR' : enabled ? 'LIVE' : 'GHOST'}
      </span>
      <img
        src={getBotAvatarUrl(bot)}
        alt=""
        width={avatarSize}
        height={avatarSize}
        style={{
          borderRadius: 999,
          objectFit: 'cover',
          border: `2px solid ${enabled ? (boss ? 'rgba(246,196,69,0.8)' : 'rgba(127,231,255,0.75)') : 'rgba(255,255,255,0.16)'}`,
          boxShadow: enabled ? '0 0 18px rgba(127,231,255,0.3)' : 'none',
        }}
      />
      <span style={{ fontSize: boss ? 18 : 14, fontWeight: 1000, lineHeight: 1.1 }}>
        {bot.name}
      </span>
      <span style={{ fontSize: 12, color: theme.textSecondary, fontWeight: 850 }}>
        {bot.rating}{boss ? ' final boss' : ''}
      </span>
      <span style={{ fontSize: 11, color: '#ff9ac0', fontWeight: 850 }}>
        {downside ? downside.name : 'Instability'}
      </span>
      {!boss ? (
        <span style={{ fontSize: 11, color: '#86efac', fontWeight: 850 }}>
          {pickup ? pickup.name : 'Pickup'}
        </span>
      ) : null}
    </button>
  );
}

function RouteMap({
  run,
  activeRun,
  choices,
  bossReady,
  busy,
  handleStartNode,
}) {
  const choiceIds = new Set(choices.map((n) => n.id));
  const stageCount = run.map.stages.length;
  const rowTemplate = `repeat(${stageCount}, minmax(178px, auto)) minmax(166px, auto)`;
  const beams = [];
  for (let stageIndex = 0; stageIndex < stageCount; stageIndex += 1) {
    const stage = run.map.stages[stageIndex];
    const nextStage = run.map.stages[stageIndex + 1];
    const fromCount = stage.length;
    const toCount = nextStage ? nextStage.length : 1;
    for (let from = 0; from < fromCount; from += 1) {
      const fromX = ((from + 0.5) / fromCount) * 100;
      const fromY = ((stageIndex + 0.62) / (stageCount + 1)) * 100;
      for (let to = 0; to < toCount; to += 1) {
        const toX = nextStage ? ((to + 0.5) / toCount) * 100 : 50;
        const toY = ((stageIndex + 1.42) / (stageCount + 1)) * 100;
        beams.push({ fromX, fromY, toX, toY, key: `${stageIndex}-${from}-${to}` });
      }
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        minHeight: 720,
        border: '1px solid rgba(127,231,255,0.18)',
        borderRadius: 22,
        padding: '24px clamp(12px, 3vw, 34px)',
        background:
          'radial-gradient(circle at 50% 5%, rgba(127,231,255,0.11), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
        overflowX: 'auto',
        overflowY: 'hidden',
        boxShadow: 'inset 0 0 38px rgba(0,245,255,0.05)',
      }}
    >
      <div style={{ position: 'relative', minWidth: 760, minHeight: 672 }}>
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0.8,
        }}
      >
        <defs>
          <linearGradient id="qc-unstable-beam" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#00f5ff" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#b400ff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#ff3b7f" stopOpacity="0.18" />
          </linearGradient>
          <filter id="qc-unstable-glow">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {beams.map((beam) => (
          <line
            key={beam.key}
            x1={beam.fromX}
            y1={beam.fromY}
            x2={beam.toX}
            y2={beam.toY}
            stroke="url(#qc-unstable-beam)"
            strokeWidth="0.45"
            filter="url(#qc-unstable-glow)"
          />
        ))}
        {run.map.stages.map((stage, stageIndex) => (
          stage.map((_, nodeIndex) => {
            const x = ((nodeIndex + 0.5) / stage.length) * 100;
            const y = ((stageIndex + 0.62) / (stageCount + 1)) * 100;
            return <circle key={`${stageIndex}-${nodeIndex}`} cx={x} cy={y} r="0.72" fill="#7fe7ff" opacity="0.5" />;
          })
        ))}
        <circle cx="50" cy={((stageCount + 0.42) / (stageCount + 1)) * 100} r="1.1" fill="#f6c445" opacity="0.75" />
      </svg>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateRows: rowTemplate,
          gap: 22,
        }}
      >
        {run.map.stages.map((stage, stageIndex) => (
          <div key={`stage-${stageIndex}`} style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Slit {stageIndex + 1}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${stage.length}, minmax(120px, 1fr))`,
                gap: 14,
                alignItems: 'center',
              }}
            >
              {stage.map((node) => {
                const bot = getBotById(node.botId);
                const downside = downsideById(node.downsideId);
                const pickup = pickupById(node.pickupId);
                const enabled = activeRun && choiceIds.has(node.id);
                const defeated = run.defeatedBotIds.includes(node.botId);
                return (
                  <NodeButton
                    key={node.id}
                    node={node}
                    bot={bot}
                    downside={downside}
                    pickup={pickup}
                    enabled={enabled}
                    defeated={defeated}
                    busy={busy}
                    avatarSize={64}
                    onClick={() => handleStartNode(node)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
          <div style={{ color: '#f6c445', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Collapse Point
          </div>
          {(() => {
            const node = run.map.boss;
            const bot = getBotById(UNSTABLE_BOSS_ID);
            const downside = downsideById(node.downsideId);
            const defeated = run.defeatedBotIds.includes(UNSTABLE_BOSS_ID);
            return (
              <NodeButton
                node={node}
                bot={bot}
                downside={downside}
                pickup={null}
                enabled={bossReady}
                defeated={defeated}
                busy={busy}
                avatarSize={78}
                boss
                onClick={() => handleStartNode(node)}
              />
            );
          })()}
        </div>
      </div>
      </div>
    </div>
  );
}

export default function UnstableLinePanel({
  auth = null,
  onOpenAccount = () => {},
  onStartGame = () => {},
  onOpenPage = () => {},
  page = false,
}) {
  const user = auth && auth.user ? auth.user : null;
  const devUnlockAvailable = isUnstableLineDevUnlockAvailable();
  const [devUnlocked, setDevUnlocked] = useState(() => hasUnstableLineDevUnlock());
  const [progress, setProgress] = useState([]);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);

  const beginnerBots = useMemo(() => beginnerUnlockBots(), []);
  const mapBots = useMemo(() => unstableLineMapBots(), []);
  const allFreeIds = useMemo(() => FREE_BOTS.map((b) => b.id), []);
  const effectiveUser = devUnlocked ? UNSTABLE_DEV_USER : user;
  const clearedIds = useMemo(() => new Set(progress.map((p) => p.bot_id)), [progress]);
  const unlocked = Boolean(effectiveUser) && beginnerBots.every((bot) => clearedIds.has(bot.id));

  const refresh = useCallback(async () => {
    if (devUnlocked) {
      setProgress(FREE_BOTS.map((bot) => ({
        bot_id: bot.id,
        cleared_at: new Date(0).toISOString(),
        unlocked_flavor_at: new Date(0).toISOString(),
        first_clear_mode: 'dev',
      })));
      setRun(loadUnstableLineRun(UNSTABLE_DEV_USER));
      return;
    }
    if (!effectiveUser) {
      setProgress([]);
      setRun(null);
      return;
    }
    const rows = await fetchBotProgress(effectiveUser, allFreeIds);
    setProgress(rows);
    setRun(loadUnstableLineRun(effectiveUser));
  }, [devUnlocked, effectiveUser, allFreeIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onUpdate = () => {
      setDevUnlocked(hasUnstableLineDevUnlock());
      if (effectiveUser) setRun(loadUnstableLineRun(effectiveUser));
    };
    window.addEventListener('qcUnstableLineUpdated', onUpdate);
    return () => window.removeEventListener('qcUnstableLineUpdated', onUpdate);
  }, [effectiveUser]);

  const ensureRun = useCallback(async () => {
    if (!effectiveUser) return null;
    const existing = loadUnstableLineRun(effectiveUser);
    if (existing && existing.status === 'active') {
      setRun(existing);
      return existing;
    }
    const next = createUnstableLineRun(effectiveUser);
    saveUnstableLineRun(effectiveUser, next);
    setRun(next);
    await syncUnstableLineRun(effectiveUser, next);
    return next;
  }, [effectiveUser]);

  const startFresh = useCallback(async () => {
    if (!effectiveUser) return;
    setBusy(true);
    try {
      const next = createUnstableLineRun(effectiveUser);
      saveUnstableLineRun(effectiveUser, next);
      setRun(next);
      await syncUnstableLineRun(effectiveUser, next);
    } finally {
      setBusy(false);
    }
  }, [effectiveUser]);

  const handleStartNode = useCallback(async (node) => {
    if (!effectiveUser || !node || busy) return;
    setBusy(true);
    try {
      const activeRun = await ensureRun();
      const latestNode = nextUnstableChoices(activeRun).find((choice) => choice.id === node.id);
      if (!latestNode) return;
      const nextRun = await startUnstableFight(effectiveUser, activeRun, latestNode);
      const bot = getBotById(latestNode.botId);
      if (!nextRun || !bot) return;
      setRun(nextRun);
      onStartGame({
        gameMode: 'ai',
        aiBotId: bot.id,
        aiDifficulty: bot.tier,
        preferredSide: 'random',
        timeControl: '5+0',
        unstableLine: {
          runId: nextRun.id,
          nodeId: latestNode.id,
          botId: bot.id,
          downsideId: latestNode.downsideId,
          pickupId: latestNode.pickupId || null,
          devOnly: Boolean(effectiveUser.devOnly),
          devUserId: effectiveUser.devOnly ? effectiveUser.id : null,
        },
      });
    } finally {
      setBusy(false);
    }
  }, [busy, effectiveUser, ensureRun, onStartGame]);

  const activeRun = run && run.status === 'active' ? run : null;
  const displayRun = activeRun || run;
  const choices = activeRun ? nextUnstableChoices(activeRun) : [];
  const choiceIds = new Set(choices.map((n) => n.id));
  const bossReady = Boolean(activeRun && activeRun.currentStage >= activeRun.map.stages.length);
  const nodeAvatarSize = page ? 64 : 36;
  const bossAvatarSize = page ? 78 : 42;

  const baseButton = {
    width: '100%',
    minWidth: 0,
    borderRadius: page ? 16 : 8,
    border: `1px solid ${theme.border}`,
    background: 'rgba(255,255,255,0.05)',
    color: theme.textPrimary,
    padding: page ? 14 : 10,
    display: 'grid',
    gap: 6,
    textAlign: 'left',
  };

  const devControls = devUnlockAvailable ? (
    <div
      style={{
        display: 'grid',
        gap: 6,
        border: '1px dashed rgba(246,196,69,0.55)',
        borderRadius: 8,
        padding: 8,
        background: 'rgba(246,196,69,0.07)',
      }}
    >
      <span style={{ color: '#f6c445', fontSize: 11, fontWeight: 950, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
        Local Dev Only
      </span>
      <button
        type="button"
        onClick={() => {
          const next = !devUnlocked;
          if (setUnstableLineDevUnlock(next)) setDevUnlocked(next);
        }}
        style={{
          padding: '7px 9px',
          borderRadius: 8,
          border: '1px solid rgba(246,196,69,0.55)',
          background: devUnlocked ? 'rgba(255,255,255,0.04)' : 'rgba(246,196,69,0.15)',
          color: theme.textPrimary,
          fontSize: 12,
          fontWeight: 900,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {devUnlocked ? 'Disable dev unlock overlay' : 'Dev unlock all free bots + mode'}
      </button>
    </div>
  ) : null;

  if (!page) {
    const lockedText = !effectiveUser
      ? 'Sign in free to save bot unlocks.'
      : unlocked
        ? `Route map ready: ${mapBots.length} bots plus Magnus Einstein.`
        : 'Locked until you beat the two beginner bots.';
    return (
      <section style={{ display: 'grid', gap: 10 }}>
        <button
          type="button"
          onClick={onOpenPage}
          style={{
            ...baseButton,
            minHeight: 112,
            background: unlocked || devUnlocked
              ? 'linear-gradient(90deg, rgba(0,245,255,0.17), rgba(180,0,255,0.16), rgba(255,59,127,0.13))'
              : 'rgba(255,255,255,0.035)',
            border: unlocked || devUnlocked ? '1px solid rgba(127,231,255,0.55)' : '1px solid rgba(127,231,255,0.25)',
            cursor: 'pointer',
            boxShadow: unlocked || devUnlocked ? '0 0 18px rgba(0,245,255,0.12)' : 'none',
          }}
        >
          <span style={{ color: '#7fe7ff', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.11em' }}>
            Double-slit map
          </span>
          <span style={{ fontSize: 17, fontWeight: 1000, lineHeight: 1.05 }}>
            Enter the Unstable Line
          </span>
          <span style={{ fontSize: 12.5, color: theme.textSecondary, lineHeight: 1.4 }}>
            {lockedText}
          </span>
        </button>
      </section>
    );
  }

  if (!effectiveUser) {
    return (
      <section style={{ display: 'grid', gap: 10 }}>
        <button
          type="button"
          onClick={onOpenAccount}
          style={{
            ...baseButton,
            background: 'linear-gradient(90deg, rgba(0,245,255,0.16), rgba(180,0,255,0.14))',
            border: '1px solid rgba(127,231,255,0.45)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 950 }}>Enter the Unstable Line</span>
          <span style={{ fontSize: 12.5, color: theme.textSecondary, lineHeight: 1.4 }}>
            Sign in free to save bot unlocks and start the double-slit run.
          </span>
        </button>
        {devControls}
      </section>
    );
  }

  if (!unlocked) {
    return (
      <section style={{ display: 'grid', gap: 10 }}>
        {devControls}
        <div
          style={{
            ...baseButton,
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(127,231,255,0.25)',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 950 }}>Enter the Unstable Line</span>
          <span style={{ fontSize: 12.5, color: theme.textSecondary, lineHeight: 1.4 }}>
            Locked until you beat the two beginner bots.
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {beginnerBots.map((bot) => <BotPip key={bot.id} bot={bot} cleared={clearedIds.has(bot.id)} />)}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: page ? 18 : 12 }}>
      {devControls}
      <div
        style={{
          border: '1px solid rgba(127,231,255,0.35)',
          borderRadius: page ? 16 : 8,
          padding: page ? 18 : 11,
          background: 'linear-gradient(90deg, rgba(0,245,255,0.11), rgba(180,0,255,0.09), rgba(255,59,127,0.08))',
          display: 'grid',
          gap: page ? 12 : 8,
          boxShadow: page ? '0 18px 50px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(255,255,255,0.04)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 950, flex: 1, minWidth: 0 }}>Enter the Unstable Line</span>
          <span style={{ fontSize: 11, color: '#7fe7ff', fontWeight: 900, whiteSpace: 'nowrap' }}>3 + boss</span>
        </div>
        <div style={{ fontSize: 12.5, color: theme.textSecondary, lineHeight: 1.4 }}>
          A double-slit map with {mapBots.length} target bots plus Magnus Einstein. Bot nodes add lasting downsides; pickup spaces add lasting upsides.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={startFresh}
            disabled={busy}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(127,231,255,0.45)',
              background: 'rgba(0,245,255,0.12)',
              color: theme.textPrimary,
              fontSize: 12.5,
              fontWeight: 900,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            New Map
          </button>
          {!activeRun ? (
            <button
              type="button"
              onClick={ensureRun}
              disabled={busy}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(74,222,128,0.45)',
                background: 'rgba(74,222,128,0.14)',
                color: theme.textPrimary,
                fontSize: 12.5,
                fontWeight: 900,
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              Build Route
            </button>
          ) : null}
        </div>
      </div>

      {displayRun ? (
        <>
          <RouteMap
            run={displayRun}
            activeRun={activeRun}
            choices={choices}
            bossReady={bossReady}
            busy={busy}
            handleStartNode={handleStartNode}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            <StackList title="Carried Upsides" ids={displayRun.carriedUpsideIds || []} resolver={pickupById} empty="No pickups yet." />
            <StackList title="Carried Downsides" ids={displayRun.carriedDownsideIds || []} resolver={downsideById} empty="No bot instability yet." />
          </div>

          {displayRun.status === 'won' || displayRun.status === 'lost' ? (
            <div style={{ fontSize: 12.5, color: displayRun.status === 'won' ? '#86efac' : '#ff9ac0', fontWeight: 850 }}>
              {displayRun.status === 'won' ? 'Run complete. The line collapsed in your favor.' : 'Run lost. Start a fresh map when ready.'}
            </div>
          ) : null}
        </>
      ) : (
        <button type="button" onClick={ensureRun} disabled={busy} style={{ ...baseButton, cursor: busy ? 'default' : 'pointer' }}>
          <span style={{ fontWeight: 950 }}>Build Double-Slit Map</span>
          <span style={{ fontSize: 12.5, color: theme.textSecondary }}>Place every eligible bot and chart a route to Magnus Einstein.</span>
        </button>
      )}
    </section>
  );
}
