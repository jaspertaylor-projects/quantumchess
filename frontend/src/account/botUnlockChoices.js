// Pure candidate selection for the post-win bot reward. The first two slots
// favor opponents the account can play now; the third occasionally previews
// a higher tier. This keeps rewards useful without hiding the paid roster.

import { ACTIVE_BOTS, canAccessBot } from '../ai/bots.js';

function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function chooseBotUnlockCandidates({
  bots = ACTIVE_BOTS,
  unlockedIds = [],
  beatenBotId = null,
  accountAccess = 'free',
  random = Math.random,
} = {}) {
  const unlocked = new Set(unlockedIds);
  const remaining = bots.filter((bot) => bot.id !== beatenBotId && !unlocked.has(bot.id));
  const eligible = shuffled(remaining.filter((bot) => canAccessBot(bot, accountAccess)), random);
  const gated = shuffled(remaining.filter((bot) => !canAccessBot(bot, accountAccess)), random);
  const choices = eligible.splice(0, Math.min(2, eligible.length));

  while (choices.length < 3 && (eligible.length || gated.length)) {
    const previewHigherTier = gated.length > 0 && (eligible.length === 0 || random() < 0.35);
    choices.push(previewHigherTier ? gated.shift() : eligible.shift() || gated.shift());
  }

  return choices;
}
