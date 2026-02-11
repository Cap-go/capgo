#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Setup Supabase (source) for read-replica replication (PlanetScale + Google)
# Creates/recreates the publication needed for logical replication.
# ============================================================================

echo "==> Setting up Supabase source for read-replica replication..."

# Load source DB URL from .env.prod
ENV_FILE="$(dirname "$0")/../internal/cloudflare/.env.prod"

if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading database connection from $ENV_FILE"
  DB_URL=$(grep '^MAIN_SUPABASE_DB_URL=' "$ENV_FILE" | cut -d'=' -f2-)
  # Convert ssl=false to sslmode=disable for pg compatibility
  DB_URL="${DB_URL//ssl=false/sslmode=disable}"
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Parse connection string to get direct connection (not pooler)
SOURCE_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
SOURCE_PASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:(.*)@[^@]+$|\1|')
_HOST_PORT_DB=$(echo "$DB_URL" | sed -E 's|.*@([^@]+)$|\1|')
SOURCE_HOST=$(echo "$_HOST_PORT_DB" | sed -E 's|([^:]+):.*|\1|')
SOURCE_PORT=$(echo "$_HOST_PORT_DB" | sed -E 's|[^:]+:([0-9]+)/.*|\1|')
SOURCE_DB=$(echo "$_HOST_PORT_DB" | sed -E 's|[^/]+/([^?]+).*|\1|')

# Convert pooler URL to direct connection for logical replication
if [[ "$SOURCE_USER" == postgres.* ]]; then
  PROJECT_ID=$(echo "$SOURCE_USER" | sed -E 's|postgres\.(.+)|\1|')
  SOURCE_HOST="db.${PROJECT_ID}.supabase.co"
  SOURCE_PORT="5432"
  SOURCE_USER="postgres"
  echo "==> Using direct connection: $SOURCE_HOST:$SOURCE_PORT"
elif [[ "$SOURCE_PORT" == "6543" ]]; then
  SOURCE_PORT="5432"
  echo "==> Changed port from 6543 to 5432 for direct connection"
fi

SOURCE_DB_URL="postgresql://${SOURCE_USER}:${SOURCE_PASSWORD}@${SOURCE_HOST}:${SOURCE_PORT}/${SOURCE_DB}?sslmode=require"

# Publication name
PUBLICATION_NAME='planetscale_replicate'

# Tables to include in publication
TABLES=(
  "orgs"
  "stripe_info"
  "org_users"
  "apps"
  "app_versions"
  "channels"
  "channel_devices"
  "manifest"
  "notifications"
)

echo ""
echo "========================================"
echo "  Source: $SOURCE_HOST:$SOURCE_PORT/$SOURCE_DB"
echo "  Publication: $PUBLICATION_NAME"
echo "  Tables: ${TABLES[*]}"
echo "========================================"
echo ""

# ============================================================================
# Step 1: Check/enable logical replication
# ============================================================================
echo "==> Checking wal_level..."
WAL_LEVEL=$(psql-17 "$SOURCE_DB_URL" -t -A -c "SHOW wal_level;")
echo "    Current wal_level: $WAL_LEVEL"

if [[ "$WAL_LEVEL" != "logical" ]]; then
  echo "ERROR: wal_level is not 'logical'. Logical replication requires wal_level=logical."
  echo "On Supabase, this should be enabled by default. Contact support if not."
  exit 1
fi

# ============================================================================
# Step 2: Drop existing publication if exists
# ============================================================================
echo "==> Checking for existing publication..."
EXISTING_PUB=$(psql-17 "$SOURCE_DB_URL" -t -A -c "SELECT pubname FROM pg_publication WHERE pubname = '${PUBLICATION_NAME}';" || true)

if [[ -n "$EXISTING_PUB" ]]; then
  echo "    Found existing publication: $EXISTING_PUB"
  echo "    Dropping it..."
  psql-17 "$SOURCE_DB_URL" -c "DROP PUBLICATION IF EXISTS ${PUBLICATION_NAME};"
  echo "    Dropped."
else
  echo "    No existing publication found."
fi

# ============================================================================
# Step 3: Drop orphaned replication slots (from previous subscriptions)
# ============================================================================
echo "==> Checking for orphaned replication slots..."
psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=0 <<'SQL'
DO $$
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
$$;
SQL

# ============================================================================
# Step 4: Verify tables exist and have REPLICA IDENTITY
# ============================================================================
echo "==> Verifying tables and replica identity..."
for table in "${TABLES[@]}"; do
  # Check table exists
  EXISTS=$(psql-17 "$SOURCE_DB_URL" -t -A -c "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}';" || true)

  if [[ -z "$EXISTS" ]]; then
    echo "    ERROR: Table public.${table} does not exist!"
    exit 1
  fi

  # Check replica identity
  REPLICA_ID=$(psql-17 "$SOURCE_DB_URL" -t -A -c "SELECT relreplident FROM pg_class WHERE relname = '${table}' AND relnamespace = 'public'::regnamespace;")

  case "$REPLICA_ID" in
    d) REPLICA_DESC="DEFAULT (uses primary key)" ;;
    n) REPLICA_DESC="NOTHING (no identity)" ;;
    f) REPLICA_DESC="FULL (entire row)" ;;
    i) REPLICA_DESC="INDEX" ;;
    *) REPLICA_DESC="UNKNOWN ($REPLICA_ID)" ;;
  esac

  # If replica identity is NOTHING, try to set it to DEFAULT (uses PK)
  if [[ "$REPLICA_ID" == "n" ]]; then
    echo "    WARNING: ${table} has REPLICA IDENTITY NOTHING. Attempting to set to DEFAULT..."
    psql-17 "$SOURCE_DB_URL" -c "ALTER TABLE public.${table} REPLICA IDENTITY DEFAULT;" || true
    REPLICA_ID=$(psql-17 "$SOURCE_DB_URL" -t -A -c "SELECT relreplident FROM pg_class WHERE relname = '${table}' AND relnamespace = 'public'::regnamespace;")
    if [[ "$REPLICA_ID" == "d" ]]; then
      REPLICA_DESC="DEFAULT (uses primary key)"
    fi
  fi

  echo "    ${table}: $REPLICA_DESC"
done

# ============================================================================
# Step 5: Create publication with all tables
# ============================================================================
echo "==> Creating publication..."

# Build table list for CREATE PUBLICATION
TABLE_LIST=""
for table in "${TABLES[@]}"; do
  if [[ -n "$TABLE_LIST" ]]; then
    TABLE_LIST="${TABLE_LIST}, "
  fi
  TABLE_LIST="${TABLE_LIST}public.${table}"
done

psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE PUBLICATION ${PUBLICATION_NAME} FOR TABLE ${TABLE_LIST};"
echo "    Publication created."

# ============================================================================
# Step 6: Verify publication
# ============================================================================
echo "==> Verifying publication..."
echo ""
echo "Publication details:"
psql-17 "$SOURCE_DB_URL" -c "SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate FROM pg_publication WHERE pubname = '${PUBLICATION_NAME}';"

echo ""
echo "Tables in publication:"
psql-17 "$SOURCE_DB_URL" -c "SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = '${PUBLICATION_NAME}' ORDER BY tablename;"

echo ""
echo "Current replication slots:"
psql-17 "$SOURCE_DB_URL" -c "SELECT slot_name, slot_type, active, restart_lsn FROM pg_replication_slots WHERE slot_name LIKE 'planetscale_%';" || echo "    (none)"

echo ""
echo "========================================"
echo "  Setup complete!"
echo "  Publication: $PUBLICATION_NAME"
echo "  Tables: ${#TABLES[@]}"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Run ./replicate_prepare.sh to generate schema SQL"
echo "  2. Run ./replicate_to_replica.sh to sync to the read replica (PlanetScale + Google)"
