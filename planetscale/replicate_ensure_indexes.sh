#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load PlanetScale connection strings from .env.prod
ENV_FILE="$(dirname "$0")/../internal/cloudflare/.env.prod"

if [[ -f "$ENV_FILE" ]]; then
  PLANETSCALE_NA=$(grep '^PLANETSCALE_NA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_EU=$(grep '^PLANETSCALE_EU=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_SA=$(grep '^PLANETSCALE_SA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_OC=$(grep '^PLANETSCALE_OC=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS_INDIA=$(grep '^PLANETSCALE_AS_INDIA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS_JAPAN=$(grep '^PLANETSCALE_AS_JAPAN=' "$ENV_FILE" | cut -d'=' -f2- || true)
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Tables to check
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

# Region selection
echo ""
echo "Select PlanetScale region:"
echo "  1) NA (North America)"
echo "  2) EU (Europe)"
echo "  3) SA (South America)"
echo "  4) OC (Oceania)"
echo "  5) AS_INDIA (Asia - India)"
echo "  6) AS_JAPAN (Asia - Japan)"
echo ""
read -rp "Enter choice [1-6]: " REGION_CHOICE

case "$REGION_CHOICE" in
  1) TARGET_DB_URL="$PLANETSCALE_NA"; SELECTED_REGION="PLANETSCALE_NA" ;;
  2) TARGET_DB_URL="$PLANETSCALE_EU"; SELECTED_REGION="PLANETSCALE_EU" ;;
  3) TARGET_DB_URL="$PLANETSCALE_SA"; SELECTED_REGION="PLANETSCALE_SA" ;;
  4) TARGET_DB_URL="$PLANETSCALE_OC"; SELECTED_REGION="PLANETSCALE_OC" ;;
  5) TARGET_DB_URL="$PLANETSCALE_AS_INDIA"; SELECTED_REGION="PLANETSCALE_AS_INDIA" ;;
  6) TARGET_DB_URL="$PLANETSCALE_AS_JAPAN"; SELECTED_REGION="PLANETSCALE_AS_JAPAN" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

if [[ -z "$TARGET_DB_URL" ]]; then
  echo "Error: No connection string for $SELECTED_REGION"
  exit 1
fi

# Ensure sslrootcert=system is in the URL
if [[ "$TARGET_DB_URL" != *"sslrootcert=system"* ]]; then
  if [[ "$TARGET_DB_URL" == *"?"* ]]; then
    TARGET_DB_URL="${TARGET_DB_URL}&sslrootcert=system"
  else
    TARGET_DB_URL="${TARGET_DB_URL}?sslrootcert=system"
  fi
fi

echo ""
echo "========================================"
echo "  Ensuring indexes for: $SELECTED_REGION"
echo "========================================"
echo ""

# Function to ensure indexes for a table
ensure_indexes() {
  local table_name=$1

  echo "==> Checking indexes for: ${table_name}"

  # Get existing indexes on target
  EXISTING_INDEXES=$(psql-17 "$TARGET_DB_URL" -t -A -c "
    SELECT indexname FROM pg_indexes
    WHERE tablename = '${table_name}' AND schemaname = 'public'
  " | sort)

  # Get expected indexes from schema file
  EXPECTED_INDEXES=$(grep -E "CREATE (UNIQUE )?INDEX.*ON public\.${table_name}" "${SCRIPT_DIR}/schema_replicate.sql" | \
    sed -E 's/.*INDEX ([^ ]+) ON.*/\1/' | sort)

  echo "    Existing: $(echo "$EXISTING_INDEXES" | tr '\n' ' ')"
  echo "    Expected: $(echo "$EXPECTED_INDEXES" | tr '\n' ' ')"

  # Create missing indexes
  MISSING=0
  for idx in $EXPECTED_INDEXES; do
    if ! echo "$EXISTING_INDEXES" | grep -q "^${idx}$"; then
      echo "    MISSING: $idx - creating..."
      MISSING=1

      # Extract the full index definition
      idx_sql=$(awk "/CREATE (UNIQUE )?INDEX ${idx} ON/,/;/" "${SCRIPT_DIR}/schema_replicate.sql" | tr '\n' ' ')

      if [[ -n "$idx_sql" ]]; then
        psql-17 "$TARGET_DB_URL" -c "$idx_sql" 2>&1 || echo "      Failed to create $idx"
      fi
    fi
  done

  if [[ $MISSING -eq 0 ]]; then
    echo "    All indexes present ✓"
  fi
  echo ""
}

# Check all tables
for table in "${TABLES[@]}"; do
  ensure_indexes "$table"
done

echo "========================================"
echo "  Done checking indexes for: $SELECTED_REGION"
echo "========================================"
