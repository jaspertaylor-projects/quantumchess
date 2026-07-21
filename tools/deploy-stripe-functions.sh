#!/usr/bin/env bash
# Deploys the Stripe Edge Functions and sets their secrets.
# Prereqs: `supabase login` completed; Stripe CLI authenticated (test mode);
#          ~/.config/quantumchess-stripe-deploy.env with STRIPE_WEBHOOK_SECRET,
#          STRIPE_PRICE_ID ($3/mo subscription, created 2026-07-05) and
#          STRIPE_TIP_PRICE_ID ($5 one-time tip -> three months ad-free; create with
#          `stripe prices create --currency usd --unit-amount 500 -d product=<prod_id>`
#          — NO recurring flags — and add it to the env file).
set -euo pipefail

PROJECT_REF="idulanhleydkejrumpzf"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

source ~/.config/quantumchess-stripe-deploy.env

# The Stripe CLI keeps a 90-day test-mode key in its own config; reuse it so
# the secret key never has to be pasted around.
STRIPE_SECRET_KEY="$(grep -oP "test_mode_api_key = '\K[^']+" ~/.config/stripe/config.toml)"

cd "$REPO_ROOT"

supabase secrets set --project-ref "$PROJECT_REF" \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  STRIPE_PRICE_ID="$STRIPE_PRICE_ID" \
  STRIPE_TIP_PRICE_ID="$STRIPE_TIP_PRICE_ID"

supabase functions deploy stripe-checkout --project-ref "$PROJECT_REF"
supabase functions deploy stripe-portal   --project-ref "$PROJECT_REF"
supabase functions deploy stripe-webhook  --project-ref "$PROJECT_REF" --no-verify-jwt

echo "Done. Webhook endpoint (already registered in Stripe):"
echo "  https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook"
