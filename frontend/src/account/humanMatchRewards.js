// Human matches award the next unearned opponent, independent of account tier.
import { MATCH_UNLOCK_BOTS } from '../ai/bots.js';

export function isHumanMatchComplete({ gameOver, externalGameOver = {}, isOnline, aiBot, moves = [] }) {
  return Boolean((isOnline || !aiBot) && moves.length > 0
    && (gameOver || externalGameOver.over) && !externalGameOver.silent);
}

export function nextMatchUnlock(unlockedIds = []) {
  const unlocked = new Set(unlockedIds);
  return MATCH_UNLOCK_BOTS.find((bot) => !unlocked.has(bot.id)) || null;
}

const GUEST_KEY = 'qcHumanMatchUnlocks:v1';
export function guestMatchRewards(storage = globalThis.localStorage) {
  try {
    const data = JSON.parse(storage.getItem(GUEST_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (_) { return {}; }
}

export function guestUnlockedBotIds(storage = globalThis.localStorage) {
  return [...new Set(Object.values(guestMatchRewards(storage)))].filter((id) => MATCH_UNLOCK_BOTS.some((bot) => bot.id === id));
}

export function awardGuestMatch(gameKey, storage = globalThis.localStorage) {
  const rewards = guestMatchRewards(storage);
  if (Object.hasOwn(rewards, gameKey)) return rewards[gameKey];
  const next = nextMatchUnlock(Object.values(rewards));
  // No more bookkeeping is needed once all opponents are available.
  if (!next) return null;
  rewards[gameKey] = next.id;
  storage.setItem(GUEST_KEY, JSON.stringify(rewards));
  return next.id;
}
