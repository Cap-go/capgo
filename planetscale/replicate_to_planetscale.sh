#!/usr/bin/env bash
set -euo pipefail

# -------- Config (edit these) --------
# Load PlanetScale connection strings from .env.prod
ENV_FILE="$(dirname "$0")/../internal/cloudflare/.env.prod"
echo "==> Starting replication to PlanetScale..."

if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading PlanetScale connection strings from $ENV_FILE"
  PLANETSCALE_NA=$(grep '^PLANETSCALE_NA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS=$(grep '^PLANETSCALE_AS=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_EU=$(grep '^PLANETSCALE_EU=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_SA=$(grep '^PLANETSCALE_SA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_OC=$(grep '^PLANETSCALE_OC=' "$ENV_FILE" | cut -d'=' -f2- || true)
  echo "==> Loaded PlanetScale connection strings."
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Select which region to use (change this to switch regions)
SELECTED_REGION="PLANETSCALE_SA"
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

# echo "==> Importing schema into target..."
# psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "schema_replicate.sql"

# echo "==> Restoring data into target..."
# pg_restore \
#   --data-only \
#   --no-owner \
#   --no-privileges \
#   --disable-triggers \
#   --dbname "$TARGET_DB_URL" \
#   "$DUMP_FILE"

echo "==> Truncating tables on target before replication..."
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE TABLE
  channel_devices,
  apps,
  app_versions,
  manifest,
  channels,
  orgs,
  stripe_info,
  org_users
RESTART IDENTITY CASCADE;
SQL

echo "==> Reclaiming disk space and rebuilding indexes..."
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
VACUUM FULL channel_devices, apps, app_versions, manifest, channels, orgs, stripe_info, org_users;
REINDEX TABLE channel_devices;
REINDEX TABLE apps;
REINDEX TABLE app_versions;
REINDEX TABLE manifest;
REINDEX TABLE channels;
REINDEX TABLE orgs;
REINDEX TABLE stripe_info;
REINDEX TABLE org_users;
ANALYZE channel_devices, apps, app_versions, manifest, channels, orgs, stripe_info, org_users;
SQL

echo "==> Resetting sequences on target after truncate..."
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  r RECORD;
  seq_name text;
  max_val bigint;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE column_default LIKE 'nextval%'
  LOOP
    seq_name := pg_get_serial_sequence(
      format('%I.%I', r.table_schema, r.table_name),
      r.column_name
    );

    IF seq_name IS NOT NULL THEN
      EXECUTE format(
        'SELECT MAX(%I) FROM %I.%I',
        r.column_name,
        r.table_schema,
        r.table_name
      ) INTO max_val;

      IF max_val IS NULL THEN
        -- Table is empty (after truncate), reset sequence to start at 1
        EXECUTE format('ALTER SEQUENCE %s RESTART WITH 1', seq_name);
        RAISE NOTICE 'Reset sequence % to start at 1 (table empty)', seq_name;
      ELSE
        -- Table has data, set sequence to max value + 1
        EXECUTE format('SELECT setval(%L, %s, true)', seq_name, max_val);
        RAISE NOTICE 'Set sequence % to % (max value)', seq_name, max_val;
      END IF;
    END IF;
  END LOOP;
END
$$;
SQL

echo "==> Dropping existing subscription if exists..."
psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=0 <<SQL
DROP SUBSCRIPTION IF EXISTS ${SUBSCRIPTION_NAME};
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
