// frontend/src/account/billing.js
// Purpose: Client side of the Stripe wiring — start a Checkout session,
// open the Customer Portal, and describe the premium offer in one place.
// Imports From: ./supabaseClient.js
// Exported To: ./AccountModal.jsx, ../App.jsx

import { supabase } from './supabaseClient.js';
import { MATCH_UNLOCK_BOTS, PREMIUM_BOTS } from '../ai/bots.js';

export const PREMIUM_PRICE_LABEL = '$10 once';
export const PREMIUM_PRICE_VALUE = 10;
export const PREMIUM_PITCH =
  'Quantum Chess is built and run by one person. Pay $10 once to unlock every Premium feature on your account. No recurring payments.';
export const PREMIUM_FEATURES = [
  'No ads',
  'Unlimited game reviews with engine moves',
  'Up to 1,000 saved games',
  `All ${PREMIUM_BOTS.length} Premium bots, unlocked immediately`,
  `${MATCH_UNLOCK_BOTS.length} more bots earned through human matches`,
  'All extra avatars, character taglines and sayings',
  'Custom profile picture and tagline',
];
export function isAdFree(profile) {
  return profile?.tier === 'paid';
}
export function botAccountAccess(profile) {
  return profile?.tier === 'paid' ? 'premium' : 'free';
}
export const FREE_REVIEW_CAP = 0;

export function reviewCapFor(profile) {
  return profile?.tier === 'paid' ? Infinity : 0;
}

// All helpers resolve to { url } on success or { error } on failure; the
// caller redirects. supabase.functions.invoke forwards the user's JWT.
async function invokeForUrl(fn, body = undefined) {
  if (!supabase) return { error: 'Accounts are not configured.' };
  try {
    const { data, error } = await supabase.functions.invoke(fn, body ? { body } : undefined);
    if (error) {
      const details = await error.context?.json?.().catch(() => null);
      return { error: details?.error || error.message || 'Request failed.' };
    }
    if (!data || !data.url) return { error: (data && data.error) || 'Request failed.' };
    return { url: data.url };
  } catch (_) {
    return { error: 'Could not reach the billing service.' };
  }
}

export function startCheckout() {
  return invokeForUrl('stripe-checkout', { kind: 'lifetime' });
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
  return status === 'tip_thanks' ? 'success' : status;
}
