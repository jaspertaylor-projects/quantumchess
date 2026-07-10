// frontend/src/hooks/useGameRecording.js
// Purpose: Save finished games for signed-in players (with Elo against rated
// bots) exactly once per game end, and record first-time bot clears for the
// ladder. Extracted from App.jsx.
// Imports From: ../account/gameSync.js, ../account/botProgress.js
// Exported To: ../App.jsx

import { useEffect, useRef } from 'react';
import { recordFinishedGame } from '../account/gameSync.js';
import { recordBotClear } from '../account/botProgress.js';

export default function useGameRecording({
  auth,
  showWinPopup,
  gameOver,
  winner,
  externalGameOver,
  userTeam,
  aiBot,
  isOnlineGameRef,
  moves,
}) {
  const gameRecordedRef = useRef(false);
  useEffect(() => {
    if (!showWinPopup) {
      gameRecordedRef.current = false;
      return;
    }
    if (gameRecordedRef.current || !auth.user) return;
    gameRecordedRef.current = true;

    const text = externalGameOver.over ? externalGameOver.text || '' : '';
    const winnerSide = gameOver
      ? winner || null
      : /White (wins|resigns)/i.test(text)
        ? (/resigns/i.test(text) ? 'black' : 'white')
        : /Black (wins|resigns)/i.test(text)
          ? (/resigns/i.test(text) ? 'white' : 'black')
          : null;
    const result = winnerSide == null ? 'draw' : winnerSide === userTeam ? 'win' : 'loss';
    const vsBot = Boolean(aiBot) && !isOnlineGameRef.current;

    recordFinishedGame({
      user: auth.user,
      profile: auth.profile,
      opponent: vsBot ? aiBot.id : (isOnlineGameRef.current ? 'online' : 'local'),
      opponentRating: vsBot ? aiBot.rating : null,
      userSide: userTeam,
      result,
      moves,
    })
      .then(async () => {
        if (vsBot && result === 'win') {
          await recordBotClear({ user: auth.user, botId: aiBot.id });
        }
        await auth.refreshProfile();
      })
      .catch(() => {});
  }, [showWinPopup, gameOver, winner, externalGameOver, userTeam, aiBot, moves]); // eslint-disable-line react-hooks/exhaustive-deps
}
