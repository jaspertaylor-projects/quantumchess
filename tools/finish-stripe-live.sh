#!/usr/bin/env bash
# One-time live-mode Stripe setup for Quantum Chess Premium.
# Run this YOURSELF in a terminal — it prompts for your live secret key
# locally (input hidden, never written to disk or shown).
#
# Get the key: https://dashboard.stripe.com → Developers → API keys →
# "Secret key" (sk_live_...) → Reveal. Make sure you're in the LIVE
# Pura Viba LLC account, not the sandbox.
#
# It creates the live product + $3/mo price + webhook endpoint, then stores
# the three values as Supabase Edge Function secrets (requires `supabase`
# CLI login, already done on this machine).
set -euo pipefail

PROJECT_REF="idulanhleydkejrumpzf"
WEBHOOK_URL="https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook"

read -r -s -p "Paste your LIVE Stripe secret key (sk_live_..., input hidden): " SK
echo
case "$SK" in
  sk_live_*|rk_live_*) ;;
  *) echo "That does not look like a live key (expected sk_live_... ). Aborting."; exit 1 ;;
esac

api() { # api <path> <args...>
  local path="$1"; shift
  curl -sS "https://api.stripe.com/v1/${path}" -u "${SK}:" "$@"
}

get() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

echo "Creating product..."
PRODUCT_JSON=$(api products \
  -d "name=Quantum Chess Premium" \
  -d "description=Unlimited saved games, game review with engine moves, premium bots, custom profile pic & tagline, ad-free")
echo "$PRODUCT_JSON" | grep -q '"error"' && { echo "$PRODUCT_JSON" | head -5; exit 1; }
PRODUCT_ID=$(echo "$PRODUCT_JSON" | get "['id']")
echo "  product: $PRODUCT_ID"

echo "Creating \$3/month price..."
PRICE_JSON=$(api prices \
  -d "product=${PRODUCT_ID}" \
  -d "unit_amount=300" \
  -d "currency=usd" \
  -d "recurring[interval]=month" \
  -d "nickname=Premium monthly")
echo "$PRICE_JSON" | grep -q '"error"' && { echo "$PRICE_JSON" | head -5; exit 1; }
PRICE_ID=$(echo "$PRICE_JSON" | get "['id']")
echo "  price: $PRICE_ID"

echo "Creating \$5 one-time tip price (a year ad-free)..."
TIP_JSON=$(api prices \
  -d "product=${PRODUCT_ID}" \
  -d "unit_amount=500" \
  -d "currency=usd" \
  -d "nickname=Ad-free tip (1 year)")
echo "$TIP_JSON" | grep -q '"error"' && { echo "$TIP_JSON" | head -5; exit 1; }
TIP_PRICE_ID=$(echo "$TIP_JSON" | get "['id']")
echo "  tip price: $TIP_PRICE_ID"

echo "Registering webhook endpoint..."
WH_JSON=$(api webhook_endpoints \
  -d "url=${WEBHOOK_URL}" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "description=QuantumChess premium tier webhook (live)")
echo "$WH_JSON" | grep -q '"error"' && { echo "$WH_JSON" | head -5; exit 1; }
WH_ID=$(echo "$WH_JSON" | get "['id']")
WH_SECRET=$(echo "$WH_JSON" | get "['secret']")
echo "  webhook endpoint: $WH_ID -> $WEBHOOK_URL"

echo "Setting Supabase Edge Function secrets (switches checkout to LIVE)..."
supabase secrets set --project-ref "$PROJECT_REF" \
  STRIPE_SECRET_KEY="$SK" \
  STRIPE_WEBHOOK_SECRET="$WH_SECRET" \
  STRIPE_PRICE_ID="$PRICE_ID" \
  STRIPE_TIP_PRICE_ID="$TIP_PRICE_ID"

# Record the non-secret ids for the docs/agent (no keys).
cat > ~/.config/quantumchess-stripe-live.env <<EOF
# Quantum Chess LIVE mode ids (no secrets here). Created $(date -I).
STRIPE_LIVE_PRODUCT_ID=${PRODUCT_ID}
STRIPE_LIVE_PRICE_ID=${PRICE_ID}
STRIPE_LIVE_TIP_PRICE_ID=${TIP_PRICE_ID}
STRIPE_LIVE_WEBHOOK_ENDPOINT_ID=${WH_ID}
EOF
chmod 600 ~/.config/quantumchess-stripe-live.env

echo
echo "DONE. Live ids saved to ~/.config/quantumchess-stripe-live.env"
echo "  product:   $PRODUCT_ID"
echo "  price:     $PRICE_ID"
echo "  tip price: $TIP_PRICE_ID"
echo "  webhook:   $WH_ID"
echo "Checkout is now LIVE mode. Note: payments succeed only after Stripe's"
echo "account review completes."
