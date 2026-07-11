#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SYNC_RESPONSE="$(mktemp)"
SYNC_ERROR="$(mktemp)"
READINESS_RESPONSE="$(mktemp)"
READINESS_ERROR="$(mktemp)"
READINESS_ATTEMPT_RESPONSE="$(mktemp)"
READINESS_ATTEMPT_ERROR="$(mktemp)"
SECRETS_FILE="$(mktemp)"
SYNC_SOURCE="${READ_REPLICA_SCHEMA_SYNC_SOURCE:-master}"
SYNC_MAX_TIME="${READ_REPLICA_SCHEMA_SYNC_MAX_TIME:-600}"
CHECK_MAX_TIME="${READ_REPLICA_SCHEMA_CHECK_MAX_TIME:-750}"
READINESS_ATTEMPTS="${READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS:-20}"
CHECK_CLEANUP_RESERVE_SECONDS=15
SECONDS=0

if [[ -n "${READ_REPLICA_WRANGLER_CMD:-}" ]]; then
  read -r -a WRANGLER_CMD <<< "$READ_REPLICA_WRANGLER_CMD"
else
  WRANGLER_CMD=(bunx wrangler@4.107.0)
fi

case "$SYNC_SOURCE" in
  catalog)
    READINESS_PATH='catalog'
    SYNC_PATH='sync-from-catalog'
    SUCCESS_MESSAGE='Read replica preflight matches the committed selected-table catalog.'
    ;;
  master)
    READINESS_PATH='source-catalog'
    SYNC_PATH='sync-from-master'
    SUCCESS_MESSAGE='Read replica matches the live primary schema for the selected tables.'
    ;;
  *)
    echo '::error title=Invalid read-replica schema sync source::READ_REPLICA_SCHEMA_SYNC_SOURCE must be catalog or master.'
    exit 1
    ;;
esac

if ! [[ "$SYNC_MAX_TIME" =~ ^[0-9]+$ ]] || (( SYNC_MAX_TIME <= 30 )); then
  echo '::error title=Invalid read-replica schema sync timeout::READ_REPLICA_SCHEMA_SYNC_MAX_TIME must be an integer greater than 30 seconds.'
  exit 1
fi
if ! [[ "$CHECK_MAX_TIME" =~ ^[0-9]+$ ]] || (( CHECK_MAX_TIME <= 45 )); then
  echo '::error title=Invalid read-replica checker timeout::READ_REPLICA_SCHEMA_CHECK_MAX_TIME must be an integer greater than 45 seconds.'
  exit 1
fi
if ! [[ "$READINESS_ATTEMPTS" =~ ^[0-9]+$ ]] || (( READINESS_ATTEMPTS <= 0 )); then
  echo '::error title=Invalid read-replica checker readiness attempts::READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS must be a positive integer.'
  exit 1
fi

remaining_check_time() {
  printf '%s' "$(( CHECK_MAX_TIME - SECONDS ))"
}

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

  rm -f "$SYNC_RESPONSE" "$SYNC_ERROR" "$READINESS_RESPONSE" \
    "$READINESS_ERROR" "$READINESS_ATTEMPT_RESPONSE" \
    "$READINESS_ATTEMPT_ERROR" "$SECRETS_FILE"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

bun --silent -e 'process.stdout.write(JSON.stringify({ READ_REPLICA_SCHEMA_CHECK_TOKEN: process.env.READ_REPLICA_SCHEMA_CHECK_TOKEN }))' > "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"

if (( $(remaining_check_time) <= CHECK_CLEANUP_RESERVE_SECONDS )); then
  echo '::error title=Read-replica checker timed out before deployment::No time remains to deploy and clean up the ephemeral Worker.'
  exit 1
fi

echo "==> Deploying ephemeral Worker ${WORKER_NAME}"
WORKER_DEPLOYED=1
DEPLOY_OUTPUT="$("${WRANGLER_CMD[@]}" deploy \
  --config cloudflare_workers/read-replica-schema-check/wrangler.jsonc \
  --name "$WORKER_NAME" \
  --secrets-file "$SECRETS_FILE" \
  --minify)"
printf '%s\n' "$DEPLOY_OUTPUT"

WORKER_URL="$(bun --silent -e 'const output = await Bun.stdin.text(); console.log(output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0] ?? "")' <<< "$DEPLOY_OUTPUT")"
if [[ -z "$WORKER_URL" ]]; then
  echo '::error title=Missing read-replica schema checker URL::Wrangler deployed the ephemeral Worker but did not return a workers.dev URL.'
  exit 1
fi

WORKER_READY=0
LAST_READY_STATUS=''
ATTEMPTS_USED=0
for attempt in $(seq 1 "$READINESS_ATTEMPTS"); do
  ATTEMPTS_USED="$attempt"
  REMAINING_TIME="$(remaining_check_time)"
  if (( REMAINING_TIME <= CHECK_CLEANUP_RESERVE_SECONDS )); then
    break
  fi

  ATTEMPT_MAX_TIME=10
  if (( ATTEMPT_MAX_TIME > REMAINING_TIME - CHECK_CLEANUP_RESERVE_SECONDS )); then
    ATTEMPT_MAX_TIME="$(( REMAINING_TIME - CHECK_CLEANUP_RESERVE_SECONDS ))"
  fi
  if (( ATTEMPT_MAX_TIME <= 0 )); then
    break
  fi

  : > "$READINESS_ATTEMPT_RESPONSE"
  : > "$READINESS_ATTEMPT_ERROR"
  LAST_READY_STATUS="$(curl -sS --connect-timeout 5 --max-time "$ATTEMPT_MAX_TIME" \
    --header "authorization: Bearer ${READ_REPLICA_SCHEMA_CHECK_TOKEN}" \
    -w '%{http_code}' \
    -o "$READINESS_ATTEMPT_RESPONSE" \
    "${WORKER_URL}/${READINESS_PATH}" 2>"$READINESS_ATTEMPT_ERROR" || true)"
  if [[ -s "$READINESS_ATTEMPT_RESPONSE" ]]; then
    cp "$READINESS_ATTEMPT_RESPONSE" "$READINESS_RESPONSE"
  fi
  if [[ -s "$READINESS_ATTEMPT_ERROR" ]]; then
    cp "$READINESS_ATTEMPT_ERROR" "$READINESS_ERROR"
  fi
  if [[ "$LAST_READY_STATUS" == '200' ]]; then
    WORKER_READY=1
    break
  fi
  if (( attempt < READINESS_ATTEMPTS )) && (( $(remaining_check_time) > CHECK_CLEANUP_RESERVE_SECONDS + 2 )); then
    sleep 2
  fi
done

if (( WORKER_READY == 0 )); then
  echo "::error title=Read-replica schema checker did not become ready::Worker /${READINESS_PATH} did not return HTTP 200 after ${ATTEMPTS_USED} attempts; last HTTP status was ${LAST_READY_STATUS:-curl_failed}."
  if [[ -s "$READINESS_ERROR" ]]; then
    echo 'Last curl error:'
    head -c 16384 "$READINESS_ERROR"
    echo
  fi
  if [[ -s "$READINESS_RESPONSE" ]]; then
    echo 'Last Worker response:'
    head -c 16384 "$READINESS_RESPONSE"
    echo
  fi
  exit 1
fi

REMAINING_TIME="$(remaining_check_time)"
SYNC_CURL_MAX_TIME="$SYNC_MAX_TIME"
MAX_SYNC_TIME_FROM_BUDGET="$(( REMAINING_TIME - CHECK_CLEANUP_RESERVE_SECONDS ))"
if (( MAX_SYNC_TIME_FROM_BUDGET <= 30 )); then
  echo '::error title=Read-replica checker timed out before schema sync::No time remains for a schema sync and Worker cleanup.'
  exit 1
fi
if (( SYNC_CURL_MAX_TIME > MAX_SYNC_TIME_FROM_BUDGET )); then
  SYNC_CURL_MAX_TIME="$MAX_SYNC_TIME_FROM_BUDGET"
fi
SYNC_MAX_DURATION_MS="$(( (SYNC_CURL_MAX_TIME - CHECK_CLEANUP_RESERVE_SECONDS) * 1000 ))"

: > "$SYNC_RESPONSE"
: > "$SYNC_ERROR"
SYNC_STATUS="$(curl -sS --connect-timeout 10 --max-time "$SYNC_CURL_MAX_TIME" \
  --request POST \
  --header "authorization: Bearer ${READ_REPLICA_SCHEMA_CHECK_TOKEN}" \
  --header "x-schema-sync-max-duration-ms: ${SYNC_MAX_DURATION_MS}" \
  -w '%{http_code}' \
  -o "$SYNC_RESPONSE" \
  "${WORKER_URL}/${SYNC_PATH}" 2>"$SYNC_ERROR" || true)"
if [[ "$SYNC_STATUS" != '200' ]]; then
  echo "::error title=Failed to converge the read-replica schema::Worker /${SYNC_PATH} returned HTTP ${SYNC_STATUS:-curl_failed}."
  if [[ -s "$SYNC_ERROR" ]]; then
    echo 'Last curl error:'
    head -c 16384 "$SYNC_ERROR"
    echo
  fi
  if [[ -s "$SYNC_RESPONSE" ]]; then
    echo 'Worker response:'
    cat "$SYNC_RESPONSE"
    echo
  fi
  exit 1
fi

echo 'Read-replica schema sync result:'
cat "$SYNC_RESPONSE"
echo
printf '%s\n' "$SUCCESS_MESSAGE"
