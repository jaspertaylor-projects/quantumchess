// Shared CORS handling for browser-invoked functions (checkout, portal).
// The webhook is server-to-server and does not use this.

const ALLOWED_ORIGINS = [
  'https://quantumchess.ninja',
  'https://www.quantumchess.ninja',
  'http://localhost:5173',
  'http://localhost:5175', // docker compose dev mapping (5175 -> 5173)
  'http://localhost:4173',
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Resolve the URL to send the user back to after Stripe. Only ever a known
// origin — never echo an arbitrary value into a redirect.
export function safeReturnOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}
