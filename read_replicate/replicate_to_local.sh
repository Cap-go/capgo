#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export READ_REPLICA_LOCAL=1
export READ_REPLICA_FULL_RESET="${READ_REPLICA_FULL_RESET:-1}"
export READ_REPLICA_PUBLICATION_NAME="${READ_REPLICA_PUBLICATION_NAME:-capgo_local_replicate}"
export READ_REPLICA_SUBSCRIPTION_NAME="${READ_REPLICA_SUBSCRIPTION_NAME:-capgo_local_subscription}"
export READ_REPLICA_SLOT_NAME="${READ_REPLICA_SLOT_NAME:-capgo_local_slot}"
export PLUGIN_REPLICA_DB_PORT="${PLUGIN_REPLICA_DB_PORT:-55432}"

if [[ -z "${MAIN_SUPABASE_DB_URL:-}" ]]; then
  if command -v bun >/dev/null 2>&1; then
    SUPA_ENV="$(bun run supabase:status -- -o env 2>/dev/null || true)"
  else
    SUPA_ENV="$(supabase status -o env 2>/dev/null || true)"
  fi
  MAIN_SUPABASE_DB_URL="$(printf '%s\n' "$SUPA_ENV" | grep -E '^(DB_URL)=' | head -n1 | sed -E 's/^[^=]+=//' | sed -E 's/^"//; s/"$//')"
fi

if [[ -z "${MAIN_SUPABASE_DB_URL:-}" ]]; then
  echo "Error: MAIN_SUPABASE_DB_URL is not set and could not be resolved from supabase status." >&2
  exit 1
fi

export MAIN_SUPABASE_DB_URL

bash "${SCRIPT_DIR}/replicate_setup_source.sh"
exec bash "${SCRIPT_DIR}/replicate_to_replica.sh"
