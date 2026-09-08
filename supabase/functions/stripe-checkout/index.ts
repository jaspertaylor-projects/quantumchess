// One permanent Premium purchase per account. No subscription or tip checkout.
import { safeReturnOrigin } from '../_shared/cors.ts';
import { adminClient, getCallerUser, servePost, stripeClient } from '../_shared/edge.ts';
import { PREMIUM_AMOUNT, PREMIUM_CURRENCY, premiumCheckoutParameters, premiumGrantForSession } from '../_shared/premiumBilling.ts';
const stripe = stripeClient();

servePost(async (req, json) => {
  try {
    const user = await getCallerUser(req);
    if (!user) return json({ error: 'Not signed in' }, 401);
    const body = await req.json().catch(() => ({}));
    if (body?.kind !== 'lifetime') {
      return json({ error: 'This offer has ended. Reload the page for Premium at $10 once.' }, 400);
    }
    const admin = adminClient();
    const { data: profile, error: profileError } = await admin.from('qc_profiles')
      .select('tier, stripe_customer_id').eq('id', user.id).single();
    if (profileError || !profile) throw new Error('Account lookup failed');
    if (profile.tier === 'paid') return json({ error: 'Premium is already unlocked. No further payment is needed.' }, 409);

    const priceId = Deno.env.get('STRIPE_LIFETIME_PRICE_ID');
    if (!priceId) throw new Error('Premium price is not configured');
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.recurring || price.unit_amount !== PREMIUM_AMOUNT || price.currency !== PREMIUM_CURRENCY) {
      throw new Error('Premium must use the active $10 one-time USD price');
    }
    let customerId = profile.stripe_customer_id;
    if (customerId) {
      // Only recreate explicitly missing/deleted customers, never on a network error.
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) customerId = null;
      } catch (err) {
        if ((err as { code?: string }).code !== 'resource_missing') throw err;
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined, metadata: { qc_user_id: user.id },
      }, { idempotencyKey: `qc-customer-${user.id}` });
      customerId = customer.id;
      const { error } = await admin.from('qc_profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
      if (error) throw error;
    }
    // Recover a paid checkout whose webhook has not arrived yet, instead of
    // offering another payment after its original session has expired.
    const completed = await stripe.checkout.sessions.list({ customer: customerId, status: 'complete', limit: 100 });
    for (const prior of completed.data) {
      if (prior.client_reference_id !== user.id) continue;
      const grant = premiumGrantForSession(prior);
      if (!grant) continue;
      const { error } = await admin.rpc('qc_grant_permanent_premium', {
        p_event_id: `checkout-reconciled:${prior.id}`, p_event_type: 'checkout.reconciled',
        p_user_id: grant.userId, p_customer_id: grant.customerId,
      });
      if (error) throw error;
      return json({ error: 'Premium is already unlocked. Refresh your account; no further payment is needed.' }, 409);
    }
    const { data: attempt, error: reserveError } = await admin.rpc('qc_reserve_premium_checkout', { p_user_id: user.id });
    if (reserveError) throw reserveError;
    const session = await stripe.checkout.sessions.create(
      premiumCheckoutParameters(priceId, customerId, user.id, safeReturnOrigin(req), attempt.expires_at),
      { idempotencyKey: `qc-premium-${attempt.key}` },
    );
    if (session.status === 'complete') return json({ error: 'Your payment is being confirmed. Please refresh your account shortly.' }, 409);
    return json({ url: session.url });
  } catch (err) {
    console.error('stripe-checkout error:', err);
    return json({ error: 'Could not start checkout. Please try again.' }, 500);
  }
});
