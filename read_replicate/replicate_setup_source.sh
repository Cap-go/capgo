#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=read_replicate/common.sh
source "${SCRIPT_DIR}/common.sh"

if [[ "${READ_REPLICA_LOCAL:-}" == "1" ]]; then
  echo "==> Setting up local Supabase source for plugin read-replica replication..."
  load_local_replica_target
  load_source
  apply_local_subscription_source_connection
else
  echo "==> Setting up Supabase source for Google read-replica replication..."
  load_replica_target
  load_source
fi

PUBLICATION_NAME="$(discover_publication_name)"
DEFAULT_SUBSCRIPTION_NAME="capgo_google_$(replica_region_name)"
discover_subscription "$DEFAULT_SUBSCRIPTION_NAME"

echo ""
echo "========================================"
echo "  Source: $SOURCE_HOST:$SOURCE_PORT/$SOURCE_DB"
echo "  Publication: $PUBLICATION_NAME"
echo "  Tables: ${REPLICA_TABLES[*]}"
echo "========================================"
echo ""

echo "==> Checking wal_level..."
WAL_LEVEL=$(psql-17 "$SOURCE_DB_URL" -t -A -c "SHOW wal_level;")
echo "    Current wal_level: $WAL_LEVEL"

if [[ "$WAL_LEVEL" != "logical" ]]; then
  echo "ERROR: wal_level is not 'logical'. Logical replication requires wal_level=logical."
  echo "On Supabase, enable logical replication before continuing."
  exit 1
fi

echo "==> Verifying source tables and replica identity..."
EXISTING_TABLES=()
for table in "${REPLICA_TABLES[@]}"; do
  EXISTS=$(psql-17 "$SOURCE_DB_URL" -t -A -c "
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '${table}';
  " || true)

  if [[ -z "$EXISTS" ]]; then
    echo "    SKIP: public.${table} does not exist on source yet"
    continue
  fi

  EXISTING_TABLES+=("$table")
  REPLICA_ID=$(psql-17 "$SOURCE_DB_URL" -t -A -c "
    SELECT relreplident
    FROM pg_class
    WHERE relname = '${table}'
      AND relnamespace = 'public'::regnamespace;
  ")
  HAS_PRIMARY_KEY=$(psql-17 "$SOURCE_DB_URL" -t -A -c "
    SELECT EXISTS (
      SELECT 1
      FROM pg_index
      WHERE indrelid = 'public.${table}'::regclass
        AND indisprimary
    );
  ")
  HAS_REPLICA_INDEX=$(psql-17 "$SOURCE_DB_URL" -t -A -c "
    SELECT EXISTS (
      SELECT 1
      FROM pg_index
      WHERE indrelid = 'public.${table}'::regclass
        AND indisreplident
        AND indisvalid
        AND indisready
    );
  ")

  case "$REPLICA_ID" in
    d) REPLICA_DESC="DEFAULT (uses primary key)" ;;
    n) REPLICA_DESC="NOTHING (no identity)" ;;
    f) REPLICA_DESC="FULL (entire row)" ;;
    i) REPLICA_DESC="INDEX" ;;
    *) REPLICA_DESC="UNKNOWN ($REPLICA_ID)" ;;
  esac

  if [[ "$REPLICA_ID" == "n" ]]; then
    echo "    WARNING: ${table} has REPLICA IDENTITY NOTHING. Setting to FULL..."
    psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -c "ALTER TABLE public.${table} REPLICA IDENTITY FULL;"
    REPLICA_DESC="FULL (entire row)"
  elif [[ "$REPLICA_ID" == "d" && "$HAS_PRIMARY_KEY" != "t" ]]; then
    echo "    WARNING: ${table} has DEFAULT replica identity without a primary key. Setting to FULL..."
    psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -c "ALTER TABLE public.${table} REPLICA IDENTITY FULL;"
    REPLICA_DESC="FULL (entire row)"
  elif [[ "$REPLICA_ID" == "i" && "$HAS_REPLICA_INDEX" != "t" ]]; then
    echo "    WARNING: ${table} has INDEX replica identity without a valid replica identity index. Setting to FULL..."
    psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -c "ALTER TABLE public.${table} REPLICA IDENTITY FULL;"
    REPLICA_DESC="FULL (entire row)"
  fi

  echo "    ${table}: $REPLICA_DESC"
done

if [[ ${#EXISTING_TABLES[@]} -eq 0 ]]; then
  echo "ERROR: no configured source tables exist."
  exit 1
fi

echo "==> Creating or updating publication without touching subscriptions or slots..."
PUBLICATION_EXISTS=$(psql-17 "$SOURCE_DB_URL" -t -A -c "
  SELECT 1 FROM pg_publication WHERE pubname = '${PUBLICATION_NAME}';
" || true)

if [[ -z "$PUBLICATION_EXISTS" ]]; then
  TABLE_LIST=""
  for table in "${EXISTING_TABLES[@]}"; do
    if [[ -n "$TABLE_LIST" ]]; then
      TABLE_LIST="${TABLE_LIST}, "
    fi
    TABLE_LIST="${TABLE_LIST}public.${table}"
  done
  psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE PUBLICATION ${PUBLICATION_NAME} FOR TABLE ${TABLE_LIST};"
  echo "    Created publication ${PUBLICATION_NAME}."
else
  for table in "${EXISTING_TABLES[@]}"; do
    psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = '${PUBLICATION_NAME}'
      AND schemaname = 'public'
      AND tablename = '${table}'
  ) THEN
    EXECUTE 'ALTER PUBLICATION ${PUBLICATION_NAME} ADD TABLE public.${table}';
    RAISE NOTICE 'Added public.${table} to ${PUBLICATION_NAME}';
  ELSE
    RAISE NOTICE 'public.${table} already in ${PUBLICATION_NAME}';
  END IF;
END
\$\$;
SQL
  done
fi

echo "==> Publication tables:"
psql-17 "$SOURCE_DB_URL" -c "
  SELECT schemaname, tablename
  FROM pg_publication_tables
  WHERE pubname = '${PUBLICATION_NAME}'
  ORDER BY schemaname, tablename;
"

echo "==> Done."
