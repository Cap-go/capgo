#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

READY_RESPONSE="$(mktemp)"
READY_ERROR="$(mktemp)"
READY_ATTEMPT_RESPONSE="$(mktemp)"
READY_ATTEMPT_ERROR="$(mktemp)"
VERIFY_RESPONSE="$(mktemp)"
VERIFY_ERROR="$(mktemp)"
VERIFY_ATTEMPT_RESPONSE="$(mktemp)"
VERIFY_ATTEMPT_ERROR="$(mktemp)"
SECRETS_FILE="$(mktemp)"
CHECK_MAX_TIME="${READ_REPLICA_SCHEMA_CHECK_MAX_TIME:-300}"
READY_ATTEMPTS="${READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS:-20}"
VERIFY_ATTEMPTS="${READ_REPLICA_SCHEMA_CHECK_VERIFY_ATTEMPTS:-1}"
CHECK_CLEANUP_RESERVE_SECONDS=15
READY_ATTEMPT_MAX_TIME=10
VERIFY_ATTEMPT_MAX_TIME=55
SECONDS=0

if [[ -n "${READ_REPLICA_WRANGLER_CMD:-}" ]]; then
  read -r -a WRANGLER_CMD <<< "$READ_REPLICA_WRANGLER_CMD"
else
  WRANGLER_CMD=(bunx wrangler@4.107.0)
fi

if ! [[ "$CHECK_MAX_TIME" =~ ^[0-9]+$ ]] || (( CHECK_MAX_TIME <= 45 )); then
  echo '::error title=Invalid read-replica checker timeout::READ_REPLICA_SCHEMA_CHECK_MAX_TIME must be an integer greater than 45 seconds.'
  exit 1
fi
if ! [[ "$READY_ATTEMPTS" =~ ^[0-9]+$ ]] || (( READY_ATTEMPTS <= 0 )); then
  echo '::error title=Invalid read-replica checker readiness attempts::READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS must be a positive integer.'
  exit 1
fi
if ! [[ "$VERIFY_ATTEMPTS" =~ ^[0-9]+$ ]] || (( VERIFY_ATTEMPTS <= 0 )); then
  echo '::error title=Invalid read-replica checker verification attempts::READ_REPLICA_SCHEMA_CHECK_VERIFY_ATTEMPTS must be a positive integer.'
  exit 1
fi

remaining_check_time() {
  printf '%s' "$(( CHECK_MAX_TIME - SECONDS ))"
}

print_last_attempt() {
  local error_file="$1"
  local response_file="$2"

  if [[ -s "$error_file" ]]; then
    echo 'Last curl error:'
    head -c 16384 "$error_file"
    echo
  fi
  if [[ -s "$response_file" ]]; then
    echo 'Last Worker response:'
    head -c 16384 "$response_file"
    echo
  fi
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

  rm -f "$READY_RESPONSE" "$READY_ERROR" "$READY_ATTEMPT_RESPONSE" \
    "$READY_ATTEMPT_ERROR" "$VERIFY_RESPONSE" "$VERIFY_ERROR" \
    "$VERIFY_ATTEMPT_RESPONSE" "$VERIFY_ATTEMPT_ERROR" "$SECRETS_FILE"
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

READY=0
LAST_READY_STATUS=''
READY_ATTEMPTS_USED=0
for attempt in $(seq 1 "$READY_ATTEMPTS"); do
  READY_ATTEMPTS_USED="$attempt"
  REMAINING_TIME="$(remaining_check_time)"
  if (( REMAINING_TIME <= CHECK_CLEANUP_RESERVE_SECONDS )); then
    break
  fi

  ATTEMPT_MAX_TIME="$READY_ATTEMPT_MAX_TIME"
  if (( ATTEMPT_MAX_TIME > REMAINING_TIME - CHECK_CLEANUP_RESERVE_SECONDS )); then
    ATTEMPT_MAX_TIME="$(( REMAINING_TIME - CHECK_CLEANUP_RESERVE_SECONDS ))"
  fi
  : > "$READY_ATTEMPT_RESPONSE"
  : > "$READY_ATTEMPT_ERROR"
  LAST_READY_STATUS="$(curl -sS --connect-timeout 10 --max-time "$ATTEMPT_MAX_TIME" \
    --header "authorization: Bearer ${READ_REPLICA_SCHEMA_CHECK_TOKEN}" \
    -w '%{http_code}' \
    -o "$READY_ATTEMPT_RESPONSE" \
    "${WORKER_URL}/ok" 2>"$READY_ATTEMPT_ERROR" || true)"
  if [[ -s "$READY_ATTEMPT_RESPONSE" ]]; then
    cp "$READY_ATTEMPT_RESPONSE" "$READY_RESPONSE"
  fi
  if [[ -s "$READY_ATTEMPT_ERROR" ]]; then
    cp "$READY_ATTEMPT_ERROR" "$READY_ERROR"
  fi
  if [[ "$LAST_READY_STATUS" == '200' ]]; then
    READY=1
    break
  fi
  if (( attempt < READY_ATTEMPTS )) && (( $(remaining_check_time) > CHECK_CLEANUP_RESERVE_SECONDS + 2 )); then
    sleep 2
  fi
done

if (( READY == 0 )); then
  echo "::error title=Read-replica checker Worker did not become ready::Worker /ok did not return HTTP 200 after ${READY_ATTEMPTS_USED} attempts; last HTTP status was ${LAST_READY_STATUS:-curl_failed}."
  print_last_attempt "$READY_ERROR" "$READY_RESPONSE"
  exit 1
fi

VERIFIED=0
LAST_VERIFY_STATUS=''
VERIFY_ATTEMPTS_USED=0
for attempt in $(seq 1 "$VERIFY_ATTEMPTS"); do
  VERIFY_ATTEMPTS_USED="$attempt"
  REMAINING_TIME="$(remaining_check_time)"
  if (( REMAINING_TIME <= CHECK_CLEANUP_RESERVE_SECONDS )); then
    break
  fi

  ATTEMPT_MAX_TIME="$VERIFY_ATTEMPT_MAX_TIME"
  if (( ATTEMPT_MAX_TIME > REMAINING_TIME - CHECK_CLEANUP_RESERVE_SECONDS )); then
    ATTEMPT_MAX_TIME="$(( REMAINING_TIME - CHECK_CLEANUP_RESERVE_SECONDS ))"
  fi
  : > "$VERIFY_ATTEMPT_RESPONSE"
  : > "$VERIFY_ATTEMPT_ERROR"
  LAST_VERIFY_STATUS="$(curl -sS --connect-timeout 10 --max-time "$ATTEMPT_MAX_TIME" \
    --header "authorization: Bearer ${READ_REPLICA_SCHEMA_CHECK_TOKEN}" \
    -w '%{http_code}' \
    -o "$VERIFY_ATTEMPT_RESPONSE" \
    "${WORKER_URL}/verify-master" 2>"$VERIFY_ATTEMPT_ERROR" || true)"
  if [[ -s "$VERIFY_ATTEMPT_RESPONSE" ]]; then
    cp "$VERIFY_ATTEMPT_RESPONSE" "$VERIFY_RESPONSE"
  fi
  if [[ -s "$VERIFY_ATTEMPT_ERROR" ]]; then
    cp "$VERIFY_ATTEMPT_ERROR" "$VERIFY_ERROR"
  fi
  if [[ "$LAST_VERIFY_STATUS" == '200' ]]; then
    VERIFIED=1
    break
  fi
  if (( attempt < VERIFY_ATTEMPTS )) && (( $(remaining_check_time) > CHECK_CLEANUP_RESERVE_SECONDS + 2 )); then
    sleep 2
  fi
done

if (( VERIFIED == 0 )); then
  echo "::error title=Read-replica Hyperdrive verification failed::Worker /verify-master did not return HTTP 200 after ${VERIFY_ATTEMPTS_USED} attempts; last HTTP status was ${LAST_VERIFY_STATUS:-curl_failed}."
  print_last_attempt "$VERIFY_ERROR" "$VERIFY_RESPONSE"
  exit 1
fi

echo 'Read replica Hyperdrive verification result:'
cat "$VERIFY_RESPONSE"
echo
echo 'Read replica matches the live primary schema for the selected tables through Hyperdrive.'
