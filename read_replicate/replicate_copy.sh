#!/usr/bin/env bash
set -euo pipefail

# https://planetscale.com/docs/postgres/imports/postgres-migrate-walstream


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

#   --table=channel_devices \
#   --table=apps \
#   --table=app_versions \
#   --table=manifest \
#   --table=channels \
#   --table=orgs \
#   --table=stripe_info \
#   --table=org_users \

echo "==> Using target database for region: $DB_SB"
pg_dump-17 --data-only \
  --no-owner --no-privileges \
  --table=channel_devices \
  "$DB_SB" \
  > data_replicate.sql
