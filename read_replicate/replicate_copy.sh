#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=read_replicate/common.sh
source "${SCRIPT_DIR}/common.sh"

DB_SB="$(load_source_db_url)"

#   --table=channel_devices \
#   --table=apps \
#   --table=app_versions \
#   --table=manifest \
#   --table=channels \
#   --table=orgs \
#   --table=stripe_info \
#   --table=org_users \

echo "==> Dumping channel_devices data from source"
pg_dump-17 --data-only \
  --no-owner --no-privileges \
  --table=channel_devices \
  "$DB_SB" \
  > data_replicate.sql
