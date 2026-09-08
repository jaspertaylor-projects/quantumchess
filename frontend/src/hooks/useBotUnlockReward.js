// Purpose: Prepare and persist the choose-one-of-three bot reward shown after
// a signed-in player beats any bot, including the guided-intro opponent.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVE_BOTS, BOT_ACCESS, STARTER_BOT_ID, botAccess, canAccessBot,
} from '../ai/bots.js';
import { botAccountAccess } from '../account/billing.js';
import {
  fetchBotProgress,
  fetchBotUnlocks,
  recordBotUnlock,
} from '../account/botProgress.js';
import { chooseBotUnlockCandidates } from '../account/botUnlockChoices.js';

const ACTIVE_IDS = ACTIVE_BOTS.map((bot) => bot.id);

export default function useBotUnlockReward({
  active = false,
  auth = null,
  gameKey = null,
  beatenBotId = null,
  onUnlocked = () => {},
}) {
  const [reward, setReward] = useState(null);
  const handledGameRef = useRef(null);
  const user = auth && auth.user;
  const profile = auth && auth.profile;
  const userId = user && user.id;

  useEffect(() => {
    if (!active || !beatenBotId) return undefined;
    const rewardKey = `${gameKey}:${userId || 'signed-out'}`;
    if (handledGameRef.current === rewardKey) return undefined;
    handledGameRef.current = rewardKey;

    if (!user) {
      setReward({ status: 'signed-out', candidates: [], accountAccess: 'free' });
      return undefined;
    }

    let cancelled = false;
    setReward({ status: 'loading', candidates: [], accountAccess: botAccountAccess(profile) });
    Promise.all([
      fetchBotProgress(user, ACTIVE_IDS),
      fetchBotUnlocks(user, ACTIVE_IDS),
    ]).then(([clears, unlocks]) => {
      if (cancelled) return;
      const unlockedIds = new Set([
        STARTER_BOT_ID,
        ...clears.map((row) => row.bot_id),
        ...unlocks.map((row) => row.bot_id),
      ]);
      const accountAccess = botAccountAccess(profile);
      // Premium unlocks the entire roster directly. Win
      // choices are the progression mechanism for Free bots; paid cards in a
      // lower-tier reward are an upgrade preview, not a second lock to clear.
      for (const bot of ACTIVE_BOTS) {
        if (accountAccess === BOT_ACCESS.PREMIUM) {
          unlockedIds.add(bot.id);
        }
      }
      const candidates = chooseBotUnlockCandidates({
        unlockedIds,
        beatenBotId,
        accountAccess,
      });
      setReward({
        status: candidates.length ? 'choices' : 'complete',
        candidates,
        accountAccess,
        selectedBot: null,
        busyBotId: null,
        error: '',
      });
    }).catch(() => {
      if (!cancelled) {
        const accountAccess = botAccountAccess(profile);
        const fallbackUnlocked = [
          STARTER_BOT_ID,
          ...ACTIVE_BOTS
            .filter((bot) => accountAccess === BOT_ACCESS.PREMIUM)
            .map((bot) => bot.id),
        ];
        setReward({
          status: 'choices',
          candidates: chooseBotUnlockCandidates({
            unlockedIds: fallbackUnlocked,
            beatenBotId,
            accountAccess,
          }),
          accountAccess,
          selectedBot: null,
          busyBotId: null,
          error: '',
        });
      }
    });
    return () => { cancelled = true; };
  }, [active, beatenBotId, gameKey, userId]); // profile refresh is handled below

  // If Checkout returns while the result screen is still mounted, immediately
  // turn its gated preview into a playable choice.
  useEffect(() => {
    if (!reward || !auth || !auth.user) return;
    const nextAccess = botAccountAccess(auth.profile);
    if (reward.accountAccess !== nextAccess) {
      setReward((current) => current ? { ...current, accountAccess: nextAccess } : current);
    }
  }, [profile && profile.tier, reward && reward.accountAccess]);

  useEffect(() => {
    if (active) return;
    setReward(null);
  }, [active, gameKey]);

  const choose = useCallback(async (bot) => {
    if (!reward || reward.status !== 'choices' || reward.selectedBot || !bot) return false;
    if (!canAccessBot(bot, reward.accountAccess)) return false;
    setReward((current) => ({ ...current, busyBotId: bot.id, error: '' }));
    const paidRosterUnlock = botAccess(bot) !== BOT_ACCESS.FREE;
    const result = paidRosterUnlock || (auth && auth.isDevPreview)
      ? { saved: true }
      : await recordBotUnlock({ user: auth && auth.user, botId: bot.id });
    if (!result.saved) {
      setReward((current) => ({
        ...current,
        busyBotId: null,
        error: 'That unlock could not be saved. Please try again.',
      }));
      return false;
    }
    setReward((current) => ({
      ...current,
      status: 'selected',
      selectedBot: bot,
      busyBotId: null,
      error: '',
    }));
    onUnlocked(bot);
    return true;
  }, [auth, onUnlocked, reward]);

  return { reward, choose };
}
