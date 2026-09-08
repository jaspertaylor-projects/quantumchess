// Automatically save one bot reward per completed human match, even if its
// result screen is dismissed. Retry uses the same durable match identifier.
import { useCallback, useEffect, useState } from 'react';
import { getActiveBotById } from '../ai/bots.js';
import { awardHumanMatchBot } from '../account/botProgress.js';

export default function useBotUnlockReward({ active = false, auth = null, gameKey = null }) {
  const [reward, setReward] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const userId = auth?.user?.id;
  useEffect(() => {
    if (!active || !gameKey) { setReward(null); return undefined; }
    let cancelled = false;
    setReward({ status: 'loading' });
    awardHumanMatchBot({ user: auth?.isDevPreview ? null : auth?.user, gameKey })
      .then((botId) => {
        if (!cancelled) setReward({
          status: botId ? 'unlocked' : 'complete',
          bot: getActiveBotById(botId),
          guest: !userId,
        });
      })
      .catch(() => {
        if (!cancelled) setReward({ status: 'error', error: 'Your bot unlock could not be saved. Please retry.' });
      });
    return () => { cancelled = true; };
  }, [active, gameKey, userId, attempt, auth?.isDevPreview]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { reward, retry };
}
