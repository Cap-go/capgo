#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load read-replica connection strings from .env.prod
# Supported targets:
# - PlanetScale: PLANETSCALE_*
# - Google: GOOGLE_*
ENV_FILE="$(dirname "$0")/../internal/cloudflare/.env.prod"

if [[ -f "$ENV_FILE" ]]; then
  PLANETSCALE_NA=$(grep '^PLANETSCALE_NA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_EU=$(grep '^PLANETSCALE_EU=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_SA=$(grep '^PLANETSCALE_SA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_OC=$(grep '^PLANETSCALE_OC=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS_INDIA=$(grep '^PLANETSCALE_AS_INDIA=' "$ENV_FILE" | cut -d'=' -f2- || true)
  PLANETSCALE_AS_JAPAN=$(grep '^PLANETSCALE_AS_JAPAN=' "$ENV_FILE" | cut -d'=' -f2- || true)

  GOOGLE_HK=$(grep '^GOOGLE_HK=' "$ENV_FILE" | cut -d'=' -f2- || true)
  GOOGLE_ME=$(grep '^GOOGLE_ME=' "$ENV_FILE" | cut -d'=' -f2- || true)
  GOOGLE_AF=$(grep '^GOOGLE_AF=' "$ENV_FILE" | cut -d'=' -f2- || true)
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Ensure sslrootcert=system is present for libpq when using verify modes.
# Postgres 17+ rejects sslrootcert=system when sslmode is "require" (weak mode).
ensure_sslrootcert_system() {
  local url="$1"
  if [[ "$url" == *"sslmode=require"* ]]; then
    printf "%s" "$url"
    return 0
  fi
  if [[ "$url" == *"sslrootcert="* ]]; then
    printf "%s" "$url"
    return 0
  fi
  if [[ "$url" == *"?"* ]]; then
    printf "%s" "${url}&sslrootcert=system"
  else
    printf "%s" "${url}?sslrootcert=system"
  fi
}

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
echo "Select read replica target:"
echo "  1) PlanetScale NA (North America)"
echo "  2) PlanetScale EU (Europe)"
echo "  3) PlanetScale SA (South America)"
echo "  4) PlanetScale OC (Oceania)"
echo "  5) PlanetScale AS_INDIA (Asia - India)"
echo "  6) PlanetScale AS_JAPAN (Asia - Japan)"
echo "  7) Google HK (Hong Kong)"
echo "  8) Google ME (Middle East)"
echo "  9) Google AF (Africa)"
echo ""
read -rp "Enter choice [1-9]: " REGION_CHOICE

case "$REGION_CHOICE" in
  1) TARGET_DB_URL="$PLANETSCALE_NA"; SELECTED_REGION="PLANETSCALE_NA" ;;
  2) TARGET_DB_URL="$PLANETSCALE_EU"; SELECTED_REGION="PLANETSCALE_EU" ;;
  3) TARGET_DB_URL="$PLANETSCALE_SA"; SELECTED_REGION="PLANETSCALE_SA" ;;
  4) TARGET_DB_URL="$PLANETSCALE_OC"; SELECTED_REGION="PLANETSCALE_OC" ;;
  5) TARGET_DB_URL="$PLANETSCALE_AS_INDIA"; SELECTED_REGION="PLANETSCALE_AS_INDIA" ;;
  6) TARGET_DB_URL="$PLANETSCALE_AS_JAPAN"; SELECTED_REGION="PLANETSCALE_AS_JAPAN" ;;
  7) TARGET_DB_URL="$GOOGLE_HK"; SELECTED_REGION="GOOGLE_HK" ;;
  8) TARGET_DB_URL="$GOOGLE_ME"; SELECTED_REGION="GOOGLE_ME" ;;
  9) TARGET_DB_URL="$GOOGLE_AF"; SELECTED_REGION="GOOGLE_AF" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

if [[ -z "$TARGET_DB_URL" ]]; then
  echo "Error: No connection string for $SELECTED_REGION"
  exit 1
fi

# Google (Cloud SQL) usually can't use sslmode=verify-full with IP hosts out-of-the-box.
if [[ "$SELECTED_REGION" == GOOGLE_* && "$TARGET_DB_URL" == *"sslmode=verify-full"* ]]; then
  echo "==> WARNING: ${SELECTED_REGION} uses sslmode=verify-full with an IP host; this typically fails on Cloud SQL."
  echo "==> Downgrading to sslmode=require (encrypted, no cert verification)."
  TARGET_DB_URL="${TARGET_DB_URL/sslmode=verify-full/sslmode=require}"
fi

TARGET_DB_URL="$(ensure_sslrootcert_system "$TARGET_DB_URL")"

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
