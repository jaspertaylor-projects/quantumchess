// stripe-portal: creates a Stripe Customer Portal session so a premium user
// can manage/cancel their subscription. Returns { url }.
// Secrets: STRIPE_SECRET_KEY.

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
    const authed = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: 'Not signed in' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
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
