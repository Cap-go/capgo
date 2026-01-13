#!/usr/bin/env bash
set -euo pipefail

# -------- Config (edit these) --------
# Load PlanetScale connection strings from .env.prod
ENV_FILE="$(dirname "$0")/../internal/cloudflare/.env.prod"
echo "==> Starting replication to PlanetScale..."

if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading PlanetScale connection strings from $ENV_FILE"
  PLANETSCALE_NA=$(grep '^PLANETSCALE_NA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_EU=$(grep '^PLANETSCALE_EU=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_SA=$(grep '^PLANETSCALE_SA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_OC=$(grep '^PLANETSCALE_OC=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS_INDIA=$(grep '^PLANETSCALE_AS_INDIA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS_JAPAN=$(grep '^PLANETSCALE_AS_JAPAN=' "$ENV_FILE" | cut -d'=' -f2- || true)
  echo "==> Loaded PlanetScale connection strings."
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Select which region to use (change this to switch regions)
SELECTED_REGION="PLANETSCALE_SA"
DB_T="${!SELECTED_REGION}"

# Set to true to only recreate the subscription (keeps existing data/schema)
# Set to false for full reset (drops schema, reimports, recreates subscription)
SUBSCRIPTION_ONLY=false

if [[ -z "$DB_T" ]]; then
  echo "Error: $SELECTED_REGION not found in $ENV_FILE"
  echo "Available variables:"
  grep '^PLANETSCALE_' "$ENV_FILE" | cut -d'=' -f1 || echo "  (none)"
  exit 1
fi

host=${DB_T#*@}     # remove up to @
host=${host%%:*}    # remove :port...
REGION=${host%%.*}  # first DNS label
REGION="${REGION//-/_}"

TARGET_DB_URL="${DB_T}&sslrootcert=system"
echo "==> Using target database for region: $REGION"

# Load source DB URL from .env.preprod and parse connection info
if [[ -f "$ENV_FILE" ]]; then
  DB_URL=$(grep '^MAIN_SUPABASE_DB_URL=' "$ENV_FILE" | cut -d'=' -f2-)
  # Convert ssl=false to sslmode=disable for pg compatibility
  DB_URL="${DB_URL//ssl=false/sslmode=disable}"
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Parse connection string: postgresql://user.project:password@host:port/db
# Extract components from URL (handle passwords with special chars by matching from the end)
SOURCE_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
# Extract password: everything between first : after user and last @ before host
SOURCE_PASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:(.*)@[^@]+$|\1|')
# Extract host:port/db from after the last @
_HOST_PORT_DB=$(echo "$DB_URL" | sed -E 's|.*@([^@]+)$|\1|')
SOURCE_HOST=$(echo "$_HOST_PORT_DB" | sed -E 's|([^:]+):.*|\1|')
SOURCE_PORT=$(echo "$_HOST_PORT_DB" | sed -E 's|[^:]+:([0-9]+)/.*|\1|')
SOURCE_DB=$(echo "$_HOST_PORT_DB" | sed -E 's|[^/]+/([^?]+).*|\1|')

# Convert pooler URL to direct connection for logical replication
# Pooler uses port 6543, direct uses port 5432
# User format: postgres.PROJECT_ID -> postgres
if [[ "$SOURCE_USER" == postgres.* ]]; then
  # Extract project ID from user (format: postgres.PROJECT_ID)
  PROJECT_ID=$(echo "$SOURCE_USER" | sed -E 's|postgres\.(.+)|\1|')
  SOURCE_HOST="db.${PROJECT_ID}.supabase.co"
  SOURCE_PORT="5432"
  SOURCE_USER="postgres"
  echo "==> Converted to direct connection: $SOURCE_HOST:$SOURCE_PORT (user: $SOURCE_USER)"
elif [[ "$SOURCE_PORT" == "6543" ]]; then
  # Port 6543 is the pooler port, change to direct port 5432
  SOURCE_PORT="5432"
  echo "==> Changed port from 6543 to 5432 for direct connection"
fi
SOURCE_SSLMODE='require'

echo "SOURCE_USER: $SOURCE_USER"
echo "SOURCE_PASSWORD: $SOURCE_PASSWORD"
echo "HOST: $SOURCE_HOST"
echo "PORT: $SOURCE_PORT"
echo "DB: $SOURCE_DB"

# Build source DB URL for direct connection (needed early for cleanup)
SOURCE_DB_URL="postgresql://${SOURCE_USER}:${SOURCE_PASSWORD}@${SOURCE_HOST}:${SOURCE_PORT}/${SOURCE_DB}?sslmode=${SOURCE_SSLMODE}"

# Logical replication objects
PUBLICATION_NAME='planetscale_replicate'
SUBSCRIPTION_NAME="planetscale_subscription_${REGION}"

# Tables to sync in order (priority first, large tables last)
# Phase 1: Core tables needed for queries (small/medium size)
PRIORITY_TABLES=(
  "orgs"
  "stripe_info"
  "org_users"
  "apps"
  "app_versions"
  "channels"
)
# Phase 2: Large tables that can sync later
DEFERRED_TABLES=(
  "channel_devices"
  "manifest"
)

# ========================================================================
# CLEANUP: Always drop ALL subscriptions on PlanetScale to start fresh
# ========================================================================
echo "==> Dropping ALL existing subscriptions on PlanetScale..."
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=0 <<'SQL'
DO $$
DECLARE
  sub record;
BEGIN
  FOR sub IN SELECT subname FROM pg_subscription LOOP
    RAISE NOTICE 'Cleaning up subscription: %', sub.subname;

    -- Disable subscription
    BEGIN
      EXECUTE format('ALTER SUBSCRIPTION %I DISABLE', sub.subname);
      RAISE NOTICE '  Disabled subscription';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '  Could not disable: %', SQLERRM;
    END;

    -- Wait for workers to stop
    PERFORM pg_sleep(2);

    -- Detach from slot
    BEGIN
      EXECUTE format('ALTER SUBSCRIPTION %I SET (slot_name = NONE)', sub.subname);
      RAISE NOTICE '  Detached from slot';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '  Could not detach from slot: %', SQLERRM;
    END;

    -- Drop subscription
    BEGIN
      EXECUTE format('DROP SUBSCRIPTION %I', sub.subname);
      RAISE NOTICE '  Dropped subscription';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '  Could not drop subscription: %', SQLERRM;
    END;
  END LOOP;
END
$$;
SQL

# Double-check all subscriptions are gone
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=0 -c "SELECT subname FROM pg_subscription;" || true

if [[ "$SUBSCRIPTION_ONLY" == "true" ]]; then
  echo "==> SUBSCRIPTION_ONLY mode: skipping schema reset, only recreating subscription"
else
  # ========================================================================
  # FULL RESET: Drop everything and start fresh
  # ========================================================================

  echo "==> Dropping existing replication slots on SOURCE (Supabase)..."
  psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=0 <<SQL
DO \$\$
DECLARE
  slot record;
BEGIN
  FOR slot IN SELECT slot_name, active, active_pid FROM pg_replication_slots WHERE slot_name LIKE 'planetscale_%' LOOP
    RAISE NOTICE 'Found replication slot: % (active: %)', slot.slot_name, slot.active;

    IF slot.active AND slot.active_pid IS NOT NULL THEN
      RAISE NOTICE '  Terminating connection using slot...';
      PERFORM pg_terminate_backend(slot.active_pid);
      PERFORM pg_sleep(2);
    END IF;

    BEGIN
      PERFORM pg_drop_replication_slot(slot.slot_name);
      RAISE NOTICE '  Dropped slot: %', slot.slot_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '  Could not drop slot: %', SQLERRM;
    END;
  END LOOP;
END
\$\$;
SQL

  echo "==> Cleaning up public schema on PlanetScale (full reset)..."
  psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
SQL

  echo "==> Importing schema into PlanetScale..."
  psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "schema_replicate.sql"

  echo "==> Ensuring publication has all tables on SOURCE..."
  # First ensure all tables are in the publication
  ALL_TABLES=("${PRIORITY_TABLES[@]}" "${DEFERRED_TABLES[@]}")
  for table in "${ALL_TABLES[@]}"; do
    psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = '${PUBLICATION_NAME}' AND tablename = '${table}'
  ) THEN
    EXECUTE 'ALTER PUBLICATION ${PUBLICATION_NAME} ADD TABLE public.${table}';
    RAISE NOTICE 'Added ${table} to publication';
  ELSE
    RAISE NOTICE '${table} already in publication';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add ${table}: %', SQLERRM;
END
\$\$;
SQL
  done
fi

# Connection string for subscription
CONNECTION_STRING="host=${SOURCE_HOST}
            port=${SOURCE_PORT}
            dbname=${SOURCE_DB}
            user=${SOURCE_USER}
            password=${SOURCE_PASSWORD}
            sslmode=${SOURCE_SSLMODE}
            connect_timeout=10
            keepalives=1
            keepalives_idle=10
            keepalives_interval=5
            keepalives_count=3"

# TCP keepalive settings to detect dead connections and reconnect:
# - keepalives=1: enable TCP keepalives
# - keepalives_idle=10: send keepalive after 10s of idle
# - keepalives_interval=5: retry every 5s if no response
# - keepalives_count=3: after 3 failed probes, close dead connection and reconnect
# - connect_timeout=10: fail fast on initial connection
# Note: disable_on_error=false ensures subscription retries indefinitely

# Helper function to wait for all tables to sync
wait_for_sync() {
  echo "    Waiting for tables to sync..."
  while true; do
    SYNC_STATUS=$(psql-17 "$TARGET_DB_URL" -t -A -c "
      SELECT COUNT(*) FROM pg_subscription_rel WHERE srsubstate != 'r';
    ")
    if [[ "$SYNC_STATUS" == "0" ]]; then
      echo "    All tables synced!"
      return 0
    fi
    echo "    Waiting... ($SYNC_STATUS tables still syncing)"
    psql-17 "$TARGET_DB_URL" -c "SELECT srrelid::regclass, srsubstate FROM pg_subscription_rel ORDER BY srrelid::regclass;"
    sleep 10
  done
}

if [[ "$SUBSCRIPTION_ONLY" == "true" ]]; then
  echo "==> SUBSCRIPTION_ONLY mode: creating subscription without copy_data..."
  psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE SUBSCRIPTION ${SUBSCRIPTION_NAME}
CONNECTION '${CONNECTION_STRING}'
PUBLICATION ${PUBLICATION_NAME}
WITH (
  copy_data = false,
  create_slot = false,
  slot_name = '${SUBSCRIPTION_NAME}',
  enabled = true,
  disable_on_error = false
);
SQL
else
  # ========================================================================
  # PHASED SYNC: Copy tables using pg_dump with parallel dumps for large tables
  # ========================================================================

  # Cache settings: reuse dump files if they're less than DUMP_CACHE_MINUTES old
  # Note: Supabase WAL retention is 4GB (size-based, not time-based)
  # 60 minutes is safe for most workloads - adjust if you have very high write volume
  DUMP_CACHE_MINUTES=60
  DUMP_DIR="$(dirname "$0")/dumps"
  mkdir -p "$DUMP_DIR"

  # Function to check if a dump file is fresh (less than DUMP_CACHE_MINUTES old)
  is_dump_fresh() {
    local dump_file=$1
    if [[ ! -f "$dump_file" ]]; then
      return 1  # File doesn't exist
    fi
    # macOS uses -f %m, Linux uses -c %Y
    local file_mtime
    file_mtime=$(stat -f %m "$dump_file" 2>/dev/null || stat -c %Y "$dump_file" 2>/dev/null)
    local file_age_seconds=$(( $(date +%s) - file_mtime ))
    local max_age_seconds=$(( DUMP_CACHE_MINUTES * 60 ))
    if [[ $file_age_seconds -lt $max_age_seconds ]]; then
      return 0  # Fresh
    else
      return 1  # Stale
    fi
  }

  # Function to dump a single table (can run in background)
  dump_table() {
    local table_name=$1
    local dump_file="${DUMP_DIR}/${table_name}.dump"

    if is_dump_fresh "$dump_file"; then
      echo "    [${table_name}] Using cached dump"
      return 0
    fi

    echo "    [${table_name}] Dumping..."
    PGPASSWORD="${SOURCE_PASSWORD}" pg_dump-17 \
      -h "${SOURCE_HOST}" \
      -p "${SOURCE_PORT}" \
      -U "${SOURCE_USER}" \
      -d "${SOURCE_DB}" \
      --format=custom \
      --compress=4 \
      --data-only \
      --table="public.${table_name}" \
      -f "$dump_file"
    echo "    [${table_name}] Dump complete: $(du -h "$dump_file" | cut -f1)"
  }

  # Function to restore a single table
  restore_table() {
    local table_name=$1
    local dump_file="${DUMP_DIR}/${table_name}.dump"

    echo "    [${table_name}] Restoring..."
    # Use --single-transaction=false to continue on duplicate key errors
    # Duplicates are safe to ignore - they mean the row was already replicated
    pg_restore-17 \
      -d "$TARGET_DB_URL" \
      --data-only \
      --disable-triggers \
      --no-owner \
      --no-privileges \
      "$dump_file" || echo "    [${table_name}] Some rows skipped (already exist via replication)"

    COUNT=$(psql-17 "$TARGET_DB_URL" -t -A -c "SELECT COUNT(*) FROM public.${table_name};")
    echo "    [${table_name}] Restored: ${COUNT} rows"
  }

  # ========================================================================
  # PHASE 0: Pre-dump deferred (large) tables in parallel while we work
  # ========================================================================
  echo "==> Phase 0: Starting background dumps of DEFERRED tables..."
  DUMP_PIDS=()
  for table in "${DEFERRED_TABLES[@]}"; do
    dump_table "$table" &
    DUMP_PIDS+=($!)
  done
  echo "    Background dump PIDs: ${DUMP_PIDS[*]}"

  # ========================================================================
  # PHASE 1: Dump and restore priority tables (sequentially for quick start)
  # ========================================================================
  echo "==> Phase 1: Copying PRIORITY tables (${PRIORITY_TABLES[*]})..."
  for table in "${PRIORITY_TABLES[@]}"; do
    dump_table "$table"
    restore_table "$table"
  done
  echo "==> Phase 1 complete! All priority tables copied."

  # ========================================================================
  # Create subscription to start streaming changes
  # ========================================================================
  echo "==> Creating subscription for ongoing replication (no copy_data)..."
  psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE SUBSCRIPTION ${SUBSCRIPTION_NAME}
CONNECTION '${CONNECTION_STRING}'
PUBLICATION ${PUBLICATION_NAME}
WITH (
  copy_data = false,
  create_slot = true,
  enabled = true,
  disable_on_error = false
);
SQL
  echo "==> Subscription created. Streaming changes now active."

  # ========================================================================
  # PHASE 2: Wait for deferred dumps to complete, then restore them
  # ========================================================================
  echo "==> Phase 2: Waiting for deferred table dumps to complete..."
  for pid in "${DUMP_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  echo "    All background dumps complete."

  echo "==> Phase 2: Restoring DEFERRED tables (${DEFERRED_TABLES[*]})..."
  for table in "${DEFERRED_TABLES[@]}"; do
    restore_table "$table"
  done
  echo "==> Phase 2 complete! All tables copied."
fi

echo "==> Done."
echo ""
echo "========================================"
echo "  Replication completed for: $SELECTED_REGION"
echo "  Target host: $REGION"
echo "  Subscription: $SUBSCRIPTION_NAME"
echo "========================================"
echo ""
echo "Check status with:"
echo "psql-17 \"$TARGET_DB_URL\" -c \"SELECT subname, status, received_lsn, last_msg_receipt_time FROM pg_stat_subscription;\""
echo "psql-17 \"$TARGET_DB_URL\" -c \"SELECT srrelid::regclass, srsubstate FROM pg_subscription_rel ORDER BY srrelid::regclass;\""
