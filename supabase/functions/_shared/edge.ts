// Shared plumbing for the Stripe Edge Functions: Stripe client, the admin
// (service-role) Supabase client, the caller-identity lookup, and the
// browser-invoked POST wrapper (CORS preflight + method guard + cors-aware
// json responder). checkout and portal were ~80% this boilerplate, pasted.

import Stripe from 'npm:stripe@18';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

export function stripeClient(): Stripe {
  return new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

// Profile reads/writes bypassing RLS (e.g. stripe_customer_id is not
// client-writable).
export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// Identify the caller from their JWT (forwarded by functions.invoke).
// Returns null when not signed in.
export async function getCallerUser(req: Request) {
  const authed = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await authed.auth.getUser();
  return user;
}

export type JsonResponder = (body: unknown, status?: number) => Response;

// Serve a browser-invoked POST endpoint: answers the CORS preflight, rejects
// other methods, and hands the handler a cors-aware json() responder.
export function servePost(handler: (req: Request, json: JsonResponder) => Promise<Response>) {
  Deno.serve(async (req) => {
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const json: JsonResponder = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    return handler(req, json);
  });
}
