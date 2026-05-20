#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=read_replicate/common.sh
source "${SCRIPT_DIR}/common.sh"

if [[ -n "${READ_REPLICA_PASSWORD:-}" ]]; then
  NEW_PASSWORD="$READ_REPLICA_PASSWORD"
  echo "Using password from READ_REPLICA_PASSWORD."
elif [[ $# -eq 1 ]]; then
  NEW_PASSWORD="$1"
  echo "Using password from positional argument."
elif [[ $# -gt 1 ]]; then
  echo "Usage: $0 [new_source_password]"
  echo "       or set READ_REPLICA_PASSWORD=... $0"
  exit 1
else
  if [[ ! -t 0 ]]; then
    echo "Please run this script in a terminal or provide READ_REPLICA_PASSWORD / argument."
    exit 1
  fi

  read -r -s -p "Enter new source password for logical replication: " NEW_PASSWORD
  echo

  if [[ -z "$NEW_PASSWORD" ]]; then
    echo "Error: password cannot be empty."
    exit 1
  fi
fi

if [[ -t 0 && -z "${AUTO_CONFIRM:-}" ]]; then
  read -r -p "Proceed with updating the Google replication subscription now? [y/N]: " CONFIRM_START
  case "$CONFIRM_START" in
    y|Y|yes|YES) : ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

if [[ -z "$NEW_PASSWORD" ]]; then
  echo "Error: password cannot be empty."
  exit 1
fi

load_replica_target
load_source
DEFAULT_SUBSCRIPTION_NAME="capgo_google_$(replica_region_name)"
discover_subscription "$DEFAULT_SUBSCRIPTION_NAME"
print_target_summary

NEW_CONNECTION_STRING="host=$(libpq_escape_value "$SOURCE_HOST") port=$(libpq_escape_value "$SOURCE_PORT") dbname=$(libpq_escape_value "$SOURCE_DB") user=$(libpq_escape_value "$SOURCE_USER") password=$(libpq_escape_value "$NEW_PASSWORD") sslmode=$(libpq_escape_value "$SOURCE_SSLMODE") connect_timeout=10 keepalives=1 keepalives_idle=10 keepalives_interval=5 keepalives_count=3"
SAFE_CONNECTION_STRING="$(sql_literal_escape "$NEW_CONNECTION_STRING")"

SUB_EXISTS=$(psql-17 "$REPLICA_TARGET_DB_URL" -t -A -c "
  SELECT 1
  FROM pg_subscription
  WHERE subname = '${REPLICA_SUBSCRIPTION_NAME}';
" || true)

if [[ -z "$SUB_EXISTS" ]]; then
  echo "Error: subscription '${REPLICA_SUBSCRIPTION_NAME}' not found on ${REPLICA_TARGET_ENV}."
  exit 1
fi

echo "Updating logical replication subscription '${REPLICA_SUBSCRIPTION_NAME}'..."
psql-17 "$REPLICA_TARGET_DB_URL" -q -v ON_ERROR_STOP=1 -c "ALTER SUBSCRIPTION ${REPLICA_SUBSCRIPTION_NAME} DISABLE;"
psql-17 "$REPLICA_TARGET_DB_URL" -q -v ON_ERROR_STOP=1 -c "ALTER SUBSCRIPTION ${REPLICA_SUBSCRIPTION_NAME} CONNECTION '${SAFE_CONNECTION_STRING}';"
psql-17 "$REPLICA_TARGET_DB_URL" -q -v ON_ERROR_STOP=1 -c "ALTER SUBSCRIPTION ${REPLICA_SUBSCRIPTION_NAME} ENABLE;"

echo "Done."
