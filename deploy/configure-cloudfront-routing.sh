#!/usr/bin/env bash
# Publishes the canonical-host/SPA CloudFront Function and configures real
# 404 responses. Safe to rerun after the initial setup.
set -euo pipefail

DISTRIBUTION_ID="${1:-${QC_CF_DISTRIBUTION_ID:-E3G9M8CYMWWNUF}}"
FUNCTION_NAME="${QC_CF_ROUTING_FUNCTION:-qc-canonical-routing}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTION_CODE="$REPO_ROOT/deploy/cloudfront-viewer-request.js"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if aws cloudfront describe-function --name "$FUNCTION_NAME" --stage DEVELOPMENT >/dev/null 2>&1; then
  FUNCTION_ETAG="$(aws cloudfront describe-function --name "$FUNCTION_NAME" --stage DEVELOPMENT --query ETag --output text)"
  aws cloudfront update-function \
    --name "$FUNCTION_NAME" \
    --if-match "$FUNCTION_ETAG" \
    --function-config 'Comment=Canonical host and explicit Quantum Chess SPA routes,Runtime=cloudfront-js-2.0' \
    --function-code "fileb://$FUNCTION_CODE" >/dev/null
else
  aws cloudfront create-function \
    --name "$FUNCTION_NAME" \
    --function-config 'Comment=Canonical host and explicit Quantum Chess SPA routes,Runtime=cloudfront-js-2.0' \
    --function-code "fileb://$FUNCTION_CODE" >/dev/null
fi

FUNCTION_ETAG="$(aws cloudfront describe-function --name "$FUNCTION_NAME" --stage DEVELOPMENT --query ETag --output text)"
FUNCTION_ARN="$(aws cloudfront publish-function \
  --name "$FUNCTION_NAME" \
  --if-match "$FUNCTION_ETAG" \
  --query FunctionSummary.FunctionMetadata.FunctionARN \
  --output text)"

aws cloudfront get-distribution-config \
  --id "$DISTRIBUTION_ID" \
  --output json >"$TMP_DIR/distribution.json"
DIST_ETAG="$(jq -r '.ETag' "$TMP_DIR/distribution.json")"

jq --arg function_arn "$FUNCTION_ARN" '
  .DistributionConfig
  | .DefaultRootObject = "index.html"
  | .CustomErrorResponses = {
      Quantity: 2,
      Items: [
        {ErrorCode: 403, ResponsePagePath: "/404.html", ResponseCode: "404", ErrorCachingMinTTL: 10},
        {ErrorCode: 404, ResponsePagePath: "/404.html", ResponseCode: "404", ErrorCachingMinTTL: 10}
      ]
    }
  | .DefaultCacheBehavior.FunctionAssociations = (
      ((.DefaultCacheBehavior.FunctionAssociations.Items // [])
      | map(select(.EventType != "viewer-request"))
      | . + [{FunctionARN: $function_arn, EventType: "viewer-request"}]) as $items
      | {Quantity: ($items | length), Items: $items}
    )
' "$TMP_DIR/distribution.json" >"$TMP_DIR/config.json"

aws cloudfront update-distribution \
  --id "$DISTRIBUTION_ID" \
  --if-match "$DIST_ETAG" \
  --distribution-config "file://$TMP_DIR/config.json" >/dev/null

echo "CloudFront routing update submitted for $DISTRIBUTION_ID."
