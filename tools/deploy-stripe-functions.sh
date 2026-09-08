#!/usr/bin/env bash
# Deploy the permanent $10 Premium checkout and webhook. Existing Stripe
# secret/webhook keys are preserved; never replace live keys with test keys.
set -euo pipefail
PROJECT_REF="${QC_SUPABASE_PROJECT_REF:-idulanhleydkejrumpzf}"
: "${STRIPE_LIFETIME_PRICE_ID:?Set STRIPE_LIFETIME_PRICE_ID to the active USD 1000-cent one-time Stripe price}"
cd "$(dirname "$0")/.."
supabase secrets set --project-ref "$PROJECT_REF" STRIPE_LIFETIME_PRICE_ID="$STRIPE_LIFETIME_PRICE_ID"
supabase functions deploy stripe-webhook --project-ref "$PROJECT_REF" --no-verify-jwt
supabase functions deploy stripe-checkout --project-ref "$PROJECT_REF"
