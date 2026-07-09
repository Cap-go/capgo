#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

EXPECTED_SCHEMA_CATALOG='read_replicate/schema_replicate.catalog.json'
ACTUAL_SCHEMA_CATALOG="$(mktemp)"
SYNC_RESPONSE="$(mktemp)"
WRANGLER_LOG="$(mktemp)"
PORT="${READ_REPLICA_SCHEMA_CHECK_PORT:-8799}"
SYNC_MAX_TIME="${READ_REPLICA_SCHEMA_SYNC_MAX_TIME:-1800}"
if ! [[ "$SYNC_MAX_TIME" =~ ^[0-9]+$ ]] || (( SYNC_MAX_TIME <= 30 )); then
  echo '::error title=Invalid read-replica schema sync timeout::READ_REPLICA_SCHEMA_SYNC_MAX_TIME must be an integer greater than 30 seconds.'
  exit 1
fi
SYNC_MAX_DURATION_MS="$(( (SYNC_MAX_TIME - 15) * 1000 ))"
WORKER_PID=''
SCHEMA_CHECK_TOKEN="$(bun --silent -e 'const bytes = crypto.getRandomValues(new Uint8Array(32)); console.log(Buffer.from(bytes).toString("hex"))')"

cleanup() {
  if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
  fi
  rm -f "$ACTUAL_SCHEMA_CATALOG" "$SYNC_RESPONSE" "$WRANGLER_LOG"
}
trap cleanup EXIT

if [[ ! -f "$EXPECTED_SCHEMA_CATALOG" ]]; then
  echo "::error title=Missing read-replica schema catalog::${EXPECTED_SCHEMA_CATALOG} does not exist."
  exit 1
fi

bunx wrangler dev \
  --remote \
  --config cloudflare_workers/read-replica-schema-check/wrangler.jsonc \
  --env=prod \
  --ip 127.0.0.1 \
  --port "$PORT" \
  --log-level warn \
  --show-interactive-dev-session=false \
  --var "READ_REPLICA_SCHEMA_CHECK_TOKEN:${SCHEMA_CHECK_TOKEN}" \
  > "$WRANGLER_LOG" 2>&1 &
WORKER_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS --connect-timeout 5 --max-time 5 "http://127.0.0.1:${PORT}/ok" >/dev/null 2>&1; then
    break
  fi

  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "::error title=Read-replica schema checker failed to start::wrangler dev exited before the health check passed."
    cat "$WRANGLER_LOG"
    exit 1
  fi

  sleep 2
done

if ! curl -fsS --connect-timeout 5 --max-time 5 "http://127.0.0.1:${PORT}/ok" >/dev/null 2>&1; then
  echo "::error title=Read-replica schema checker did not become ready::Timed out waiting for the Hyperdrive checker worker."
  cat "$WRANGLER_LOG"
  exit 1
fi

SYNC_STATUS="$(curl -sS --connect-timeout 10 --max-time "$SYNC_MAX_TIME" \
  --header "authorization: Bearer ${SCHEMA_CHECK_TOKEN}" \
  --header 'content-type: application/json' \
  --header "x-schema-sync-max-duration-ms: ${SYNC_MAX_DURATION_MS}" \
  --data-binary "@${EXPECTED_SCHEMA_CATALOG}" \
  -w '%{http_code}' \
  -o "$SYNC_RESPONSE" \
  "http://127.0.0.1:${PORT}/sync-additive" || true)"
if [[ "$SYNC_STATUS" != "200" ]]; then
  echo "::error title=Failed to sync additive read-replica schema::Worker /sync-additive returned HTTP ${SYNC_STATUS}."
  cat "$SYNC_RESPONSE"
  cat "$WRANGLER_LOG"
  exit 1
fi

echo 'Read-replica additive schema sync result:'
cat "$SYNC_RESPONSE"
echo

HTTP_STATUS="$(curl -sS --connect-timeout 5 --max-time 30 --header "authorization: Bearer ${SCHEMA_CHECK_TOKEN}" -w '%{http_code}' -o "$ACTUAL_SCHEMA_CATALOG" "http://127.0.0.1:${PORT}/catalog" || true)"
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "::error title=Failed to fetch read-replica schema catalog::Worker /catalog returned HTTP ${HTTP_STATUS}."
  cat "$ACTUAL_SCHEMA_CATALOG"
  cat "$WRANGLER_LOG"
  exit 1
fi

bun scripts/compare-read-replica-schema-catalog.ts "$EXPECTED_SCHEMA_CATALOG" "$ACTUAL_SCHEMA_CATALOG"
