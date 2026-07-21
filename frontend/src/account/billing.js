// frontend/src/account/billing.js
// Purpose: Client side of the Stripe wiring — start a Checkout session,
// open the Customer Portal, and describe the premium offer in one place.
// Imports From: ./supabaseClient.js
// Exported To: ./AccountModal.jsx, ../App.jsx

import { supabase } from './supabaseClient.js';

export const PREMIUM_PRICE_LABEL = '$3/month';
export const TIP_PRICE_LABEL = '$5';
export const PREMIUM_PRICE_VALUE = 3;
export const TIP_PRICE_VALUE = 5;

// The pitch leads with the human: supporters pay because of the first
// sentence, feature-shoppers pay because of the list under it — and the
// free game never feels crippled.
export const PREMIUM_PITCH =
  'Quantum Chess is built and run by one person — the engine, the bots, the art, all of it. ' +
  '$3/month keeps the servers on and the ads off, and gets you:';

export const TIP_PITCH =
  'Not a subscription person? Tip $5 for three months with no ads, plus 5 engine game reviews a day.';

export const PREMIUM_FEATURES = [
  'No ads',
  'Unlimited game reviews with engine moves',
  'Up to 1,000 saved games',
  'Premium bots to battle',
  'Custom profile pic & tagline',
  'The full character roster — 32 more taglines & sayings',
];

// Ads are off for premium subscribers and for anyone inside a tipped
// ad-free window (ad_free_until is written only by the Stripe webhook).
export function isAdFree(profile) {
  if (!profile) return false;
  if (profile.tier === 'paid') return true;
  if (!profile.ad_free_until) return false;
  const until = new Date(profile.ad_free_until).getTime();
  return Number.isFinite(until) && until > Date.now();
}

// A tipper: inside a tipped ad-free window, but not a subscriber.
export function isTipper(profile) {
  return isAdFree(profile) && !(profile && profile.tier === 'paid');
}

export const FREE_REVIEW_CAP = 3;
export const TIP_REVIEW_CAP = 5;

function localDayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function reviewCountKey(userId, day = localDayStamp()) {
  return `qcReviewCount:${userId || 'anon'}:${day}`;
}

// The review ladder is intentionally monotonic: watching ads never gives a
// free account a higher ceiling than a tipper, and Premium has no ceiling.
export function reviewCapFor(profile) {
  if (profile && profile.tier === 'paid') return Infinity;
  return isTipper(profile) ? TIP_REVIEW_CAP : FREE_REVIEW_CAP;
}

export function reviewsUsedToday(userId) {
  try {
    const value = Number.parseInt(localStorage.getItem(reviewCountKey(userId)) || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (_) {
    return 0;
  }
}

export function reviewsRemaining(profile, userId) {
  const cap = reviewCapFor(profile);
  return Number.isFinite(cap) ? Math.max(0, cap - reviewsUsedToday(userId)) : Infinity;
}

export function markReviewUsed(userId) {
  try {
    const next = reviewsUsedToday(userId) + 1;
    localStorage.setItem(reviewCountKey(userId), String(next));
    return next;
  } catch (_) {
    // Storage unavailable: keep the review usable rather than failing after
    // a completed rewarded ad or paid entitlement.
    return 0;
  }
}

// All helpers resolve to { url } on success or { error } on failure; the
// caller redirects. supabase.functions.invoke forwards the user's JWT.
async function invokeForUrl(fn, body = undefined) {
  if (!supabase) return { error: 'Accounts are not configured.' };
  try {
    const { data, error } = await supabase.functions.invoke(fn, body ? { body } : undefined);
    if (error) return { error: error.message || 'Request failed.' };
    if (!data || !data.url) return { error: (data && data.error) || 'Request failed.' };
    return { url: data.url };
  } catch (_) {
    return { error: 'Could not reach the billing service.' };
  }
}

export function startCheckout() {
  return invokeForUrl('stripe-checkout');
}

// One-time $5 tip -> three months of no ads (stacks if tipped again).
export function startTipCheckout() {
  return invokeForUrl('stripe-checkout', { kind: 'tip' });
}

export function openBillingPortal() {
  return invokeForUrl('stripe-portal');
}

// Reads and clears the ?premium= marker that Stripe redirects back with.
// Returns 'success' | 'tip_thanks' | 'cancelled' | null.
export function consumeCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('premium');
  if (status !== 'success' && status !== 'cancelled' && status !== 'tip_thanks') return null;
  params.delete('premium');
  const rest = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  return status;
}
