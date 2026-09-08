#!/usr/bin/env bash
# The live Stripe account and signed checkout.session.completed webhook are
# already configured. This entry now deploys the one-time offer only.
set -euo pipefail
exec "$(dirname "$0")/deploy-stripe-functions.sh" "$@"
