#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="internal/cloudflare/.env.prod"
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
CONFIG_KEYS="max_connections,max_worker_processes,max_replication_slots,max_wal_senders"
YES="false"
DRY_RUN="false"
NO_RESTART="false"
PROFILE="${SUPABASE_PROFILE:-}"

usage() {
  cat <<'EOF'
Usage:
  scripts/reset_supabase_postgres_config_defaults.sh [options]

Deletes Supabase Postgres config overrides so the project falls back to the
compute-sized defaults for:
  - max_connections
  - max_worker_processes
  - max_replication_slots
  - max_wal_senders

Options:
  --project-ref <ref>    Supabase project ref. Defaults to SUPABASE_PROJECT_REF
                         or parses MAIN_SUPABASE_DB_URL from the env file.
  --env-file <path>      Env file to parse when --project-ref is omitted
                         (default: internal/cloudflare/.env.prod).
  --config <keys>        Comma-separated config keys to delete.
  --profile <name>       Supabase CLI profile.
  --no-restart           Delete overrides without restarting Postgres.
  --dry-run              Print commands without executing them.
  --yes                  Skip confirmation prompt.
  -h, --help             Show this help.

Examples:
  scripts/reset_supabase_postgres_config_defaults.sh --dry-run
  scripts/reset_supabase_postgres_config_defaults.sh --yes
  scripts/reset_supabase_postgres_config_defaults.sh --project-ref xvwzpoazmxkqosrdewyv --yes
EOF
}

require_arg() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    echo "Error: $flag requires a value." >&2
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  local line

  [[ -f "$ENV_FILE" ]] || return 1

  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" ]] && continue
    [[ "${line:0:1}" == "#" ]] && continue
    if [[ "$line" == "${key}="* ]]; then
      printf "%s\n" "${line#*=}"
      return 0
    fi
  done < "$ENV_FILE"

  return 1
}

extract_project_ref_from_db_url() {
  local db_url="$1"
  local user host

  user="$(printf "%s" "$db_url" | sed -E 's|^[^:]+://([^:]+):.*|\1|')"
  if [[ "$user" == postgres.* ]]; then
    printf "%s\n" "${user#postgres.}"
    return 0
  fi

  host="$(printf "%s" "$db_url" | sed -E 's|.*@([^/:?]+).*|\1|')"
  if [[ "$host" =~ ^db\.([a-z0-9]+)\.supabase\.co$ ]]; then
    printf "%s\n" "${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

run_supabase() {
  local args=(bunx supabase --experimental)
  if [[ -n "$PROFILE" ]]; then
    args+=(--profile "$PROFILE")
  fi
  if [[ "$YES" == "true" ]]; then
    args+=(--yes)
  fi
  args+=("$@")

  if [[ "$DRY_RUN" == "true" ]]; then
    printf '+'
    printf ' %q' "${args[@]}"
    printf '\n'
    return 0
  fi

  "${args[@]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      require_arg "$1" "${2:-}"
      PROJECT_REF="$2"
      shift 2
      ;;
    --env-file)
      require_arg "$1" "${2:-}"
      ENV_FILE="$2"
      shift 2
      ;;
    --config)
      require_arg "$1" "${2:-}"
      CONFIG_KEYS="$2"
      shift 2
      ;;
    --profile)
      require_arg "$1" "${2:-}"
      PROFILE="$2"
      shift 2
      ;;
    --no-restart)
      NO_RESTART="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --yes)
      YES="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_REF" ]]; then
  if db_url="$(get_env_value "MAIN_SUPABASE_DB_URL")"; then
    if ! PROJECT_REF="$(extract_project_ref_from_db_url "$db_url")"; then
      echo "Error: could not parse project ref from MAIN_SUPABASE_DB_URL in $ENV_FILE." >&2
      echo "Pass --project-ref explicitly." >&2
      exit 1
    fi
  else
    echo "Error: --project-ref not provided and MAIN_SUPABASE_DB_URL not found in $ENV_FILE." >&2
    exit 1
  fi
fi

delete_args=(
  postgres-config delete
  --project-ref "$PROJECT_REF"
  --config "$CONFIG_KEYS"
)

if [[ "$NO_RESTART" == "true" ]]; then
  delete_args+=(--no-restart)
fi

echo "==> Supabase project ref: $PROJECT_REF"
echo "==> Config overrides to delete: $CONFIG_KEYS"
if [[ "$NO_RESTART" == "true" ]]; then
  echo "==> Restart: disabled (--no-restart)"
else
  echo "==> Restart: enabled by Supabase CLI default"
fi

echo "==> Current Postgres config overrides:"
run_supabase postgres-config get --project-ref "$PROJECT_REF" || true

if [[ "$YES" != "true" && "$DRY_RUN" != "true" ]]; then
  echo ""
  echo "This deletes only the listed config overrides. Supabase will apply its defaults."
  read -r -p "Proceed with deleting these overrides for project $PROJECT_REF? [y/N]: " confirm
  case "$confirm" in
    y|Y|yes|YES)
      ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

echo "==> Deleting Postgres config overrides..."
run_supabase "${delete_args[@]}"

echo "==> Remaining Postgres config overrides:"
run_supabase postgres-config get --project-ref "$PROJECT_REF" || true

echo "==> Done."
