// frontend/src/hooks/usePlayerBars.js
// Purpose: Player identity for the two bars — names, ratings, avatars,
// taglines, captured-piece bins — and the prop bundles PlayerBar consumes.
// The human is "Anonymous" (or their account identity); a bot shows its
// name/rating/avatar; the second local player is "Stranger"; online games
// keep the classic White/Black labels. Extracted from App.jsx.
// Imports From: ../ai/bots.js, ../chessboard/boardUtils.js
// Exported To: ../App.jsx

import { useMemo } from 'react';
import { botInitials, getBotAvatarUrl } from '../ai/bots.js';
import { capturedPieces } from '../chessboard/boardUtils.js';

const ANONYMOUS_AVATAR = {
  initials: 'A',
  hue: 145,
  imageUrl: '/bots/anonymous.png',
  name: 'Anonymous',
  tagline: 'Unobserved, unrated, undeterred.',
};
const STRANGER_AVATAR = { initials: 'S', hue: 320, imageUrl: '/bots/stranger.png', name: 'Stranger', tagline: 'Wandered in from a parallel branch.' };

export default function usePlayerBars({ auth, aiBot, userTeam, isOnlineBars, pieces, onSignUpClick }) {
  const botSide = aiBot ? (userTeam === 'white' ? 'black' : 'white') : null;
  const botAvatar = aiBot
    ? { initials: botInitials(aiBot), hue: aiBot.hue ?? 200, imageUrl: getBotAvatarUrl(aiBot), name: aiBot.name, tagline: aiBot.tagline || '' }
    : null;

  // Signed-in players appear under their unique account username and rating.
  const selfName = (auth.profile && auth.profile.username) || 'Anonymous';
  const selfRating = auth.profile && Number.isFinite(auth.profile.rating) ? auth.profile.rating : '????';
  // Premium accounts get their uploaded avatar and tagline on their own bar;
  // other signed-in players get username initials over the anonymous art.
  // Signed-out players wear the Anonymous character's tagline.
  const selfTagline = (auth.profile && auth.profile.tagline) || (auth.profile ? '' : ANONYMOUS_AVATAR.tagline);
  const selfAvatar = auth.profile
    ? {
        initials: (selfName[0] || 'A').toUpperCase(),
        hue: 145,
        imageUrl: auth.profile.avatar_url || '/bots/anonymous.png',
        name: selfName,
        tagline: selfTagline,
      }
    : ANONYMOUS_AVATAR;

  const nameFor = (side) => {
    if (botSide === side) return aiBot.name;
    if (isOnlineBars) return side === 'white' ? 'White' : 'Black';
    return side === userTeam ? selfName : 'Stranger';
  };
  const avatarFor = (side) => {
    if (botSide === side) return botAvatar;
    if (isOnlineBars) return null;
    return side === userTeam ? selfAvatar : STRANGER_AVATAR;
  };
  const ratingFor = (side) => {
    if (botSide === side) return aiBot.rating;
    if (!isOnlineBars && side === userTeam) return selfRating;
    return '????';
  };
  const taglineFor = (side) => {
    if (botSide === side) return aiBot.tagline || null;
    if (isOnlineBars) return null;
    return side === userTeam ? (selfTagline || null) : STRANGER_AVATAR.tagline;
  };

  // The bar layout follows the table: your side sits at the bottom, the
  // opponent (bot or otherwise) across from you at the top.
  const topBarSide = userTeam === 'white' ? 'black' : 'white';
  const bottomBarSide = userTeam;

  // Signed-out players' "????" rating doubles as a sign-up call to action.
  const ratingClickFor = (side) =>
    !isOnlineBars && side === userTeam && !auth.user ? onSignUpClick : null;

  const whiteCapturedPawns = useMemo(() => capturedPieces(pieces, 'white', true), [pieces]);
  const whiteCapturedOthers = useMemo(() => capturedPieces(pieces, 'white', false), [pieces]);
  const blackCapturedPawns = useMemo(() => capturedPieces(pieces, 'black', true), [pieces]);
  const blackCapturedOthers = useMemo(() => capturedPieces(pieces, 'black', false), [pieces]);

  // Captured totals per victim side — the sayings hook's capture trigger.
  const capturedCounts = useMemo(() => ({
    white: whiteCapturedPawns.length + whiteCapturedOthers.length,
    black: blackCapturedPawns.length + blackCapturedOthers.length,
  }), [whiteCapturedPawns, whiteCapturedOthers, blackCapturedPawns, blackCapturedOthers]);

  // `ctx` carries the render-time pieces of the bundle: speech bubbles, the
  // intro narration (always the black/top bar — intro seats the user as
  // White), and the display clock.
  const barPropsFor = (side, { speech, introSpeech, effectiveClock }) => (side === 'white' ? {
    side: 'white',
    playerName: nameFor('white'),
    rating: ratingFor('white'),
    onRatingClick: ratingClickFor('white'),
    avatar: avatarFor('white'),
    tagline: taglineFor('white'),
    speech: speech.white,
    clockText: effectiveClock.whiteText,
    clockActive: effectiveClock.whiteActive,
    clockLow: effectiveClock.whiteLow,
    // Your bin holds the opponent pieces YOU captured, so each bar gets the
    // other side's losses (whiteCaptured* = white pieces that were captured).
    capturedPawns: blackCapturedPawns,
    capturedOthers: blackCapturedOthers,
  } : {
    side: 'black',
    playerName: nameFor('black'),
    rating: ratingFor('black'),
    onRatingClick: ratingClickFor('black'),
    avatar: avatarFor('black'),
    tagline: taglineFor('black'),
    speech: introSpeech || speech.black,
    speechFlash: Boolean(introSpeech),
    clockText: effectiveClock.blackText,
    clockActive: effectiveClock.blackActive,
    clockLow: effectiveClock.blackLow,
    capturedPawns: whiteCapturedPawns,
    capturedOthers: whiteCapturedOthers,
  });

  return {
    botSide,
    selfAvatar,
    selfRating,
    strangerAvatar: STRANGER_AVATAR,
    topBarSide,
    bottomBarSide,
    capturedCounts,
    barPropsFor,
  };
}
