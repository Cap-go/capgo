#!/usr/bin/env bash

# Script to start Cloudflare Workers for testing
# This script starts all workers (API, Plugin, Files) in the background

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Starting Cloudflare Workers for testing..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SUPABASE_CLI=("${ROOT_DIR}/scripts/with-worktree-supabase-env.sh" bunx supabase)

# Extract a single variable from `supabase status -o env`, preserving any '=' in values (JWT padding).
get_supabase_status_var() {
  local key_regex="$1"
  # Output looks like: KEY="value" or KEY=value
  printf '%s\n' "${SUPA_ENV}" \
    | grep -E "^(${key_regex})=" \
    | head -n 1 \
    | sed -E 's/^[^=]+=//' \
    | sed -E 's/^"//; s/"$//'
}

# Build a runtime env file with local Supabase keys so we don't commit secrets.
BASE_ENV_FILE="${ROOT_DIR}/cloudflare_workers/.env.local"
RUNTIME_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/capgo-cloudflare-env.XXXXXX")"
chmod 600 "${RUNTIME_ENV_FILE}"
if [ -f "${BASE_ENV_FILE}" ]; then
  cp "${BASE_ENV_FILE}" "${RUNTIME_ENV_FILE}"
else
  echo -e "${YELLOW}Warning: ${BASE_ENV_FILE} not found - starting with empty base env${NC}"
fi

SUPA_ENV="$("${SUPABASE_CLI[@]}" status -o env 2>/dev/null || true)"
SUPABASE_URL_FROM_STATUS="$(get_supabase_status_var 'API_URL')"
# Supabase CLI has historically emitted either SERVICE_ROLE_KEY/ANON_KEY or SECRET_KEY/PUBLISHABLE_KEY.
SUPABASE_SERVICE_ROLE_KEY_FROM_STATUS="$(get_supabase_status_var 'SERVICE_ROLE_KEY|SECRET_KEY')"
SUPABASE_ANON_KEY_FROM_STATUS="$(get_supabase_status_var 'ANON_KEY|PUBLISHABLE_KEY')"

# Allow overrides via environment, otherwise use supabase status output.
SUPABASE_URL="${SUPABASE_URL:-${SUPABASE_URL_FROM_STATUS}}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY_FROM_STATUS}}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY_FROM_STATUS}}"

if [ -z "${SUPABASE_SERVICE_ROLE_KEY}" ] || [ -z "${SUPABASE_ANON_KEY}" ] || [ -z "${SUPABASE_URL}" ]; then
  echo -e "${YELLOW}Missing Supabase keys for Cloudflare Workers.${NC}"
  echo "Ensure Supabase is running, or set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY in your environment."
  exit 1
fi

# Cloudflare local testing defaults.
CLOUDFLARE_FUNCTION_URL="${CLOUDFLARE_FUNCTION_URL:-http://127.0.0.1:8787}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-testsecret}"

# In CI/linux, `host.docker.internal` is unreliable. Prefer localhost (mapped ports).
S3_ENDPOINT_TO_USE="${S3_ENDPOINT:-127.0.0.1:9000}"

cat >> "${RUNTIME_ENV_FILE}" <<EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
CLOUDFLARE_FUNCTION_URL=${CLOUDFLARE_FUNCTION_URL}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
S3_ENDPOINT=${S3_ENDPOINT_TO_USE}
EOF

# Kill any existing wrangler processes
echo -e "${YELLOW}Cleaning up existing wrangler processes...${NC}"
pkill -f "wrangler dev" || true
sleep 2

# Start API worker on port 8787
echo -e "${GREEN}Starting API worker on port 8787...${NC}"
(cd "${ROOT_DIR}/cloudflare_workers/api" && bunx wrangler dev -c wrangler.jsonc --port 8787 --env-file="${RUNTIME_ENV_FILE}" --env=local --persist-to "${ROOT_DIR}/.wrangler-shared") &
API_PID=$!

# Wait a bit for the first worker to start
sleep 3

# Start Plugin worker on port 8788
echo -e "${GREEN}Starting Plugin worker on port 8788...${NC}"
(cd "${ROOT_DIR}/cloudflare_workers/plugin" && bunx wrangler dev -c wrangler.jsonc --port 8788 --env-file="${RUNTIME_ENV_FILE}" --env=local --persist-to "${ROOT_DIR}/.wrangler-shared") &
PLUGIN_PID=$!

# Wait a bit for the second worker to start
sleep 3

# Start Files worker on port 8789
echo -e "${GREEN}Starting Files worker on port 8789...${NC}"
(cd "${ROOT_DIR}/cloudflare_workers/files" && bunx wrangler dev -c wrangler.jsonc --port 8789 --env-file="${RUNTIME_ENV_FILE}" --env=local --persist-to "${ROOT_DIR}/.wrangler-shared") &
FILES_PID=$!

echo -e "${GREEN}All workers started!${NC}"
echo "API Worker PID: $API_PID (http://127.0.0.1:8787)"
echo "Plugin Worker PID: $PLUGIN_PID (http://127.0.0.1:8788)"
echo "Files Worker PID: $FILES_PID (http://127.0.0.1:8789)"
echo ""

echo ""
echo "Press Ctrl+C to stop all workers"

# Function to cleanup on exit
cleanup() {
  echo -e "\n${YELLOW}Stopping workers...${NC}"
  kill $API_PID $PLUGIN_PID $FILES_PID 2>/dev/null || true
  pkill -f "wrangler dev" || true
  rm -f "${RUNTIME_ENV_FILE}" 2>/dev/null || true
  echo -e "${GREEN}All workers stopped${NC}"
}

# Trap SIGINT and SIGTERM
trap cleanup EXIT INT TERM

# Wait for all background processes
wait
