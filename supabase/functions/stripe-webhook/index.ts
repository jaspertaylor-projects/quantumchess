// Signed Stripe payments grant permanent Premium. Fulfillment and event
// deduplication commit atomically; subscription events cannot revoke access.
import Stripe from 'npm:stripe@18';
import { adminClient, stripeClient } from '../_shared/edge.ts';
import { premiumGrantForSession } from '../_shared/premiumBilling.ts';
const stripe = stripeClient();
const admin = adminClient();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  } catch (_) {
    return new Response('Invalid signature', { status: 400 });
  }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const grant = premiumGrantForSession(event.data.object as Stripe.Checkout.Session);
      if (grant) {
        const { error } = await admin.rpc('qc_grant_permanent_premium', {
          p_event_id: event.id, p_event_type: event.type,
          p_user_id: grant.userId, p_customer_id: grant.customerId,
        });
        if (error) throw error;
      }
    }
    // Legacy subscription updates/deletions are intentionally ignored:
    // cancellation must never undo a permanent unlock.
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error(`Fulfillment failed for ${event.id}:`, err);
    return new Response('Fulfillment failed', { status: 500 });
  }
});
