#!/usr/bin/env bash
set -euo pipefail

# Update Cloud SQL authorized networks with current Cloudflare IPv4 ranges.
# By default this MERGES existing authorized networks with Cloudflare IPs.
# Use --replace to overwrite with Cloudflare-only ranges.

CF_IPS_URL="https://api.cloudflare.com/client/v4/ips"

usage() {
  cat <<'EOF'
Usage:
  scripts/update_cloudsql_authorized_networks.sh [options]

Interactive defaults:
  - If --project is omitted, uses current gcloud project or asks you to choose one.
  - If --instance is omitted, lists Cloud SQL instances and asks you to choose one/all/many.

Options:
  --project <id>          GCP project ID (optional)
  --instance <name>       Cloud SQL instance name (optional)
  --replace               Replace existing authorized networks (Cloudflare IPv4 only)
  --dry-run               Print the gcloud patch command but do not execute it
  --cloudflare-url <url>  Override Cloudflare IP API URL (default: https://api.cloudflare.com/client/v4/ips)
  -h, --help              Show this help

Examples:
  scripts/update_cloudsql_authorized_networks.sh
  scripts/update_cloudsql_authorized_networks.sh --project capgo-394818
  scripts/update_cloudsql_authorized_networks.sh --project capgo-394818 --instance capgo-hk
  scripts/update_cloudsql_authorized_networks.sh --project capgo-394818 --dry-run
  scripts/update_cloudsql_authorized_networks.sh --project capgo-394818 --instance capgo-hk --replace
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

PROJECT_ID=""
INSTANCE_NAME=""
REPLACE="false"
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      require_arg "$1" "${2:-}"
      PROJECT_ID="$2"
      shift 2
      ;;
    --instance)
      require_arg "$1" "${2:-}"
      INSTANCE_NAME="$2"
      shift 2
      ;;
    --replace)
      REPLACE="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --cloudflare-url)
      require_arg "$1" "${2:-}"
      CF_IPS_URL="$2"
      shift 2
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

require_cmd gcloud
require_cmd curl
require_cmd bun

pick_project_if_needed() {
  if [[ -n "$PROJECT_ID" ]]; then
    return
  fi

  local current
  current="$(gcloud config get-value project 2>/dev/null | tr -d '\r')"
  if [[ -n "$current" && "$current" != "(unset)" ]]; then
    PROJECT_ID="$current"
    echo "==> Using current gcloud project: $PROJECT_ID"
    return
  fi

  echo "==> No project configured. Select a project:"
  local project_ids=()
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && project_ids+=("$line")
  done < <(gcloud projects list --format='value(projectId)')

  if [[ "${#project_ids[@]}" -eq 0 ]]; then
    echo "Error: no GCP projects found for your current gcloud auth." >&2
    exit 1
  fi

  local i=1
  for id in "${project_ids[@]}"; do
    printf "  %2d) %s\n" "$i" "$id"
    i=$((i + 1))
  done

  local choice
  while true; do
    printf "Enter project number [1-%d]: " "${#project_ids[@]}"
    read -r choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#project_ids[@]} )); then
      PROJECT_ID="${project_ids[$((choice - 1))]}"
      echo "==> Selected project: $PROJECT_ID"
      break
    fi
    echo "Invalid selection."
  done
}

select_instances_if_needed() {
  if [[ -n "$INSTANCE_NAME" ]]; then
    TARGET_INSTANCES=("$INSTANCE_NAME")
    return
  fi

  echo "==> Listing Cloud SQL instances for project: $PROJECT_ID"
  local instances_json
  instances_json="$(gcloud sql instances list --project="$PROJECT_ID" --format=json)"

  INSTANCE_NAMES=()
  local row
  while IFS=$'\t' read -r name region state db_version; do
    [[ -z "$name" ]] && continue
    INSTANCE_NAMES+=("$name")
    printf "  %2d) %-36s region=%-16s state=%-12s db=%s\n" "${#INSTANCE_NAMES[@]}" "$name" "$region" "$state" "$db_version"
  done < <(printf '%s' "$instances_json" | bun -e '
    const raw = await Bun.stdin.text()
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) process.exit(0)
    for (const inst of data) {
      const name = inst?.name ?? ""
      const region = inst?.region ?? ""
      const state = inst?.state ?? ""
      const db = inst?.databaseVersion ?? ""
      console.log([name, region, state, db].join("\t"))
    }
  ')

  if [[ "${#INSTANCE_NAMES[@]}" -eq 0 ]]; then
    echo "Error: no Cloud SQL instances found in project '$PROJECT_ID'." >&2
    exit 1
  fi

  echo "Select instances: number, comma list (e.g. 1,3), or 'all'"
  local choice
  while true; do
    printf "Enter choice: "
    read -r choice
    if [[ "$choice" == "all" ]]; then
      TARGET_INSTANCES=("${INSTANCE_NAMES[@]}")
      break
    fi
    if [[ "$choice" =~ ^[0-9]+(,[0-9]+)*$ ]]; then
      TARGET_INSTANCES=()
      local invalid="false"
      IFS=',' read -r -a picked <<< "$choice"
      for idx in "${picked[@]}"; do
        if (( idx < 1 || idx > ${#INSTANCE_NAMES[@]} )); then
          invalid="true"
          break
        fi
        TARGET_INSTANCES+=("${INSTANCE_NAMES[$((idx - 1))]}")
      done
      if [[ "$invalid" == "false" && "${#TARGET_INSTANCES[@]}" -gt 0 ]]; then
        break
      fi
    fi
    echo "Invalid selection."
  done
}

build_final_csv_for_instance() {
  local instance_name="$1"
  local final_csv="$CF_CSV"

  if [[ "$REPLACE" != "true" ]]; then
    local existing_json existing_csv
    existing_json="$(gcloud sql instances describe "$instance_name" --project="$PROJECT_ID" --format=json)"
    existing_csv="$(printf '%s' "$existing_json" | bun -e '
      const raw = await Bun.stdin.text()
      const data = JSON.parse(raw)
      const entries = data?.settings?.ipConfiguration?.authorizedNetworks ?? []
      const values = entries
        .map((entry) => entry?.value ?? "")
        .map((value) => value.trim())
        .filter(Boolean)
      console.log(values.join(","))
    ')"

    final_csv="$(printf '%s\n%s\n' "$existing_csv" "$CF_CSV" \
      | tr ',' '\n' \
      | awk 'NF' \
      | sort -u \
      | paste -sd, -)"
  fi

  if [[ -z "$final_csv" ]]; then
    echo "Error: final authorized networks list is empty for instance '$instance_name'." >&2
    exit 1
  fi

  printf '%s' "$final_csv"
}

apply_for_instance() {
  local instance_name="$1"
  local final_csv count

  echo "==> Preparing authorized networks for instance: $instance_name"
  final_csv="$(build_final_csv_for_instance "$instance_name")"
  count="$(printf '%s' "$final_csv" | tr ',' '\n' | awk 'NF' | wc -l | tr -d ' ')"
  echo "==> Final CIDR count for $instance_name: $count"

  local patch_cmd=(
    gcloud sql instances patch "$instance_name"
    "--project=$PROJECT_ID"
    "--authorized-networks=$final_csv"
    "--quiet"
  )

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "==> Dry run command for $instance_name:"
    printf '%q ' "${patch_cmd[@]}"
    echo
    return
  fi

  echo "==> Applying authorized networks on $instance_name..."
  "${patch_cmd[@]}"
  echo "==> Done for $instance_name"
}

echo "==> Fetching Cloudflare IPv4 ranges from: $CF_IPS_URL"
CF_JSON="$(curl -fsSL "$CF_IPS_URL")"
CF_CSV="$(printf '%s' "$CF_JSON" | bun -e '
  const raw = await Bun.stdin.text()
  const data = JSON.parse(raw)
  if (!data?.success || !Array.isArray(data?.result?.ipv4_cidrs)) {
    console.error("Invalid Cloudflare IP API response")
    process.exit(1)
  }
  console.log(data.result.ipv4_cidrs.join(","))
')"

if [[ -z "$CF_CSV" ]]; then
  echo "Error: Cloudflare IPv4 list is empty." >&2
  exit 1
fi

pick_project_if_needed
select_instances_if_needed

echo "==> Project: $PROJECT_ID"
echo "==> Instances selected: ${TARGET_INSTANCES[*]}"
echo "==> Mode: $([[ "$REPLACE" == "true" ]] && echo 'replace' || echo 'merge')"
echo "==> Dry run: $DRY_RUN"

for inst in "${TARGET_INSTANCES[@]}"; do
  apply_for_instance "$inst"
done

echo "==> Completed."
