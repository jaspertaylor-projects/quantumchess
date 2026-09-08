import { describe, expect, it } from 'vitest';
import { ACTIVE_BOTS, BOT_ACCESS, MATCH_UNLOCK_BOTS, PREMIUM_BOTS, STARTER_BOT_ID, canPlayBot } from '../src/ai/bots.js';
import { awardGuestMatch, guestUnlockedBotIds, isHumanMatchComplete, nextMatchUnlock } from '../src/account/humanMatchRewards.js';

const storage = () => { const rows = new Map(); return { getItem: (key) => rows.get(key) || null, setItem: (key, value) => rows.set(key, value) }; };

describe('human-match bot progression', () => {
  it('keeps eleven earned opponents locked for both tiers until earned', () => {
    expect(MATCH_UNLOCK_BOTS).toHaveLength(11);
    expect(PREMIUM_BOTS).toHaveLength(6);
    for (const tier of Object.values(BOT_ACCESS)) {
      expect(canPlayBot(ACTIVE_BOTS.find((b) => b.id === STARTER_BOT_ID), tier)).toBe(true);
      for (const bot of MATCH_UNLOCK_BOTS) {
        expect(canPlayBot(bot, tier)).toBe(false);
        expect(canPlayBot(bot, tier, [bot.id])).toBe(true);
      }
    }
    for (const bot of PREMIUM_BOTS) {
      expect(canPlayBot(bot, 'free', [bot.id])).toBe(false);
      expect(canPlayBot(bot, 'premium')).toBe(true);
    }
  });
  it('awards each guest match exactly once, survives reloads, and stops at eleven', () => {
    const browser = storage();
    for (const [i, bot] of MATCH_UNLOCK_BOTS.entries()) {
      expect(awardGuestMatch(`local:${i}`, browser)).toBe(bot.id);
      expect(awardGuestMatch(`local:${i}`, browser)).toBe(bot.id);
      expect(guestUnlockedBotIds(browser)).toHaveLength(i + 1);
    }
    expect(awardGuestMatch('local:extra', browser)).toBeNull();
    expect(awardGuestMatch('local:0', browser)).toBe(MATCH_UNLOCK_BOTS[0].id);
    expect(guestUnlockedBotIds(browser)).toEqual(MATCH_UNLOCK_BOTS.map((bot) => bot.id));
  });
  it('skips earned opponents and never offers a Premium or shelved opponent', () => {
    const earned = MATCH_UNLOCK_BOTS.filter((_, i) => i !== 7).map((bot) => bot.id);
    expect(nextMatchUnlock(earned)).toBe(MATCH_UNLOCK_BOTS[7]);
    expect(nextMatchUnlock(MATCH_UNLOCK_BOTS.map((bot) => bot.id))).toBeNull();
  });
  it.each([false, true])('counts local/online human wins, losses, draws, resignations and timeouts (online=%s)', (isOnline) => {
    const common = { isOnline, moves: [{ from: 'a2', to: 'a3' }] };
    expect(isHumanMatchComplete({ ...common, gameOver: true })).toBe(true);
    for (const text of ['White wins by resignation.', 'Black wins on time.', 'Draw by agreement.']) {
      expect(isHumanMatchComplete({ ...common, externalGameOver: { over: true, text } })).toBe(true);
    }
  });
  it('excludes bot games, unfinished games, empty games and silent abandoned/voided games', () => {
    const finished = { gameOver: true, moves: [{}] };
    expect(isHumanMatchComplete({ ...finished, aiBot: ACTIVE_BOTS[0] })).toBe(false);
    expect(isHumanMatchComplete({ moves: [{}] })).toBe(false);
    expect(isHumanMatchComplete({ gameOver: true, moves: [] })).toBe(false);
    expect(isHumanMatchComplete({ ...finished, externalGameOver: { over: true, silent: true } })).toBe(false);
  });
  it('reports a storage failure instead of claiming a guest unlock was saved', () => {
    expect(() => awardGuestMatch('game', { getItem: () => null, setItem: () => { throw Error('Storage blocked'); } })).toThrow('Storage blocked');
  });
});
