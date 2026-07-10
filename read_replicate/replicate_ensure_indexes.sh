#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=read_replicate/common.sh
source "${SCRIPT_DIR}/common.sh"

load_replica_target

echo ""
echo "========================================"
echo "  Ensuring indexes for: ${REPLICA_TARGET_ENV}"
echo "========================================"
echo ""

ensure_indexes() {
  local table_name="$1"
  local existing_indexes
  local expected_indexes
  local missing=0
  local idx
  local idx_sql

  echo "==> Checking indexes for: ${table_name}"

  if ! psql-17 "$REPLICA_TARGET_DB_URL" -t -A -c "SELECT to_regclass('public.${table_name}') IS NOT NULL;" | grep -q t; then
    echo "    Table missing, skipping."
    echo ""
    return
  fi

  existing_indexes=$(psql-17 "$REPLICA_TARGET_DB_URL" -t -A -c "
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = '${table_name}'
      AND schemaname = 'public';
  " | sort)

  expected_indexes=$(grep -E "CREATE (UNIQUE )?INDEX.*ON public\.${table_name}" "${SCRIPT_DIR}/schema_replicate.sql" \
    | sed -E 's/.*INDEX ([^ ]+) ON.*/\1/' \
    | sort)

  echo "    Existing: $(echo "$existing_indexes" | tr '\n' ' ')"
  echo "    Expected: $(echo "$expected_indexes" | tr '\n' ' ')"

  for idx in $expected_indexes; do
    if ! echo "$existing_indexes" | grep -q "^${idx}$"; then
      echo "    MISSING: $idx - creating..."
      missing=1
      idx_sql=$(awk "/CREATE (UNIQUE )?INDEX ${idx} ON/,/;/" "${SCRIPT_DIR}/schema_replicate.sql" | tr '\n' ' ')

      if [[ -n "$idx_sql" ]]; then
        if ! psql-17 "$REPLICA_TARGET_DB_URL" -v ON_ERROR_STOP=1 -c "$idx_sql"; then
          echo "      Failed to create $idx"
          exit 1
        fi
      else
        echo "      Could not find SQL for $idx"
        exit 1
      fi
    fi
  done

  if [[ $missing -eq 0 ]]; then
    echo "    All indexes present"
  fi
  echo ""
}

for table in "${REPLICA_TABLES[@]}"; do
  ensure_indexes "$table"
done

echo "========================================"
echo "  Done checking indexes for: ${REPLICA_TARGET_ENV}"
echo "========================================"
