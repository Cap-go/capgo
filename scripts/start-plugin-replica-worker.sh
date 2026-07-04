#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGIN_REPLICA_DIR="${ROOT_DIR}/cloudflare_workers/plugin-replica"
PLUGIN_REPLICA_DB_PORT="${PLUGIN_REPLICA_DB_PORT:-55432}"
PLUGIN_REPLICA_INSPECTOR_PORT="${PLUGIN_REPLICA_INSPECTOR_PORT:-9233}"
PLUGIN_REPLICA_WORKER_PORT="${PLUGIN_REPLICA_WORKER_PORT:-8790}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

run_supabase_status_env() {
  if command -v bun >/dev/null 2>&1; then
    bun run supabase:status -- -o env 2>/dev/null && return 0
  fi
  if command -v supabase >/dev/null 2>&1; then
    supabase status -o env 2>/dev/null && return 0
  fi
  bunx supabase status -o env 2>/dev/null && return 0
  return 1
}

get_supabase_status_var() {
  local key_regex="$1"
  printf '%s\n' "${SUPA_ENV}" \
    | grep -E "^(${key_regex})=" \
    | head -n 1 \
    | sed -E 's/^[^=]+=//' \
    | sed -E 's/^"//; s/"$//'
}

BASE_ENV_FILE="${ROOT_DIR}/cloudflare_workers/.env.local"
RUNTIME_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/capgo-plugin-replica-env.XXXXXX")"
chmod 600 "${RUNTIME_ENV_FILE}"
if [[ -f "${BASE_ENV_FILE}" ]]; then
  cp "${BASE_ENV_FILE}" "${RUNTIME_ENV_FILE}"
else
  echo -e "${YELLOW}Warning: ${BASE_ENV_FILE} not found - starting with empty base env${NC}"
fi

SUPA_ENV="$(run_supabase_status_env || true)"
SUPABASE_URL_FROM_STATUS="$(get_supabase_status_var 'API_URL')"
SUPABASE_DB_URL_FROM_STATUS="$(get_supabase_status_var 'DB_URL')"
SUPABASE_SERVICE_ROLE_KEY_FROM_STATUS="$(get_supabase_status_var 'SERVICE_ROLE_KEY|SECRET_KEY')"
SUPABASE_ANON_KEY_FROM_STATUS="$(get_supabase_status_var 'ANON_KEY|PUBLISHABLE_KEY')"

SUPABASE_URL="${SUPABASE_URL:-${SUPABASE_URL_FROM_STATUS}}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-${SUPABASE_DB_URL_FROM_STATUS}}"
MAIN_SUPABASE_DB_URL="${MAIN_SUPABASE_DB_URL:-${SUPABASE_DB_URL_FROM_STATUS}}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY_FROM_STATUS}}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY_FROM_STATUS}}"

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY}" || -z "${SUPABASE_ANON_KEY}" || -z "${SUPABASE_URL}" || -z "${SUPABASE_DB_URL}" || -z "${MAIN_SUPABASE_DB_URL}" ]]; then
  echo -e "${YELLOW}Missing Supabase keys for plugin-replica worker.${NC}"
  exit 1
fi

LOCAL_READ_REPLICA_DB_URL="postgresql://postgres:postgres@127.0.0.1:${PLUGIN_REPLICA_DB_PORT}/postgres"

echo -e "${GREEN}Starting plugin read-replica Postgres container...${NC}"
(
  cd "${PLUGIN_REPLICA_DIR}"
  PLUGIN_REPLICA_DB_PORT="${PLUGIN_REPLICA_DB_PORT}" docker compose up -d --wait
)

export MAIN_SUPABASE_DB_URL
export PLUGIN_REPLICA_DB_PORT
bash "${ROOT_DIR}/read_replicate/replicate_to_local.sh"

cat >> "${RUNTIME_ENV_FILE}" <<EOF
MAIN_SUPABASE_DB_URL=${MAIN_SUPABASE_DB_URL}
SUPABASE_DB_URL=${SUPABASE_DB_URL}
LOCAL_READ_REPLICA_DB_URL=${LOCAL_READ_REPLICA_DB_URL}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
CAPGO_PREVENT_BACKGROUND_FUNCTIONS=true
RATE_LIMIT_API_KEY=999999
RATE_LIMIT_FAILED_AUTH=999999
RATE_LIMIT_CHANNEL_SELF_IP=999999
EOF

echo -e "${GREEN}Starting plugin-replica worker on port ${PLUGIN_REPLICA_WORKER_PORT}...${NC}"
(cd "${PLUGIN_REPLICA_DIR}" && bunx wrangler dev --local -c wrangler.jsonc --port "${PLUGIN_REPLICA_WORKER_PORT}" --inspector-port "${PLUGIN_REPLICA_INSPECTOR_PORT}" --env-file="${RUNTIME_ENV_FILE}" --env=local --persist-to "${ROOT_DIR}/.wrangler-shared") &
WORKER_PID=$!

cleanup() {
  echo -e "\n${YELLOW}Stopping plugin-replica worker...${NC}"
  kill "${WORKER_PID}" 2>/dev/null || true
  rm -f "${RUNTIME_ENV_FILE}" 2>/dev/null || true
  (
    cd "${PLUGIN_REPLICA_DIR}"
    docker compose down >/dev/null 2>&1 || true
  )
}

trap cleanup EXIT INT TERM
wait "${WORKER_PID}"
