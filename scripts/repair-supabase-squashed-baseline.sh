#!/usr/bin/env bash

set -euo pipefail

baseline_version='20260608143906'
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repair_sql="${repo_root}/supabase/repair/${baseline_version}_pre_squash_repair.sql"
reverted_versions_file="${repo_root}/supabase/repair/${baseline_version}_reverted_versions.txt"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/repair-supabase-squashed-baseline.sh --linked
  bash scripts/repair-supabase-squashed-baseline.sh --local
  bash scripts/repair-supabase-squashed-baseline.sh --db-url "$SUPABASE_DB_URL"

If needed, applies the final pre-squash migration, marks deleted historical
migration rows as reverted, and marks the squashed baseline version as applied.

Set SUPABASE_WORKDIR to pass a custom Supabase --workdir, for example when
validating against this repo's worktree-isolated local Supabase stack.
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

target_args=()
reverted_versions=()
pre_squash_history_output=''
baseline_applied=false
case "$1" in
  --linked|--local)
    target_args=("$1")
    shift
    ;;
  --db-url)
    if [[ $# -lt 2 || -z "${2:-}" ]]; then
      usage
      exit 1
    fi
    target_args=("--db-url" "$2")
    shift 2
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage
    exit 1
    ;;
esac

if [[ $# -ne 0 ]]; then
  usage
  exit 1
fi

while IFS= read -r version || [[ -n "$version" ]]; do
  [[ -z "$version" ]] && continue
  [[ "$version" =~ ^# ]] && continue

  if [[ ! "$version" =~ ^[0-9]{14}$ ]]; then
    echo "Invalid migration version in ${reverted_versions_file}: ${version}" >&2
    exit 1
  fi

  reverted_versions+=("$version")
done < "$reverted_versions_file"

if [[ "${#reverted_versions[@]}" -eq 0 ]]; then
  echo "No reverted migration versions found in ${reverted_versions_file}." >&2
  exit 1
fi

run_supabase() {
  if command -v supabase >/dev/null 2>&1; then
    if [[ -n "${SUPABASE_WORKDIR:-}" ]]; then
      supabase "$@" --workdir "$SUPABASE_WORKDIR"
    else
      supabase "$@"
    fi
    return
  fi

  if [[ -n "${SUPABASE_WORKDIR:-}" ]]; then
    bunx supabase "$@" --workdir "$SUPABASE_WORKDIR"
  else
    bunx supabase "$@"
  fi
}

repair_versions() {
  local status="$1"
  shift

  if [[ "$#" -eq 0 ]]; then
    return
  fi

  run_supabase migration repair "${target_args[@]}" --status "$status" "$@"
}

baseline_is_applied() {
  local applied_output
  if ! applied_output="$(run_supabase db query "${target_args[@]}" -o json "select exists(select 1 from supabase_migrations.schema_migrations where version = '${baseline_version}') as applied;")"; then
    echo "Could not read Supabase migration history for ${baseline_version}." >&2
    exit 1
  fi

  grep -Eq '"applied"[[:space:]]*:[[:space:]]*true' <<< "$applied_output"
}

has_migration_history_table() {
  local history_table_output
  if ! history_table_output="$(run_supabase db query "${target_args[@]}" -o json "select to_regclass('supabase_migrations.schema_migrations') is not null as has_history_table;")"; then
    echo "Could not inspect Supabase migration history table." >&2
    exit 1
  fi

  grep -Eq '"has_history_table"[[:space:]]*:[[:space:]]*true' <<< "$history_table_output"
}

has_existing_capgo_schema() {
  local schema_output
  if ! schema_output="$(run_supabase db query "${target_args[@]}" -o json "select to_regclass('public.apps') is not null as has_capgo_schema;")"; then
    echo "Could not inspect existing Capgo schema." >&2
    exit 1
  fi

  grep -Eq '"has_capgo_schema"[[:space:]]*:[[:space:]]*true' <<< "$schema_output"
}

has_pre_squash_history() {
  grep -Eq '"has_old_history"[[:space:]]*:[[:space:]]*true' <<< "$pre_squash_history_output"
}

has_complete_pre_squash_history() {
  grep -Eq '"has_complete_old_history"[[:space:]]*:[[:space:]]*true' <<< "$pre_squash_history_output"
}

load_pre_squash_history() {
  local versions_sql
  printf -v versions_sql "'%s'," "${reverted_versions[@]}"
  versions_sql="${versions_sql%,}"

  if ! pre_squash_history_output="$(run_supabase db query "${target_args[@]}" -o json "select count(*) > 0 as has_old_history, count(*) = ${#reverted_versions[@]} as has_complete_old_history from supabase_migrations.schema_migrations where version in (${versions_sql});")"; then
    echo "Could not inspect deleted Supabase migration history rows." >&2
    exit 1
  fi
}

if ! has_migration_history_table; then
  echo "Supabase migration history table does not exist; skipping squash repair for a fresh database."
  exit 0
fi

load_pre_squash_history
if baseline_is_applied; then
  baseline_applied=true
fi

if ! has_pre_squash_history; then
  if [[ "$baseline_applied" == true ]]; then
    echo "No deleted pre-squash migration history found and squashed baseline is already applied; skipping squash repair."
    exit 0
  fi

  if has_existing_capgo_schema; then
    echo "Existing Capgo schema found, but deleted pre-squash migration history and squashed baseline marker are both missing. Aborting to avoid applying the squashed baseline to an existing database." >&2
    exit 1
  fi

  echo "No deleted pre-squash migration history found; skipping squash repair for a fresh database."
  exit 0
fi

if [[ "$baseline_applied" != true ]] && ! has_complete_pre_squash_history; then
  final_pre_squash_version="${reverted_versions[$((${#reverted_versions[@]} - 1))]}"
  echo "Deleted pre-squash migration history is incomplete; expected ${#reverted_versions[@]} versions through ${final_pre_squash_version}. Aborting to avoid marking a partial database as squashed." >&2
  exit 1
fi

if [[ "$baseline_applied" == true ]]; then
  echo "Squashed baseline ${baseline_version} is already marked applied; skipping schema repair SQL."
else
  run_supabase db query "${target_args[@]}" --file "$repair_sql"
fi

repair_versions applied "$baseline_version"

chunk=()
for version in "${reverted_versions[@]}"; do
  chunk+=("$version")
  if [[ "${#chunk[@]}" -ge 50 ]]; then
    repair_versions reverted "${chunk[@]}"
    chunk=()
  fi
done

repair_versions reverted "${chunk[@]}"
