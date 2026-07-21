// stripe-webhook: receives Stripe events and flips qc_profiles.tier.
//   checkout.session.completed (subscription) -> tier = 'paid' (+ stripe ids)
//   checkout.session.completed (payment/tip)  -> ad_free_until += 90 days
//   customer.subscription.updated             -> follow subscription status
//   customer.subscription.deleted             -> tier = 'free'
// Deployed with verify_jwt = false (Stripe authenticates via signature).
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Idempotent: event ids are recorded in qc_stripe_events; retries are skipped.

import Stripe from 'npm:stripe@18'; // type-only (Stripe.Event)
import { adminClient, stripeClient } from '../_shared/edge.ts';

const stripe = stripeClient();
const admin = adminClient();

// Statuses that keep premium on. past_due keeps access during Stripe's dunning
// retries; if all retries fail the subscription is deleted and we downgrade.
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

async function setTierByCustomer(customerId: string, tier: 'paid' | 'free', subscriptionId: string | null) {
  const { error } = await admin
    .from('qc_profiles')
    .update({ tier, stripe_subscription_id: subscriptionId })
    .eq('stripe_customer_id', customerId);
  if (error) throw new Error(`profile update failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    console.error('signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  // De-dupe: Stripe retries until it gets a 2xx, and may deliver twice.
  const { error: dupeError } = await admin
    .from('qc_stripe_events')
    .insert({ id: event.id, type: event.type });
  if (dupeError) {
    if (dupeError.code === '23505') return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
    console.error('event log insert failed:', dupeError);
    return new Response('Event log failure', { status: 500 }); // 5xx -> Stripe retries
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

        // One-time tip: 90 ad-free days, stacking on any time already
        // banked (repeat tips extend rather than overwrite).
        if (session.mode === 'payment') {
          if (userId) {
            const { data: profile, error: readError } = await admin
              .from('qc_profiles')
              .select('ad_free_until')
              .eq('id', userId)
              .maybeSingle();
            if (readError) throw new Error(`profile read failed: ${readError.message}`);
            const now = Date.now();
            const current = profile?.ad_free_until ? new Date(profile.ad_free_until).getTime() : 0;
            const base = Math.max(now, current);
            const until = new Date(base + 90 * 24 * 60 * 60 * 1000).toISOString();
            const patch: Record<string, string> = { ad_free_until: until };
            if (customerId) patch.stripe_customer_id = customerId;
            const { error } = await admin
              .from('qc_profiles')
              .update(patch)
              .eq('id', userId);
            if (error) throw new Error(`profile update failed: ${error.message}`);
          }
          break;
        }

        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (userId && customerId) {
          const { error } = await admin
            .from('qc_profiles')
            .update({ tier: 'paid', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId ?? null })
            .eq('id', userId);
          if (error) throw new Error(`profile update failed: ${error.message}`);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const active = ACTIVE_STATUSES.has(sub.status);
        await setTierByCustomer(customerId, active ? 'paid' : 'free', active ? sub.id : null);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        await setTierByCustomer(customerId, 'free', null);
        break;
      }
      default:
        // Unhandled event types are fine — we only subscribe to the above.
        break;
    }
  } catch (err) {
    console.error(`handler failed for ${event.type} (${event.id}):`, err);
    // Remove the event log entry so Stripe's retry isn't skipped as a dupe.
    await admin.from('qc_stripe_events').delete().eq('id', event.id);
    return new Response('Handler failure', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
