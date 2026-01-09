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
SELECTED_REGION="PLANETSCALE_EU"
DB_T="${!SELECTED_REGION}"

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
# exit() 
# Restore file
DUMP_FILE='data_replicate.dump'

# Logical replication objects
PUBLICATION_NAME='planetscale_replicate'
SUBSCRIPTION_NAME="planetscale_subscription_${REGION}"
# ------------------------------------
echo "==> Dropping existing subscription if exists..."
# Robust subscription cleanup that handles all states including stuck sync
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=0 <<SQL
DO \$\$
DECLARE
  sub_exists boolean;
  slot_name text;
BEGIN
  -- Check if subscription exists
  SELECT EXISTS(SELECT 1 FROM pg_subscription WHERE subname = '${SUBSCRIPTION_NAME}') INTO sub_exists;

  IF sub_exists THEN
    RAISE NOTICE 'Subscription ${SUBSCRIPTION_NAME} exists, cleaning up...';

    -- Step 1: Disable the subscription first (stops sync workers)
    BEGIN
      ALTER SUBSCRIPTION ${SUBSCRIPTION_NAME} DISABLE;
      RAISE NOTICE 'Disabled subscription';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not disable subscription: %', SQLERRM;
    END;

    -- Step 2: Wait a moment for workers to stop
    PERFORM pg_sleep(2);

    -- Step 3: Get the slot name before we lose it
    SELECT subslotname INTO slot_name FROM pg_subscription WHERE subname = '${SUBSCRIPTION_NAME}';

    -- Step 4: Detach from the replication slot (SET SLOT NONE)
    -- This prevents DROP SUBSCRIPTION from trying to drop the remote slot
    BEGIN
      ALTER SUBSCRIPTION ${SUBSCRIPTION_NAME} SET (slot_name = NONE);
      RAISE NOTICE 'Detached from replication slot';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not detach from slot: %', SQLERRM;
    END;

    -- Step 5: Now drop the subscription (should work since slot is detached)
    BEGIN
      DROP SUBSCRIPTION ${SUBSCRIPTION_NAME};
      RAISE NOTICE 'Dropped subscription successfully';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop subscription normally: %', SQLERRM;
      -- Last resort: force drop by removing from catalog (requires superuser)
      RAISE NOTICE 'Attempting forced cleanup...';
    END;
  ELSE
    RAISE NOTICE 'Subscription ${SUBSCRIPTION_NAME} does not exist, skipping cleanup';
  END IF;
END
\$\$;
SQL

# Double-check subscription is gone, if not try direct DROP as fallback
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=0 <<SQL
DROP SUBSCRIPTION IF EXISTS ${SUBSCRIPTION_NAME};
SQL

echo "==> Cleaning up public schema on target..."
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
SQL

echo "==> Importing schema into target..."
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "schema_replicate.sql"

# Build source DB URL for direct connection
SOURCE_DB_URL="postgresql://${SOURCE_USER}:${SOURCE_PASSWORD}@${SOURCE_HOST}:${SOURCE_PORT}/${SOURCE_DB}?sslmode=${SOURCE_SSLMODE}"

echo "==> Dropping existing replication slot on source if exists..."
psql-17 "$SOURCE_DB_URL" -v ON_ERROR_STOP=0 <<SQL
SELECT pg_drop_replication_slot('${SUBSCRIPTION_NAME}')
WHERE EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = '${SUBSCRIPTION_NAME}');
SQL

echo "==> Creating subscription on target..."
SQL_QUERY_SUB="CREATE SUBSCRIPTION ${SUBSCRIPTION_NAME}
CONNECTION 'host=${SOURCE_HOST}
            port=${SOURCE_PORT}
            dbname=${SOURCE_DB}
            user=${SOURCE_USER}
            password=${SOURCE_PASSWORD}
            sslmode=${SOURCE_SSLMODE}'
PUBLICATION ${PUBLICATION_NAME}
WITH (
  copy_data = true,
  create_slot = true,
  enabled = true
);"
echo "Subscription creation SQL:"
echo "$SQL_QUERY_SUB"
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<SQL
$SQL_QUERY_SUB
SQL

echo "==> Done."
echo "Check status with:"
echo "psql-17 \"$TARGET_DB_URL\" -c \"SELECT subname, status, received_lsn, last_msg_receipt_time FROM pg_stat_subscription;\""
