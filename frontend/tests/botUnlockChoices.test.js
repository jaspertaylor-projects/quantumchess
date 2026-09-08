import { describe, expect, it } from 'vitest';

import {
  ACTIVE_BOTS, BOT_ACCESS, FREE_BOTS, PREMIUM_BOTS, STARTER_BOT_ID,
  canAccessBot,
} from '../src/ai/bots.js';
import { chooseBotUnlockCandidates } from '../src/account/botUnlockChoices.js';

describe('bot unlock choices', () => {
  it('reserves two immediately playable choices when the tier has them', () => {
    const choices = chooseBotUnlockCandidates({
      unlockedIds: [STARTER_BOT_ID],
      beatenBotId: STARTER_BOT_ID,
      accountAccess: BOT_ACCESS.FREE,
      random: () => 0,
    });
    expect(choices).toHaveLength(3);
    expect(choices.filter((bot) => canAccessBot(bot, BOT_ACCESS.FREE))).toHaveLength(2);
    expect(choices.some((bot) => !canAccessBot(bot, BOT_ACCESS.FREE))).toBe(true);
  });

  it('does not force a paid preview when the random roll says no', () => {
    const choices = chooseBotUnlockCandidates({
      unlockedIds: [STARTER_BOT_ID],
      beatenBotId: STARTER_BOT_ID,
      accountAccess: BOT_ACCESS.FREE,
      random: () => 0.99,
    });
    expect(choices).toHaveLength(3);
    expect(choices.every((bot) => FREE_BOTS.some((freeBot) => freeBot.id === bot.id))).toBe(true);
  });

  it('gives Premium access to all bots and Free access only to the Free roster', () => {
    for (const bot of ACTIVE_BOTS) expect(canAccessBot(bot, BOT_ACCESS.PREMIUM)).toBe(true);
    for (const bot of PREMIUM_BOTS) expect(canAccessBot(bot, BOT_ACCESS.FREE)).toBe(false);
    expect(Object.values(BOT_ACCESS).sort()).toEqual(['free', 'premium']);
  });

  it('never offers an already unlocked, beaten, or shelved bot', () => {
    const unlocked = ACTIVE_BOTS.slice(0, 4).map((bot) => bot.id);
    const choices = chooseBotUnlockCandidates({
      unlockedIds: unlocked,
      beatenBotId: ACTIVE_BOTS[4].id,
      accountAccess: BOT_ACCESS.PREMIUM,
      random: () => 0.5,
    });
    expect(choices).toHaveLength(3);
    expect(choices.some((bot) => unlocked.includes(bot.id))).toBe(false);
    expect(choices.some((bot) => bot.id === ACTIVE_BOTS[4].id)).toBe(false);
    expect(choices.every((bot) => ACTIVE_BOTS.includes(bot))).toBe(true);
  });
});
