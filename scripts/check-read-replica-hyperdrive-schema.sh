#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

EXPECTED_SCHEMA_CATALOG='read_replicate/schema_replicate.catalog.json'
ACTUAL_SCHEMA_CATALOG="$(mktemp)"
SYNC_RESPONSE="$(mktemp)"
SYNC_MAX_TIME="${READ_REPLICA_SCHEMA_SYNC_MAX_TIME:-1800}"
if [[ -n "${READ_REPLICA_WRANGLER_CMD:-}" ]]; then
  read -r -a WRANGLER_CMD <<< "$READ_REPLICA_WRANGLER_CMD"
else
  WRANGLER_CMD=(bunx wrangler@4.107.0)
fi
if ! [[ "$SYNC_MAX_TIME" =~ ^[0-9]+$ ]] || (( SYNC_MAX_TIME <= 30 )); then
  echo '::error title=Invalid read-replica schema sync timeout::READ_REPLICA_SCHEMA_SYNC_MAX_TIME must be an integer greater than 30 seconds.'
  exit 1
fi
SYNC_MAX_DURATION_MS="$(( (SYNC_MAX_TIME - 15) * 1000 ))"
WORKER_DEPLOYED=0
WORKER_SUFFIX="$(bun --silent -e 'const bytes = crypto.getRandomValues(new Uint8Array(8)); console.log(Buffer.from(bytes).toString("hex"))')"
WORKER_RUN_ID="${GITHUB_RUN_ID:-local}"
WORKER_RUN_ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
WORKER_NAME="$(printf 'capgo-rr-%s-%s-%s' "$WORKER_SUFFIX" "$WORKER_RUN_ID" "$WORKER_RUN_ATTEMPT" | tr '[:upper:]_' '[:lower:]-' | tr -cd 'a-z0-9-' | cut -c1-63)"
export READ_REPLICA_SCHEMA_CHECK_TOKEN="$(bun --silent -e 'const bytes = crypto.getRandomValues(new Uint8Array(32)); console.log(Buffer.from(bytes).toString("hex"))')"

cleanup() {
  local status=$?
  trap - EXIT

  if (( WORKER_DEPLOYED == 1 )); then
    echo "==> Deleting ephemeral Worker ${WORKER_NAME}"
    if ! "${WRANGLER_CMD[@]}" delete "$WORKER_NAME" \
      --config cloudflare_workers/read-replica-schema-check/wrangler.jsonc \
      --force; then
      echo "::error title=Failed to delete read-replica schema checker::Ephemeral Worker ${WORKER_NAME} could not be deleted."
      status=1
    fi
  fi

  rm -f "$ACTUAL_SCHEMA_CATALOG" "$SYNC_RESPONSE"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if [[ ! -f "$EXPECTED_SCHEMA_CATALOG" ]]; then
  echo "::error title=Missing read-replica schema catalog::${EXPECTED_SCHEMA_CATALOG} does not exist."
  exit 1
fi

echo "==> Deploying ephemeral Worker ${WORKER_NAME}"
WORKER_DEPLOYED=1
DEPLOY_OUTPUT="$("${WRANGLER_CMD[@]}" deploy \
  --config cloudflare_workers/read-replica-schema-check/wrangler.jsonc \
  --name "$WORKER_NAME" \
  --minify)"
printf '%s\n' "$DEPLOY_OUTPUT"

bun --silent -e 'process.stdout.write(process.env.READ_REPLICA_SCHEMA_CHECK_TOKEN)' \
  | "${WRANGLER_CMD[@]}" secret put READ_REPLICA_SCHEMA_CHECK_TOKEN \
    --config cloudflare_workers/read-replica-schema-check/wrangler.jsonc \
    --name "$WORKER_NAME"

WORKER_URL="$(bun --silent -e 'const output = await Bun.stdin.text(); console.log(output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0] ?? "")' <<< "$DEPLOY_OUTPUT")"
if [[ -z "$WORKER_URL" ]]; then
  echo '::error title=Missing read-replica schema checker URL::Wrangler deployed the ephemeral Worker but did not return a workers.dev URL.'
  exit 1
fi

for _ in $(seq 1 60); do
  if curl -fsS --connect-timeout 5 --max-time 5 "${WORKER_URL}/ok" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -fsS --connect-timeout 5 --max-time 5 "${WORKER_URL}/ok" >/dev/null 2>&1; then
  echo "::error title=Read-replica schema checker did not become ready::Timed out waiting for ephemeral Worker ${WORKER_NAME}."
  exit 1
fi

SYNC_STATUS="$(curl -sS --connect-timeout 10 --max-time "$SYNC_MAX_TIME" \
  --header "authorization: Bearer ${READ_REPLICA_SCHEMA_CHECK_TOKEN}" \
  --header 'content-type: application/json' \
  --header "x-schema-sync-max-duration-ms: ${SYNC_MAX_DURATION_MS}" \
  --data-binary "@${EXPECTED_SCHEMA_CATALOG}" \
  -w '%{http_code}' \
  -o "$SYNC_RESPONSE" \
  "${WORKER_URL}/sync-additive" || true)"
if [[ "$SYNC_STATUS" != "200" ]]; then
  echo "::error title=Failed to sync additive read-replica schema::Worker /sync-additive returned HTTP ${SYNC_STATUS}."
  cat "$SYNC_RESPONSE"
  exit 1
fi

echo 'Read-replica additive schema sync result:'
cat "$SYNC_RESPONSE"
echo

HTTP_STATUS="$(curl -sS --connect-timeout 5 --max-time 30 --header "authorization: Bearer ${READ_REPLICA_SCHEMA_CHECK_TOKEN}" -w '%{http_code}' -o "$ACTUAL_SCHEMA_CATALOG" "${WORKER_URL}/catalog" || true)"
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "::error title=Failed to fetch read-replica schema catalog::Worker /catalog returned HTTP ${HTTP_STATUS}."
  cat "$ACTUAL_SCHEMA_CATALOG"
  exit 1
fi

bun scripts/compare-read-replica-schema-catalog.ts "$EXPECTED_SCHEMA_CATALOG" "$ACTUAL_SCHEMA_CATALOG"
