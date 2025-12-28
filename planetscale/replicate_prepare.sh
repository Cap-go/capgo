#!/usr/bin/env bash
set -euo pipefail
# https://planetscale.com/docs/postgres/imports/postgres-migrate-walstream
# CREATE PUBLICATION planetscale_replicate FOR TABLE
#      apps, app_versions, manifest, channels, channel_devices, orgs, stripe_info, org_users;

DUMP_FILE="schema_replicate.dump"
LIST_FILE="schema_replicate.list"
FILTERED_LIST="schema_replicate.filtered.list"
OUT_SQL="schema_replicate.sql"

# Load DB_SB from .env.preprod
ENV_FILE="$(dirname "$0")/../internal/cloudflare/.env.preprod"
if [[ -f "$ENV_FILE" ]]; then
  DB_SB=$(grep '^MAIN_SUPABASE_DB_URL=' "$ENV_FILE" | cut -d'=' -f2-)
  # Convert ssl=false to sslmode=disable for pg_dump compatibility
  DB_SB="${DB_SB//ssl=false/sslmode=disable}"
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi
echo "==> Using target database for region: $DB_SB"
# 1) Dump schema in custom format (includes everything, but we will filter on restore)
# Include custom types and tables
pg_dump-17 -Fc --schema-only \
  --no-owner --no-privileges --no-comments \
  --table=channel_devices \
  --table=apps \
  --table=app_versions \
  --table=manifest \
  --table=channels \
  --table=orgs \
  --table=stripe_info \
  --table=org_users \
  "$DB_SB" > "$DUMP_FILE"

# Also dump custom types (they're not included with --table flag)
TYPES_DUMP="types_replicate.dump"
pg_dump-17 -Fc --schema-only \
  --no-owner --no-privileges --no-comments \
  "$DB_SB" > "$TYPES_DUMP" 2>/dev/null || true

# 2) Create restore list
pg_restore-17 -l "$DUMP_FILE" > "$LIST_FILE"

# 3) Filter out things you DON'T want, keep indexes
#    - FK CONSTRAINT: remove foreign keys
#    - TRIGGER: remove triggers
#    - POLICY: remove RLS policies
#    - ROW SECURITY: removes ALTER TABLE ... ENABLE ROW LEVEL SECURITY (wording varies by pg_dump version)
perl -ne '
  next if /\bFK CONSTRAINT\b/;
  next if /\bTRIGGER\b/;
  next if /\bPOLICY\b/;
  next if /\bROW SECURITY\b/;
  print;
' "$LIST_FILE" > "$FILTERED_LIST"

# 4) Restore to SQL using the filtered list (this includes indexes)
pg_restore-17 -f - --no-owner --no-privileges --no-comments \
  -L "$FILTERED_LIST" \
  "$DUMP_FILE" > "$OUT_SQL"

# 4b) Extract and add custom types and required functions from full dump
if [[ -f "$TYPES_DUMP" ]]; then
  echo "==> Extracting custom types and functions..."
  TYPES_LIST="types_replicate.list"
  TYPES_FILTERED_LIST="types_replicate.filtered.list"
  TYPES_SQL="types_replicate.sql"
  
  # Create restore list for types dump
  pg_restore-17 -l "$TYPES_DUMP" > "$TYPES_LIST" 2>/dev/null || true
  
  # Filter to only include the types and functions we need
  if [[ -f "$TYPES_LIST" ]]; then
    # Extract types
    grep -E '\bTYPE\b' "$TYPES_LIST" | \
      grep -E 'manifest_entry|disable_update|user_min_right|stripe_status' > "$TYPES_FILTERED_LIST" || true
    
    # Also extract the one_month_ahead function (required by stripe_info table)
    grep -E '\bFUNCTION\b' "$TYPES_LIST" | \
      grep -E 'one_month_ahead' >> "$TYPES_FILTERED_LIST" || true
    
    if [[ -s "$TYPES_FILTERED_LIST" ]]; then
      # Restore only the filtered types and functions to SQL
      pg_restore-17 -f - --no-owner --no-privileges --no-comments \
        -L "$TYPES_FILTERED_LIST" \
        "$TYPES_DUMP" > "$TYPES_SQL" 2>/dev/null || true
      
      if [[ -s "$TYPES_SQL" ]]; then
        # Prepend types and functions to output SQL
        cat "$TYPES_SQL" "$OUT_SQL" > "${OUT_SQL}.tmp"
        mv "${OUT_SQL}.tmp" "$OUT_SQL"
        echo "==> Added custom types and functions to SQL file"
      fi
    fi
    rm -f "$TYPES_LIST" "$TYPES_FILTERED_LIST" "$TYPES_SQL"
  fi
  rm -f "$TYPES_DUMP"
fi

# 5) Prepend extension(s) and create extensions schema compatibility
perl -0777 -i -pe 's/\A/CREATE SCHEMA IF NOT EXISTS extensions;\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;\n\n/' "$OUT_SQL"

# 6) Optional: drop pg_dump SET noise
perl -0777 -i -pe '
  s/^SET[^\n]*\n//mg;
  s/^SELECT pg_catalog\.set_config\([^\n]*\);\n//mg;
' "$OUT_SQL"

# 7) Sanity checks (should be empty; indexes should still exist)
echo "==> Should be empty:"
grep -nE 'CREATE POLICY|ROW LEVEL SECURITY|FK CONSTRAINT|FOREIGN KEY|CREATE TRIGGER' "$OUT_SQL" || true

echo "==> Index count:"
grep -cE '^\s*CREATE (UNIQUE )?INDEX\b' "$OUT_SQL" || true

# 8) Cleanup temporary files
echo "==> Cleaning up temporary files..."
rm -f "$DUMP_FILE" "$LIST_FILE" "$FILTERED_LIST" "$TYPES_DUMP" "$TYPES_SQL" 2>/dev/null || true
echo "==> Done. Output: $OUT_SQL"
