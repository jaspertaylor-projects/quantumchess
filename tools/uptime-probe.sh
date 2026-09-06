#!/usr/bin/env bash
# Retry the entire check, including HTTP errors and unexpected page content.
# curl's default retries exclude 404s. Read the completed response from a file
# so an early-exiting grep cannot break curl's output pipe.
set -euo pipefail

label="${1:?Provide a probe label}"
url="${2:?Provide a URL}"
expected="${3:-}"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT

for attempt in 1 2 3; do
  if status=$(curl --fail --silent --show-error --connect-timeout 5 \
      --max-time 20 --output "$body" --write-out '%{http_code}' "$url") \
      && { [[ -z "$expected" ]] || grep -qi -- "$expected" "$body"; }; then
    echo "$label healthy (HTTP $status, attempt $attempt/3)."
    exit 0
  fi
  echo "$label check failed (HTTP ${status:-000}, attempt $attempt/3): $url" >&2
  if [[ "$attempt" -lt 3 ]]; then sleep 10; fi
done

echo "::error::$label failed three consecutive checks: $url"
exit 1
