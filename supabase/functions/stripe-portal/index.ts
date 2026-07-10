// stripe-portal: creates a Stripe Customer Portal session so a premium user
// can manage/cancel their subscription. Returns { url }.
// Secrets: STRIPE_SECRET_KEY.

import { safeReturnOrigin } from '../_shared/cors.ts';
import { adminClient, getCallerUser, servePost, stripeClient } from '../_shared/edge.ts';

const stripe = stripeClient();

servePost(async (req, json) => {
  try {
    const user = await getCallerUser(req);
    if (!user) return json({ error: 'Not signed in' }, 401);

    const admin = adminClient();
    const { data: profile } = await admin
      .from('qc_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.stripe_customer_id) return json({ error: 'No subscription found' }, 400);

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: safeReturnOrigin(req),
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('stripe-portal error:', err);
    return json({ error: 'Could not open the billing portal' }, 500);
  }
});
