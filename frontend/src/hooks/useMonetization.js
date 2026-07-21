// frontend/src/hooks/useMonetization.js
// Purpose: Everything money- and account-panel-adjacent — ads/analytics init,
// the game-end ad/analytics trigger, Stripe checkout return handling (with
// the post-checkout profile poll), premium gating, and the saved-game review
// fetch. Extracted from App.jsx.
// Imports From: ../ads/adService.js, ../analytics/analytics.js, ../account/billing.js, ../account/gameSync.js
// Exported To: ../App.jsx

import { useCallback, useEffect, useRef, useState } from 'react';
import { initAds, maybeShowGameEndAd } from '../ads/adService.js';
import { initAnalytics } from '../analytics/analytics.js';
import { PRODUCT_EVENT, trackProductEvent } from '../analytics/productEvents.js';
import { sendBotGameFinished } from '../analytics/statsPing.js';
import { consumeCheckoutReturn, isAdFree, isTipper } from '../account/billing.js';
import {
  buildSharedGameLink,
  fetchGameMoves,
  fetchSharedGame,
  readSharedGameToken,
  shareSavedGame,
} from '../account/gameSync.js';

function winnerSideFrom({ winner, externalGameOver }) {
  if (winner === 'white' || winner === 'black') return winner;
  if (!externalGameOver?.over) return null;
  const text = externalGameOver.text || '';
  if (/White (wins|resigns)/i.test(text)) return /resigns/i.test(text) ? 'black' : 'white';
  if (/Black (wins|resigns)/i.test(text)) return /resigns/i.test(text) ? 'white' : 'black';
  if (/draw/i.test(text)) return null;
  return undefined;
}

function endReasonFrom({ gameOverReason, externalGameOver }) {
  if (gameOverReason) return gameOverReason;
  const text = (externalGameOver?.text || '').toLowerCase();
  if (text.includes('resign')) return 'resignation';
  if (text.includes('time')) return 'time';
  if (text.includes('draw') || text.includes('agreement')) return 'agreement';
  return externalGameOver?.over ? 'external' : 'rules';
}

export default function useMonetization({
  auth,
  showWinPopup,
  onRequirePremiumExtra = null,
  aiBot = null,
  winner = null,
  userTeam = 'white',
  moves = [],
  gameOverReason = null,
  externalGameOver = null,
  gameInstanceId = 0,
  isOnlineGame = false,
}) {
  // Ads: dormant until VITE_ADSENSE_CLIENT is configured (post-approval).
  // Analytics: dormant until VITE_GA_MEASUREMENT_ID is configured.
  useEffect(() => {
    initAds();
    initAnalytics();
  }, []);

  // A genuine game end (winner popup) is the interstitial ad break point;
  // silent abandons never trigger it. Track a bot result and show an ad only
  // once per game instance, even if profile/state updates rerender the open
  // winner modal.
  const finishedTrackedGameRef = useRef(null);
  const adShownGameRef = useRef(null);
  useEffect(() => {
    if (!showWinPopup) return;
    if (aiBot && !isOnlineGame && finishedTrackedGameRef.current !== gameInstanceId) {
      const winnerSide = winnerSideFrom({ winner, externalGameOver });
      const finishedDetails = {
        result: winnerSide === undefined
          ? 'unknown'
          : winnerSide === null
            ? 'draw'
            : winnerSide === userTeam
              ? 'win'
              : 'loss',
        botId: aiBot.id,
        botTier: aiBot.tier,
        moveCount: Array.isArray(moves) ? moves.length : 0,
        endReason: endReasonFrom({ gameOverReason, externalGameOver }),
      };
      trackProductEvent(PRODUCT_EVENT.BOT_GAME_FINISHED, finishedDetails);
      sendBotGameFinished(finishedDetails);
      finishedTrackedGameRef.current = gameInstanceId;
    }
    if (!isAdFree(auth.profile) && adShownGameRef.current !== gameInstanceId) {
      maybeShowGameEndAd();
      adShownGameRef.current = gameInstanceId;
    }
  }, [
    showWinPopup,
    aiBot,
    winner,
    userTeam,
    moves,
    gameOverReason,
    externalGameOver,
    gameInstanceId,
    isOnlineGame,
    auth.profile,
  ]);

  const [accountOpen, setAccountOpenState] = useState(false);
  const [accountUpsellSource, setAccountUpsellSource] = useState('account');
  const setAccountOpen = useCallback((nextOpen, source = 'account') => {
    if (nextOpen) setAccountUpsellSource(source);
    setAccountOpenState(Boolean(nextOpen));
  }, []);
  const [pricingOpen, setPricingOpen] = useState(false);

  // Supabase signs the recovery-link visitor into a temporary recovery
  // session. Open the account panel immediately so the new-password form is
  // the first thing they see instead of making them find Account themselves.
  useEffect(() => {
    if (auth.recoveryMode) setAccountOpen(true, 'password_recovery');
  }, [auth.recoveryMode, setAccountOpen]);

  // Stripe Checkout returns to /?premium=success|cancelled. The webhook flips
  // the tier server-side, so after a success poll the profile briefly until
  // the upgrade shows up (or 30s passes).
  const [billingReturn, setBillingReturn] = useState(null);
  useEffect(() => {
    const status = consumeCheckoutReturn();
    if (status) {
      setBillingReturn(status);
      setAccountOpen(true);
    }
  }, []);
  useEffect(() => {
    if (billingReturn !== 'success' && billingReturn !== 'tip_thanks') return undefined;
    // Stop polling once the webhook's write has landed: tier for the
    // subscription, ad_free_until for a tip.
    const landed = billingReturn === 'success'
      ? Boolean(auth.profile && auth.profile.tier === 'paid')
      : isAdFree(auth.profile);
    if (landed) return undefined;
    const timer = setInterval(() => { auth.refreshProfile(); }, 2500);
    const stop = setTimeout(() => clearInterval(timer), 30000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [billingReturn, auth.profile, auth.refreshProfile]);

  const isPaidUser = Boolean(auth.profile && auth.profile.tier === 'paid');

  // Higher-tier bots route to the account panel, where both the one-time
  // Supporter tip and Premium subscription are visible.
  const handleRequirePremium = useCallback(() => {
    if (onRequirePremiumExtra) onRequirePremiumExtra();
    setAccountOpen(true, 'premium_bot');
  }, [onRequirePremiumExtra, setAccountOpen]);

  // Saved-game replay and Premium analysis share the same deterministic
  // board/timeline. Replay mode never starts an engine worker; review mode
  // adds the evaluation layer. A public ?game= token opens replay mode for
  // anonymous visitors too.
  const sharedGameTokenRef = useRef(readSharedGameToken());
  const sharedGameLoadedRef = useRef(false);
  const [reviewGame, setReviewGame] = useState(() => (sharedGameTokenRef.current
    ? { game: null, moves: null, analysisEnabled: false, loading: true }
    : null));

  useEffect(() => {
    const token = sharedGameTokenRef.current;
    if (!token || sharedGameLoadedRef.current) return;
    sharedGameLoadedRef.current = true;
    fetchSharedGame(token).then(({ game, error }) => {
      if (!game) {
        setReviewGame({ game: null, moves: [], analysisEnabled: false, loadError: error || 'This shared game is unavailable.' });
        return;
      }
      setReviewGame({
        game: {
          ...game,
          viewerLabel: 'Player',
          headline: `Shared Quantum Chess game · ${game.result || 'finished'}`,
        },
        moves: Array.isArray(game.moves) ? game.moves : [],
        analysisEnabled: false,
        shared: true,
      });
    });
  }, []);

  const handleReplayGame = useCallback(async (game) => {
    if (!auth.user || !game) return false;
    const savedMoves = await fetchGameMoves(auth.user, game.id);
    setReviewGame({ game, moves: savedMoves || [], analysisEnabled: false });
    return true;
  }, [auth.user]);

  // Premium game review adds engine analysis to the same replay surface.
  // Returns whether it opened so the tipper's daily quota is only charged on
  // success.
  const handleReviewGame = useCallback(async (game) => {
    if (!auth.user || !game) return false;
    const savedMoves = await fetchGameMoves(auth.user, game.id);
    setReviewGame({ game, moves: savedMoves || [], analysisEnabled: true });
    trackProductEvent(PRODUCT_EVENT.REVIEW_OPENED, {
      accessType: auth.profile?.tier === 'paid'
        ? 'premium'
        : isTipper(auth.profile)
          ? 'tip'
          : 'standard',
      gameResult: game.result,
      moveCount: Array.isArray(savedMoves) ? savedMoves.length : 0,
    });
    return true;
  }, [auth.user, auth.profile]);

  const handleShareGame = useCallback(async (game) => {
    if (!auth.user || !game) return { error: 'Sign in to share a game.' };
    const { token, error } = await shareSavedGame(auth.user, game.id);
    if (!token) return { error: error || 'Could not create a share link.' };
    const link = buildSharedGameLink(token);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Quantum Chess game replay', url: link });
        return { link, shared: true };
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        return { link, copied: true };
      }
    } catch (shareError) {
      if (shareError && shareError.name === 'AbortError') return { cancelled: true, link };
    }
    window.prompt('Copy this game replay link:', link);
    return { link, copied: true };
  }, [auth.user]);

  return {
    accountOpen,
    setAccountOpen,
    accountUpsellSource,
    pricingOpen,
    setPricingOpen,
    billingReturn,
    setBillingReturn,
    isPaidUser,
    handleRequirePremium,
    reviewGame,
    setReviewGame,
    handleReplayGame,
    handleReviewGame,
    handleShareGame,
  };
}
