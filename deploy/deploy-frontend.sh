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
# Hashed assets: cache forever. NO --delete: sessions loaded before a deploy
# still lazy-import the OLD hashed chunks (daily puzzle, review…) — deleting
# them turned every open tab's next click into a silent no-op. Old assets are
# pennies; prune manually once in a while if it bothers you.
aws s3 sync dist "s3://$BUCKET" \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"
# Root files that change but aren't content-hashed must always revalidate.
for f in index.html rules.html strategy.html faq.html about.html privacy.html \
         terms.html ads.txt humans.txt robots.txt sitemap.xml; do
  [ -f "dist/$f" ] && aws s3 cp "dist/$f" "s3://$BUCKET/$f" --cache-control "no-cache"
done

echo "==> Invalidating CloudFront"
# "/*" counts as a single invalidation path and covers every root file above;
# hashed assets are immutable so re-fetching them is a no-op.
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" >/dev/null

echo "==> Done: https://quantumchess.ninja"
