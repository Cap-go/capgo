#!/usr/bin/env bash
set -euo pipefail

# Update Supabase DB network restrictions with current Cloudflare IP ranges.
# By default this REPLACES existing restrictions with Cloudflare IPv4 + IPv6 ranges.
# Use --append to keep existing restrictions and add Cloudflare ranges.

CF_IPS_URL="https://api.cloudflare.com/client/v4/ips"
ENV_FILE="internal/cloudflare/.env.prod"
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
PROFILE="${SUPABASE_PROFILE:-}"
APPEND="false"
DRY_RUN="false"
YES="false"
INCLUDE_IPV4="true"
INCLUDE_IPV6="true"
EXTRA_CIDRS_TEXT=""

usage() {
  cat <<'EOF'
Usage:
  scripts/update_supabase_network_restrictions.sh [options]

Updates Supabase database network restrictions to allow Cloudflare IP ranges.
This is the firewall control needed when Postgres should only be reachable from
Cloudflare Hyperdrive and other Cloudflare egress.

Default behavior:
  - Replaces existing database allowed CIDRs with Cloudflare IPv4 + IPv6 ranges.
  - Parses the Supabase project ref from SUPABASE_PROJECT_REF or the env file.

Options:
  --project-ref <ref>    Supabase project ref. Defaults to SUPABASE_PROJECT_REF
                         or parses MAIN_SUPABASE_DB_URL / SUPABASE_URL from env.
  --env-file <path>      Env file to parse when --project-ref is omitted
                         (default: internal/cloudflare/.env.prod).
  --profile <name>       Supabase CLI profile.
  --append               Append Cloudflare ranges instead of replacing existing restrictions.
  --ipv4-only            Only apply Cloudflare IPv4 CIDRs.
  --ipv6-only            Only apply Cloudflare IPv6 CIDRs.
  --extra-cidr <cidr>    Add one extra CIDR. Can be repeated.
  --cloudflare-url <url> Override Cloudflare IP API URL
                         (default: https://api.cloudflare.com/client/v4/ips).
  --dry-run              Print commands without executing them.
  --yes                  Skip confirmation prompt.
  -h, --help             Show this help.

Examples:
  scripts/update_supabase_network_restrictions.sh --dry-run
  scripts/update_supabase_network_restrictions.sh --project-ref xvwzpoazmxkqosrdewyv --yes
  scripts/update_supabase_network_restrictions.sh --project-ref xvwzpoazmxkqosrdewyv --append --extra-cidr 203.0.113.10/32
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' is not installed." >&2
    exit 1
  fi
}

require_arg() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    echo "Error: $flag requires a value." >&2
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  local line

  [[ -f "$ENV_FILE" ]] || return 1

  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" ]] && continue
    [[ "${line:0:1}" == "#" ]] && continue
    if [[ "$line" == "${key}="* ]]; then
      printf "%s\n" "${line#*=}"
      return 0
    fi
  done < "$ENV_FILE"

  return 1
}

extract_project_ref_from_url() {
  local url="$1"
  local user host

  user="$(printf "%s" "$url" | sed -E 's|^[^:]+://([^:]+):.*|\1|')"
  if [[ "$user" == postgres.* ]]; then
    printf "%s\n" "${user#postgres.}"
    return 0
  fi

  host="$(printf "%s" "$url" | sed -E 's|^[^:]+://||; s|^[^@]+@||; s|[/:?].*$||')"
  if [[ "$host" =~ ^db\.([a-z0-9]+)\.supabase\.co$ ]]; then
    printf "%s\n" "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$host" =~ ^([a-z0-9]+)\.supabase\.co$ ]]; then
    printf "%s\n" "${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

resolve_project_ref() {
  local key value

  if [[ -n "$PROJECT_REF" ]]; then
    return
  fi

  for key in MAIN_SUPABASE_DB_URL SUPABASE_DB_DIRECT_URL SUPABASE_DB_URL DATABASE_URL SUPABASE_URL SUPA_URL; do
    if value="$(get_env_value "$key")"; then
      if PROJECT_REF="$(extract_project_ref_from_url "$value")"; then
        return
      fi
    fi
  done

  echo "Error: --project-ref not provided and no Supabase project ref could be parsed from $ENV_FILE." >&2
  exit 1
}

run_supabase() {
  local args=(bunx supabase --experimental)
  if [[ -n "$PROFILE" ]]; then
    args+=(--profile "$PROFILE")
  fi
  if [[ "$YES" == "true" ]]; then
    args+=(--yes)
  fi
  args+=("$@")

  if [[ "$DRY_RUN" == "true" ]]; then
    printf '+'
    printf ' %q' "${args[@]}"
    printf '\n'
    return 0
  fi

  "${args[@]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      require_arg "$1" "${2:-}"
      PROJECT_REF="$2"
      shift 2
      ;;
    --env-file)
      require_arg "$1" "${2:-}"
      ENV_FILE="$2"
      shift 2
      ;;
    --profile)
      require_arg "$1" "${2:-}"
      PROFILE="$2"
      shift 2
      ;;
    --append)
      APPEND="true"
      shift
      ;;
    --ipv4-only)
      INCLUDE_IPV4="true"
      INCLUDE_IPV6="false"
      shift
      ;;
    --ipv6-only)
      INCLUDE_IPV4="false"
      INCLUDE_IPV6="true"
      shift
      ;;
    --extra-cidr)
      require_arg "$1" "${2:-}"
      EXTRA_CIDRS_TEXT+="$2"$'\n'
      shift 2
      ;;
    --cloudflare-url)
      require_arg "$1" "${2:-}"
      CF_IPS_URL="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --yes)
      YES="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd curl
require_cmd bun
require_cmd bunx

resolve_project_ref

echo "==> Fetching Cloudflare IP ranges from: $CF_IPS_URL"
CF_JSON="$(curl -fsSL "$CF_IPS_URL")"
CF_LINES="$(printf '%s' "$CF_JSON" | INCLUDE_IPV4="$INCLUDE_IPV4" INCLUDE_IPV6="$INCLUDE_IPV6" bun -e '
  const raw = await Bun.stdin.text()
  const data = JSON.parse(raw)
  if (!data?.success || !data?.result) {
    console.error("Invalid Cloudflare IP API response")
    process.exit(1)
  }
  const cidrs = []
  if (process.env.INCLUDE_IPV4 === "true") {
    if (!Array.isArray(data.result.ipv4_cidrs)) {
      console.error("Missing Cloudflare IPv4 CIDRs")
      process.exit(1)
    }
    cidrs.push(...data.result.ipv4_cidrs)
  }
  if (process.env.INCLUDE_IPV6 === "true") {
    if (!Array.isArray(data.result.ipv6_cidrs)) {
      console.error("Missing Cloudflare IPv6 CIDRs")
      process.exit(1)
    }
    cidrs.push(...data.result.ipv6_cidrs)
  }
  console.log(cidrs.join("\n"))
')"

FINAL_CIDRS=()
while IFS= read -r cidr; do
  [[ -n "$cidr" ]] && FINAL_CIDRS+=("$cidr")
done < <(printf '%s\n%s' "$CF_LINES" "$EXTRA_CIDRS_TEXT" | awk 'NF' | sort -u)

if [[ "${#FINAL_CIDRS[@]}" -eq 0 ]]; then
  echo "Error: final CIDR list is empty." >&2
  exit 1
fi

update_args=(network-restrictions update --project-ref "$PROJECT_REF")
if [[ "$APPEND" == "true" ]]; then
  update_args+=(--append)
fi
for cidr in "${FINAL_CIDRS[@]}"; do
  update_args+=(--db-allow-cidr "$cidr")
done

echo "==> Supabase project ref: $PROJECT_REF"
echo "==> CIDR count: ${#FINAL_CIDRS[@]}"
echo "==> Mode: $([[ "$APPEND" == "true" ]] && echo 'append' || echo 'replace')"
echo "==> Dry run: $DRY_RUN"

echo "==> Current Supabase network restrictions:"
run_supabase network-restrictions get --project-ref "$PROJECT_REF" || true

if [[ "$YES" != "true" && "$DRY_RUN" != "true" ]]; then
  echo ""
  if [[ "$APPEND" == "true" ]]; then
    echo "This appends Cloudflare CIDRs to existing Supabase DB network restrictions."
  else
    echo "This replaces existing Supabase DB network restrictions with Cloudflare CIDRs only."
    echo "Direct Postgres connections from non-Cloudflare IPs will be blocked."
  fi
  read -r -p "Proceed with updating network restrictions for project $PROJECT_REF? [y/N]: " confirm
  case "$confirm" in
    y|Y|yes|YES)
      ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

echo "==> Updating Supabase network restrictions..."
run_supabase "${update_args[@]}"

echo "==> Updated Supabase network restrictions:"
run_supabase network-restrictions get --project-ref "$PROJECT_REF" || true

echo "==> Done."
