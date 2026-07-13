// frontend/src/unstableLine/unstableLine.js
// SHELVED (2026-07-08): Enter the Unstable Line is parked until post-launch.
// Nothing imports this directory, so none of it is bundled or reachable in
// production. Do not wire it back in until the run modifiers are real
// gameplay (see README roadmap). The shipped feature is the plain bot ladder
// (../ladder/BotLadderPanel.jsx).
// Purpose: Generate and persist Enter the Unstable Line solo-run state.
// Imports From: ../ai/bots.js, ../account/supabaseClient.js
// Exported To: (none — shelved)

import { FREE_BOTS, getBotById } from '../ai/bots.js';
import { supabase } from '../account/supabaseClient.js';

export const UNSTABLE_BOSS_ID = 'rudolf-einstein';
export const UNSTABLE_UNLOCK_COUNT = 2;
export const UNSTABLE_DEV_UNLOCK_KEY = 'qcDevUnlockUnstableLine';
export const UNSTABLE_DEV_USER = { id: 'dev-local-unstable-line', devOnly: true };

const STORAGE_PREFIX = 'qcUnstableLineRun:';

const PICKUPS = [
  { id: 'takeback', name: '+1 Takeback', text: 'Bank one future undo token.' },
  { id: 'observe-hint', name: 'Observe Hint', text: 'Reveal one useful observation before a fight.' },
  { id: 'pawn-restore', name: 'Pawn Restore', text: 'Restore one collapsed pawn before each remaining fight.' },
  { id: 'clear-static', name: 'Clear Static', text: 'Clear one carried downside.' },
  { id: 'reroll', name: 'Reroll Pickup', text: 'Reroll a future pickup space.' },
  { id: 'reveal', name: 'Reveal Nodes', text: 'Reveal nearby hidden route info.' },
];

const DOWNSIDES = {
  clock: { id: 'clock-pressure', name: 'Clock Pressure', text: 'Your run clock tightens around this bot.' },
  ambiguity: { id: 'ambiguity-field', name: 'Ambiguity Field', text: 'More pieces begin the fight hard to read.' },
  capture: { id: 'capture-fog', name: 'Capture Fog', text: 'Early captures are harder to evaluate cleanly.' },
  collapse: { id: 'collapse-static', name: 'Collapse Static', text: 'Recoherence and collapse feel more volatile.' },
};

function orderedFreeBots() {
  return [...FREE_BOTS].sort((a, b) => a.rating - b.rating);
}

export function beginnerUnlockBots() {
  return orderedFreeBots().slice(0, UNSTABLE_UNLOCK_COUNT);
}

export function unstableLineBots() {
  const beginnerIds = new Set(beginnerUnlockBots().map((b) => b.id));
  return orderedFreeBots().filter((b) => !beginnerIds.has(b.id));
}

export function unstableLineMapBots() {
  return unstableLineBots().filter((b) => b.id !== UNSTABLE_BOSS_ID);
}

function makeSeed() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const hex = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}00000000000000000000000000000000`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < String(seed).length; i += 1) {
    h ^= String(seed).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function shuffle(items, seed) {
  const rand = seededRandom(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function downsideForBot(bot) {
  if (!bot) return DOWNSIDES.ambiguity;
  if (bot.search && Number(bot.search.timeMs) <= 900) return DOWNSIDES.clock;
  if (bot.weights && Number(bot.weights.kingHunt) >= 0.25) return DOWNSIDES.collapse;
  if (bot.weights && (Number(bot.weights.hangUndefended) >= 0.9 || Number(bot.weights.hangBadTrade) >= 0.62)) return DOWNSIDES.capture;
  return DOWNSIDES.ambiguity;
}

export function pickupById(id) {
  return PICKUPS.find((p) => p.id === id) || null;
}

export function downsideById(id) {
  return Object.values(DOWNSIDES).find((d) => d.id === id) || null;
}

export function createUnstableLineMap(seed = makeSeed()) {
  const rand = seededRandom(`${seed}:pickup`);
  const bots = shuffle(unstableLineMapBots(), seed);
  const stageCount = 3;
  const stages = Array.from({ length: stageCount }, (_, stageIndex) => []);

  bots.forEach((bot, index) => {
    const stageIndex = index % stageCount;
    const pickup = PICKUPS[Math.floor(rand() * PICKUPS.length)] || PICKUPS[0];
    stages[stageIndex].push({
      id: `s${stageIndex}-${bot.id}`,
      kind: 'bot',
      botId: bot.id,
      downsideId: downsideForBot(bot).id,
      pickupId: pickup.id,
    });
  });

  return {
    seed,
    stages,
    boss: {
      id: `boss-${UNSTABLE_BOSS_ID}`,
      kind: 'boss',
      botId: UNSTABLE_BOSS_ID,
      downsideId: downsideForBot(getBotById(UNSTABLE_BOSS_ID)).id,
      pickupId: null,
    },
  };
}

function storageKey(user) {
  return `${STORAGE_PREFIX}${user && user.id ? user.id : 'anonymous'}`;
}

export function isUnstableLineDevUnlockAvailable() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '';
}

export function hasUnstableLineDevUnlock() {
  if (!isUnstableLineDevUnlockAvailable()) return false;
  try {
    return localStorage.getItem(UNSTABLE_DEV_UNLOCK_KEY) === '1';
  } catch (_) {
    return false;
  }
}

export function setUnstableLineDevUnlock(enabled) {
  if (!isUnstableLineDevUnlockAvailable()) return false;
  try {
    if (enabled) localStorage.setItem(UNSTABLE_DEV_UNLOCK_KEY, '1');
    else localStorage.removeItem(UNSTABLE_DEV_UNLOCK_KEY);
    window.dispatchEvent(new CustomEvent('qcUnstableLineUpdated'));
    return true;
  } catch (_) {
    return false;
  }
}

export function createUnstableLineRun(user) {
  const seed = makeSeed();
  return {
    id: seed,
    status: 'active',
    mapSeed: seed,
    map: createUnstableLineMap(seed),
    currentStage: 0,
    carriedUpsideIds: [],
    carriedDownsideIds: [],
    defeatedBotIds: [],
    pendingFight: null,
    createdAt: new Date().toISOString(),
  };
}

export function loadUnstableLineRun(user) {
  if (!user) return null;
  try {
    const raw = localStorage.getItem(storageKey(user));
    if (!raw) return null;
    const run = JSON.parse(raw);
    return run && run.status === 'active' ? run : run || null;
  } catch (_) {
    return null;
  }
}

export function saveUnstableLineRun(user, run) {
  if (!user || !run) return;
  try {
    localStorage.setItem(storageKey(user), JSON.stringify(run));
    window.dispatchEvent(new CustomEvent('qcUnstableLineUpdated'));
  } catch (_) {
    // localStorage is convenience only.
  }
}

export async function syncUnstableLineRun(user, run) {
  if (!supabase || !user || !run || user.devOnly) return { saved: false };
  const payload = {
    id: run.id,
    user_id: user.id,
    status: run.status || 'active',
    map_seed: run.mapSeed || run.id,
    map: run.map || {},
    current_stage: Number(run.currentStage) || 0,
    carried_upside_ids: run.carriedUpsideIds || [],
    carried_downside_ids: run.carriedDownsideIds || [],
    defeated_bot_ids: run.defeatedBotIds || [],
    completed_at: run.status && run.status !== 'active' ? new Date().toISOString() : null,
  };
  const { error } = await supabase.from('qc_unstable_runs').upsert(payload, { onConflict: 'id' });
  return { saved: !error, error: error || null };
}

export function nextUnstableChoices(run) {
  if (!run || !run.map || run.status !== 'active') return [];
  if (run.currentStage >= run.map.stages.length) return [run.map.boss];
  return run.map.stages[run.currentStage] || [];
}

export async function startUnstableFight(user, run, node) {
  if (!user || !run || !node) return null;
  const bot = getBotById(node.botId);
  if (!bot) return null;
  const downside = downsideById(node.downsideId) || downsideForBot(bot);
  const nextRun = {
    ...run,
    pendingFight: {
      nodeId: node.id,
      botId: bot.id,
      stage: run.currentStage,
      downsideId: downside.id,
      pickupId: node.pickupId || null,
    },
    carriedDownsideIds: run.carriedDownsideIds.includes(downside.id)
      ? run.carriedDownsideIds
      : [...run.carriedDownsideIds, downside.id],
  };
  saveUnstableLineRun(user, nextRun);
  await syncUnstableLineRun(user, nextRun);
  return nextRun;
}

export async function completeUnstableFight(user, result) {
  if (!user) return null;
  const run = loadUnstableLineRun(user);
  if (!run || !run.pendingFight || run.status !== 'active') return run;
  const { botId, pickupId } = run.pendingFight;

  if (result !== 'win') {
    const lostRun = { ...run, status: 'lost', pendingFight: null };
    saveUnstableLineRun(user, lostRun);
    await syncUnstableLineRun(user, lostRun);
    return lostRun;
  }

  const defeated = run.defeatedBotIds.includes(botId)
    ? run.defeatedBotIds
    : [...run.defeatedBotIds, botId];
  const upsides = pickupId && !run.carriedUpsideIds.includes(pickupId)
    ? [...run.carriedUpsideIds, pickupId]
    : run.carriedUpsideIds;
  const beatBoss = botId === UNSTABLE_BOSS_ID;
  const nextRun = {
    ...run,
    status: beatBoss ? 'won' : 'active',
    defeatedBotIds: defeated,
    carriedUpsideIds: upsides,
    currentStage: beatBoss ? run.currentStage : run.currentStage + 1,
    pendingFight: null,
  };
  saveUnstableLineRun(user, nextRun);
  await syncUnstableLineRun(user, nextRun);
  return nextRun;
}
