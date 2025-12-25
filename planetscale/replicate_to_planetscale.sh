#!/usr/bin/env bash
set -euo pipefail

# -------- Config (edit these) --------
# Load PlanetScale connection strings from .env.preprod
ENV_FILE="$(dirname "$0")/../internal/cloudflare/.env.preprod"
if [[ -f "$ENV_FILE" ]]; then
  PLANETSCALE_US=$(grep '^PLANETSCALE_US=' "$ENV_FILE" | cut -d'=' -f2-)
  PLANETSCALE_AS=$(grep '^PLANETSCALE_AS=' "$ENV_FILE" | cut -d'=' -f2-)
  PLANETSCALE_EU=$(grep '^PLANETSCALE_EU=' "$ENV_FILE" | cut -d'=' -f2-)
  PLANETSCALE_SA=$(grep '^PLANETSCALE_SA=' "$ENV_FILE" | cut -d'=' -f2-)
  PLANETSCALE_OC=$(grep '^PLANETSCALE_OC=' "$ENV_FILE" | cut -d'=' -f2-)
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Select which region to use (change this to switch regions)
DB_T="$PLANETSCALE_OC"

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
# Extract components from URL
SOURCE_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
SOURCE_PASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
SOURCE_HOST=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@([^:]+):.*|\1|')
SOURCE_PORT=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@[^:]+:([0-9]+)/.*|\1|')
SOURCE_DB=$(echo "$DB_URL" | sed -E 's|postgresql://[^/]+/([^?]+).*|\1|')
SOURCE_SSLMODE='require'

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

echo "==> Fixing sequences on target..."
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  r RECORD;
  seq_name text;
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
        'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1), true)',
        seq_name,
        r.column_name,
        r.table_schema,
        r.table_name
      );
    END IF;
  END LOOP;
END
$$;
SQL

echo "==> Creating subscription on target..."
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE SUBSCRIPTION ${SUBSCRIPTION_NAME}
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
  enabled = true,
  max_sync_workers_per_subscription = 1
);
SQL

echo "==> Done."
echo "Check status with:"
echo "psql \"$TARGET_DB_URL\" -c \"SELECT subname, status, received_lsn, last_msg_receipt_time FROM pg_stat_subscription;\""
