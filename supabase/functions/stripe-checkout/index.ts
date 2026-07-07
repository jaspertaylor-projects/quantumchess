// stripe-checkout: creates a Stripe Checkout session for the signed-in user
// and returns { url } for the browser to redirect to. Two kinds:
//   (default)          subscription mode, STRIPE_PRICE_ID   ($3/mo premium)
//   body {kind:'tip'}  payment mode,      STRIPE_TIP_PRICE_ID ($5 once —
//                      the webhook grants a year of ad_free_until)
// Invoked from the frontend via supabase.functions.invoke('stripe-checkout').
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_TIP_PRICE_ID.

import Stripe from 'npm:stripe@18';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, safeReturnOrigin } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  try {
    // Identify the caller from their JWT (forwarded by functions.invoke).
    const authed = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: 'Not signed in' }, 401);

    let kind = 'premium';
    try {
      const body = await req.json();
      if (body && body.kind === 'tip') kind = 'tip';
    } catch (_) {
      // no body -> premium
    }

    // Profile reads/writes (stripe_customer_id is not client-writable).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: profile } = await admin
      .from('qc_profiles')
      .select('tier, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    // Premium already includes everything a tip grants, but a premium user
    // who wants to tip anyway is welcome to.
    if (kind === 'premium' && profile?.tier === 'paid') return json({ error: 'Already premium' }, 400);

    let customerId = profile?.stripe_customer_id ?? null;
    // A stored id can go stale (deleted in the dashboard, or minted in
    // test mode before the live switch) — verify it, else mint fresh.
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as { deleted?: boolean }).deleted) customerId = null;
      } catch (_) {
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { qc_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('qc_profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const origin = safeReturnOrigin(req);
    const session = await stripe.checkout.sessions.create(
      kind === 'tip'
        ? {
            mode: 'payment',
            customer: customerId,
            line_items: [{ price: Deno.env.get('STRIPE_TIP_PRICE_ID')!, quantity: 1 }],
            client_reference_id: user.id,
            metadata: { qc_user_id: user.id, qc_kind: 'tip' },
            success_url: `${origin}/?premium=tip_thanks`,
            cancel_url: `${origin}/?premium=cancelled`,
          }
        : {
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
            client_reference_id: user.id,
            subscription_data: { metadata: { qc_user_id: user.id } },
            allow_promotion_codes: true,
            success_url: `${origin}/?premium=success`,
            cancel_url: `${origin}/?premium=cancelled`,
          },
    );

    return json({ url: session.url });
  } catch (err) {
    console.error('stripe-checkout error:', err);
    return json({ error: 'Could not start checkout' }, 500);
  }
});
