#!/usr/bin/env bash
set -euo pipefail
set -o pipefail

ENV_FILE="$(dirname "$0")/../internal/cloudflare/.env.prod"

if [[ -n "${READ_REPLICA_PASSWORD:-}" ]]; then
  NEW_PASSWORD="$READ_REPLICA_PASSWORD"
  echo "Using password from READ_REPLICA_PASSWORD."
elif [[ $# -eq 1 ]]; then
  NEW_PASSWORD="$1"
  echo "Using password from positional argument."
elif [[ $# -gt 1 ]]; then
  echo "Usage: $0 [new_source_password]"
  echo "       or set READ_REPLICA_PASSWORD=... $0"
  exit 1
else
  if [[ ! -t 0 ]]; then
    echo "Please run this script in a terminal or provide READ_REPLICA_PASSWORD / argument."
    exit 1
  fi

  read -r -s -p "Enter new source password for logical replication: " NEW_PASSWORD
  echo

  if [[ -z "$NEW_PASSWORD" ]]; then
    echo "Error: password cannot be empty."
    exit 1
  fi
fi

if [[ -t 0 && -z "${AUTO_CONFIRM:-}" ]]; then
  read -r -p "Proceed with updating replication subscriptions now? [y/N]: " CONFIRM_START
  case "$CONFIRM_START" in
    y|Y|yes|YES)
      :
      ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

if [[ -z "$NEW_PASSWORD" ]]; then
  echo "Error: password cannot be empty."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

get_env_value() {
  local key="$1"
  local line

  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" ]] && continue
    [[ "${line:0:1}" == "#" ]] && continue
    if [[ "$line" == "${key}="* ]]; then
      echo "${line#*=}"
      return 0
    fi
  done < "$ENV_FILE"

  return 1
}

ensure_sslrootcert_system() {
  local url="$1"
  if [[ "$url" == *"sslmode=verify-full"* || "$url" == *"sslmode=verify-ca"* ]]; then
    if [[ "$url" == *"sslrootcert="* ]]; then
      printf "%s" "$url"
    elif [[ "$url" == *"?"* ]]; then
      printf "%s&sslrootcert=system" "$url"
    else
      printf "%s?sslrootcert=system" "$url"
    fi
    return
  fi
  printf "%s" "$url"
}

ensure_connect_timeout() {
  local url="$1"
  local timeout="${2:-10}"

  if [[ "$url" == *"connect_timeout="* ]]; then
    printf "%s" "$url"
  elif [[ "$url" == *"?"* ]]; then
    printf "%s&connect_timeout=%s" "$url" "$timeout"
  else
    printf "%s?connect_timeout=%s" "$url" "$timeout"
  fi
}

extract_host() {
  local url="$1"
  echo "$url" | sed -E 's|.*@([^/:?]+).*|\1|'
}

# Read source (publisher) DB and build the connection string used by the subscription
if ! DB_URL="$(get_env_value "MAIN_SUPABASE_DB_URL")"; then
  echo "Error: MAIN_SUPABASE_DB_URL not set in $ENV_FILE"
  exit 1
fi

DB_URL="${DB_URL//ssl=false/sslmode=disable}"

SOURCE_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
_HOST_PORT_DB=$(echo "$DB_URL" | sed -E 's|.*@([^@]+)$|\1|')
SOURCE_HOST=$(echo "$_HOST_PORT_DB" | sed -E 's|([^:]+):.*|\1|')
SOURCE_PORT=$(echo "$_HOST_PORT_DB" | sed -E 's|[^:]+:([0-9]+)/.*|\1|')
SOURCE_DB=$(echo "$_HOST_PORT_DB" | sed -E 's|[^/]+/([^?]+).*|\1|')

if [[ "$SOURCE_USER" == postgres.* ]]; then
  PROJECT_ID=$(echo "$SOURCE_USER" | sed -E 's|postgres\.(.+)|\1|')
  SOURCE_HOST="db.${PROJECT_ID}.supabase.co"
  SOURCE_PORT="5432"
  SOURCE_USER="postgres"
fi
if [[ "$SOURCE_PORT" == "6543" ]]; then
  SOURCE_PORT="5432"
fi

SOURCE_SSLMODE='require'

NEW_CONNECTION_STRING="host=${SOURCE_HOST} port=${SOURCE_PORT} dbname=${SOURCE_DB} user=${SOURCE_USER} password=${NEW_PASSWORD} sslmode=${SOURCE_SSLMODE} connect_timeout=10 keepalives=1 keepalives_idle=10 keepalives_interval=5 keepalives_count=3"
SAFE_CONNECTION_STRING="${NEW_CONNECTION_STRING//\'/''}"

check_subscription() {
  local region="$1"
  local url="$2"
  local result_file="$3"

  if [[ "$url" != postgresql://* ]]; then
    echo "[$region] Skipping (invalid URL)"
    printf '%s\n' "skip|$region|invalid_url||" > "$result_file"
    return 0
  fi

  local connect_url
  local host
  local region_prefix
  local sub_region
  local subscription_name
  local sub_exists_output

  echo "[$region] Checking replication target..."
  connect_url="$(ensure_sslrootcert_system "$url")"
  connect_url="$(ensure_connect_timeout "$connect_url" 10)"
  host="$(extract_host "$url")"

  if [[ "$region" == GOOGLE_* && "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    region_prefix="google_${region#GOOGLE_}"
  else
    region_prefix="${host%%.*}"
  fi

  sub_region="${region_prefix//-/_}"
  sub_region="${sub_region//[^A-Za-z0-9_]/_}"
  sub_region="$(printf '%s' "$sub_region" | tr '[:upper:]' '[:lower:]')"
  subscription_name="planetscale_subscription_${sub_region}"

  if ! sub_exists_output=$(PGCONNECT_TIMEOUT=10 psql-17 "$connect_url" -tA -c "SELECT 1 FROM pg_subscription WHERE subname = '${subscription_name}';" 2>&1); then
    echo "[$region] Warning: failed querying subscription '$subscription_name'"
    printf '[%s] %s\n' "$region" "$sub_exists_output"
    printf '%s\n' "skip|$region|query_failed|$connect_url|$subscription_name" > "$result_file"
    return 0
  fi

  if [[ -z "$sub_exists_output" ]]; then
    echo "[$region] Skipping (no subscription '$subscription_name' on target)"
    printf '%s\n' "skip|$region|missing|$connect_url|$subscription_name" > "$result_file"
    return 0
  fi

  echo "[$region] Found subscription '$subscription_name'"
  printf '%s\n' "ok|$region|$connect_url|$subscription_name" > "$result_file"
}

DISCOVERY_DIR="${READ_REPLICA_DISCOVERY_DIR:-$(mktemp -d)}"
if [[ -z "${READ_REPLICA_DISCOVERY_DIR:-}" ]]; then
  trap 'rm -rf "$DISCOVERY_DIR"' EXIT
fi

psql_updates=()
declare -a check_pids=()
declare -a check_result_files=()

for region in \
  PLANETSCALE_NA PLANETSCALE_EU PLANETSCALE_SA \
  PLANETSCALE_OC PLANETSCALE_AS_INDIA PLANETSCALE_AS_JAPAN \
  GOOGLE_HK GOOGLE_ME GOOGLE_AF; do
  if ! url="$(get_env_value "$region")"; then
    echo "Skipping $region (not set)"
    continue
  fi

  result_file="$DISCOVERY_DIR/${region}.result"
  check_subscription "$region" "$url" "$result_file" &
  check_pids+=("$!")
  check_result_files+=("$result_file")
done

for pid in "${check_pids[@]}"; do
  wait "$pid"
done

for result_file in "${check_result_files[@]}"; do
  [[ -f "$result_file" ]] || continue
  IFS='|' read -r status region connect_url subscription_name < "$result_file"
  if [[ "$status" == "ok" ]]; then
    psql_updates+=("$region|$connect_url|$subscription_name")
  fi
done

if [[ ${#psql_updates[@]} -eq 0 ]]; then
  echo "No target subscriptions found to update."
  exit 0
fi

echo "Will update ${#psql_updates[@]} subscription(s) in parallel."

update_subscription() {
  local region="$1"
  local connect_url="$2"
  local subscription_name="$3"
  local connection_string="$4"

  {
    echo "Updating logical replication subscription '$subscription_name' for $region..."
    echo "  step 1/3: disable subscription"
    PGCONNECT_TIMEOUT=10 psql-17 "$connect_url" -q -v ON_ERROR_STOP=1 -c "ALTER SUBSCRIPTION ${subscription_name} DISABLE;"
    echo "  step 2/3: update source connection string"
    PGCONNECT_TIMEOUT=10 psql-17 "$connect_url" -q -v ON_ERROR_STOP=1 -c "ALTER SUBSCRIPTION ${subscription_name} CONNECTION '${connection_string}';"
    echo "  step 3/3: enable subscription"
    PGCONNECT_TIMEOUT=10 psql-17 "$connect_url" -q -v ON_ERROR_STOP=1 -c "ALTER SUBSCRIPTION ${subscription_name} ENABLE;"
    echo "Completed update for '$subscription_name' on $region"
  } 2>&1 | sed "s/^/[${subscription_name}] /"
}

declare -a update_pids=()
declare -a update_regions=()

for entry in "${psql_updates[@]}"; do
  region="${entry%%|*}"
  rest="${entry#*|}"
  connect_url="${rest%%|*}"
  subscription_name="${rest##*|}"

  echo "Queueing $region -> $subscription_name"
  update_regions+=("$region")

  update_subscription "$region" "$connect_url" "$subscription_name" "$SAFE_CONNECTION_STRING" &
  update_pids+=("$!")
done

failed=0
for idx in "${!update_pids[@]}"; do
  pid="${update_pids[$idx]}"
  region="${update_regions[$idx]}"

  if ! wait "$pid"; then
    echo "❌ Failed to update subscription for $region"
    failed=1
  else
    echo "✅ Updated subscription for $region"
  fi
done

if [[ $failed -ne 0 ]]; then
  exit 1
fi

echo "Done."
