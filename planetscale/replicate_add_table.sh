#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Add a new table to existing PlanetScale replication
# Usage: ./replicate_add_table.sh <table_name>
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <table_name>"
  echo "Example: $0 notifications"
  exit 1
fi

TABLE_NAME="$1"
DUMP_DIR="${SCRIPT_DIR}/dumps"
mkdir -p "$DUMP_DIR"

echo "==> Adding table '${TABLE_NAME}' to PlanetScale replication..."

# -------- Load Config --------
ENV_FILE="${SCRIPT_DIR}/../internal/cloudflare/.env.prod"

if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading connection strings from $ENV_FILE"
  PLANETSCALE_NA=$(grep '^PLANETSCALE_NA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_EU=$(grep '^PLANETSCALE_EU=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_SA=$(grep '^PLANETSCALE_SA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_OC=$(grep '^PLANETSCALE_OC=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS_INDIA=$(grep '^PLANETSCALE_AS_INDIA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS_JAPAN=$(grep '^PLANETSCALE_AS_JAPAN=' "$ENV_FILE" | cut -d'=' -f2- || true)
  DB_URL=$(grep '^MAIN_SUPABASE_DB_URL=' "$ENV_FILE" | cut -d'=' -f2-)
  DB_URL="${DB_URL//ssl=false/sslmode=disable}"
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Parse source connection
SOURCE_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
SOURCE_PASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:(.*)@[^@]+$|\1|')
_HOST_PORT_DB=$(echo "$DB_URL" | sed -E 's|.*@([^@]+)$|\1|')
SOURCE_HOST=$(echo "$_HOST_PORT_DB" | sed -E 's|([^:]+):.*|\1|')
SOURCE_PORT=$(echo "$_HOST_PORT_DB" | sed -E 's|[^:]+:([0-9]+)/.*|\1|')
SOURCE_DB=$(echo "$_HOST_PORT_DB" | sed -E 's|[^/]+/([^?]+).*|\1|')

# Convert pooler URL to direct connection
if [[ "$SOURCE_USER" == postgres.* ]]; then
  PROJECT_ID=$(echo "$SOURCE_USER" | sed -E 's|postgres\.(.+)|\1|')
  SOURCE_HOST="db.${PROJECT_ID}.supabase.co"
  SOURCE_PORT="5432"
  SOURCE_USER="postgres"
elif [[ "$SOURCE_PORT" == "6543" ]]; then
  SOURCE_PORT="5432"
fi

SOURCE_DB_URL="postgresql://${SOURCE_USER}:${SOURCE_PASSWORD}@${SOURCE_HOST}:${SOURCE_PORT}/${SOURCE_DB}?sslmode=require"
PUBLICATION_NAME='planetscale_replicate'

# -------- Region Selection --------
echo ""
echo "Select PlanetScale region:"
echo "  1) NA (North America)"
echo "  2) EU (Europe)"
echo "  3) SA (South America)"
echo "  4) OC (Oceania)"
echo "  5) AS_INDIA (Asia - India)"
echo "  6) AS_JAPAN (Asia - Japan)"
echo "  7) ALL regions"
echo ""
read -rp "Enter choice [1-7]: " REGION_CHOICE

REGIONS=()
case "$REGION_CHOICE" in
  1) REGIONS=("PLANETSCALE_NA") ;;
  2) REGIONS=("PLANETSCALE_EU") ;;
  3) REGIONS=("PLANETSCALE_SA") ;;
  4) REGIONS=("PLANETSCALE_OC") ;;
  5) REGIONS=("PLANETSCALE_AS_INDIA") ;;
  6) REGIONS=("PLANETSCALE_AS_JAPAN") ;;
  7) REGIONS=("PLANETSCALE_NA" "PLANETSCALE_EU" "PLANETSCALE_SA" "PLANETSCALE_OC" "PLANETSCALE_AS_INDIA" "PLANETSCALE_AS_JAPAN") ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

# ============================================================================
# Step 1: Check if table exists in source
# ============================================================================
echo "==> Checking if table '${TABLE_NAME}' exists in source..."
TABLE_EXISTS=$(psql-17 "$SOURCE_DB_URL" -t -A -c "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${TABLE_NAME}';" || true)

if [[ -z "$TABLE_EXISTS" ]]; then
  echo "ERROR: Table public.${TABLE_NAME} does not exist in source database!"
  exit 1
fi
echo "    Table exists."

# ============================================================================
# Step 2: Add table to publication (if not already there)
# ============================================================================
echo "==> Checking publication..."
IN_PUBLICATION=$(psql-17 "$SOURCE_DB_URL" -t -A -c "SELECT 1 FROM pg_publication_tables WHERE pubname = '${PUBLICATION_NAME}' AND tablename = '${TABLE_NAME}';" || true)

if [[ -z "$IN_PUBLICATION" ]]; then
  echo "    Adding table to publication..."
  psql-17 "$SOURCE_DB_URL" -c "ALTER PUBLICATION ${PUBLICATION_NAME} ADD TABLE public.${TABLE_NAME};"
  echo "    Done."
else
  echo "    Table already in publication."
fi

# ============================================================================
# Step 3: Export data from source
# ============================================================================
DUMP_FILE="${DUMP_DIR}/${TABLE_NAME}.csv.gz"
echo "==> Exporting data from source..."
psql-17 "$SOURCE_DB_URL" -c "\\COPY public.${TABLE_NAME} TO STDOUT WITH (FORMAT csv, HEADER)" | gzip > "$DUMP_FILE"
ROW_COUNT=$(gunzip -c "$DUMP_FILE" | wc -l | tr -d ' ')
ROW_COUNT=$((ROW_COUNT - 1))  # Subtract header
echo "    Exported ${ROW_COUNT} rows to ${DUMP_FILE}"

# ============================================================================
# Step 4: Get table schema from source
# ============================================================================
echo "==> Extracting table schema..."
SCHEMA_FILE="${DUMP_DIR}/${TABLE_NAME}_schema.sql"

# Get CREATE TABLE statement
psql-17 "$SOURCE_DB_URL" -t -A -c "
SELECT 'CREATE TABLE public.${TABLE_NAME} (' || string_agg(
  column_name || ' ' ||
  data_type ||
  CASE WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')' ELSE '' END ||
  CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
  CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
  ', ' ORDER BY ordinal_position
) || ');'
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '${TABLE_NAME}';
" > "$SCHEMA_FILE"

# Add REPLICA IDENTITY FULL
echo "ALTER TABLE ONLY public.${TABLE_NAME} REPLICA IDENTITY FULL;" >> "$SCHEMA_FILE"

# Get primary key
PK_COLUMNS=$(psql-17 "$SOURCE_DB_URL" -t -A -c "
SELECT string_agg(a.attname, ', ' ORDER BY array_position(i.indkey, a.attnum))
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE i.indrelid = 'public.${TABLE_NAME}'::regclass AND i.indisprimary;
")

if [[ -n "$PK_COLUMNS" ]]; then
  echo "ALTER TABLE ONLY public.${TABLE_NAME} ADD CONSTRAINT ${TABLE_NAME}_pkey PRIMARY KEY (${PK_COLUMNS});" >> "$SCHEMA_FILE"
fi

# Get indexes (non-primary key)
psql-17 "$SOURCE_DB_URL" -t -A -c "
SELECT pg_get_indexdef(i.indexrelid) || ';'
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid = 'public.${TABLE_NAME}'::regclass
  AND NOT i.indisprimary
  AND c.relname NOT LIKE '%_pkey';
" >> "$SCHEMA_FILE"

echo "    Schema saved to ${SCHEMA_FILE}"

# ============================================================================
# Step 5: Process each region
# ============================================================================
for REGION_VAR in "${REGIONS[@]}"; do
  DB_T="${!REGION_VAR}"

  if [[ -z "$DB_T" ]]; then
    echo "==> WARNING: ${REGION_VAR} not configured, skipping..."
    continue
  fi

  TARGET_DB_URL="${DB_T}&sslrootcert=system"

  # Extract region name from host
  host=${DB_T#*@}
  host=${host%%:*}
  REGION=${host%%.*}
  REGION="${REGION//-/_}"
  SUBSCRIPTION_NAME="planetscale_subscription_${REGION}"

  echo ""
  echo "========================================"
  echo "  Processing region: ${REGION_VAR}"
  echo "  Subscription: ${SUBSCRIPTION_NAME}"
  echo "========================================"

  # Check if table already exists on target
  TABLE_EXISTS_TARGET=$(psql-17 "$TARGET_DB_URL" -t -A -c "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${TABLE_NAME}';" 2>/dev/null || true)

  if [[ -n "$TABLE_EXISTS_TARGET" ]]; then
    echo "==> Table already exists on target. Truncating..."
    psql-17 "$TARGET_DB_URL" -c "TRUNCATE TABLE public.${TABLE_NAME};"
  else
    echo "==> Creating table on target..."
    psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"
  fi

  # Import data
  echo "==> Importing data..."
  gunzip -c "$DUMP_FILE" | psql-17 "$TARGET_DB_URL" -c "\\COPY public.${TABLE_NAME} FROM STDIN WITH (FORMAT csv, HEADER)"

  IMPORTED_COUNT=$(psql-17 "$TARGET_DB_URL" -t -A -c "SELECT COUNT(*) FROM public.${TABLE_NAME};")
  echo "    Imported ${IMPORTED_COUNT} rows."

  # Refresh subscription
  echo "==> Refreshing subscription..."
  psql-17 "$TARGET_DB_URL" -v ON_ERROR_STOP=0 -c "ALTER SUBSCRIPTION ${SUBSCRIPTION_NAME} REFRESH PUBLICATION;"

  # Verify subscription includes the table
  echo "==> Verifying subscription..."
  psql-17 "$TARGET_DB_URL" -c "SELECT srrelid::regclass, srsubstate FROM pg_subscription_rel WHERE srrelid::regclass::text = '${TABLE_NAME}' ORDER BY srrelid::regclass;"

  echo "==> Done with ${REGION_VAR}"
done

echo ""
echo "========================================"
echo "  Table '${TABLE_NAME}' added to replication"
echo "========================================"
echo ""
echo "Verify with:"
echo "  psql-17 \"\$TARGET_DB_URL\" -c \"SELECT srrelid::regclass, srsubstate FROM pg_subscription_rel ORDER BY srrelid::regclass;\""
