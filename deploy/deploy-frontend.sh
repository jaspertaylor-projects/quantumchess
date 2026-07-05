#!/usr/bin/env bash
# Build the frontend and publish it to S3 + CloudFront.
# Prereqs: aws CLI configured; bucket + distribution already exist
# (see deploy/README.md). Run from the repo root:
#   ./deploy/deploy-frontend.sh
set -euo pipefail

BUCKET="${QC_S3_BUCKET:-quantumchess-ninja-site}"
DISTRIBUTION_ID="${QC_CF_DISTRIBUTION_ID:?Set QC_CF_DISTRIBUTION_ID to your CloudFront distribution id}"

echo "==> Building frontend"
cd "$(dirname "$0")/.."
if command -v pnpm >/dev/null 2>&1; then
  (cd frontend && pnpm install --frozen-lockfile && pnpm exec vite build)
else
  # No Node on the host: build inside the dev container (frontend/ is
  # bind-mounted, so dist/ appears on the host).
  docker compose exec -T frontend sh -c "cd /app && npx vite build"
fi
cd frontend

echo "==> Syncing to s3://$BUCKET"
# Hashed assets: cache forever.
aws s3 sync dist "s3://$BUCKET" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"
# Root files that change but aren't content-hashed must always revalidate.
for f in index.html ads.txt privacy.html about.html humans.txt; do
  [ -f "dist/$f" ] && aws s3 cp "dist/$f" "s3://$BUCKET/$f" --cache-control "no-cache"
done

echo "==> Invalidating CloudFront"
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/" "/index.html" "/ads.txt" "/privacy.html" "/about.html" "/humans.txt" >/dev/null

echo "==> Done: https://quantumchess.ninja"
