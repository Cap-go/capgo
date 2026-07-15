#!/usr/bin/env bash

set -euo pipefail

extract_timestamp() {
  local file_name="$1"
  local out_var="${2:-}"
  local base_name
  base_name="${file_name##*/}"

  if [[ "$base_name" =~ ^([0-9]{14})_.+\.sql$ ]]; then
    if [[ -n "$out_var" ]]; then
      printf -v "$out_var" '%s' "${BASH_REMATCH[1]}"
    else
      printf '%s\n' "${BASH_REMATCH[1]}"
    fi
  else
    if [[ -n "$out_var" ]]; then
      printf -v "$out_var" ''
    fi
    return 1
  fi
}

resolve_github_merge_base_ref() {
  case "${GITHUB_EVENT_NAME:-}" in
    pull_request | merge_group) ;;
    *) return 1 ;;
  esac

  if git rev-parse --verify --quiet "HEAD^1^{commit}" >/dev/null \
    && git rev-parse --verify --quiet "HEAD^2^{commit}" >/dev/null; then
    echo 'HEAD^1'
    return
  fi

  return 1
}

resolve_target_branch() {
  if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
    echo "${GITHUB_BASE_REF}"
    return
  fi

  if [[ -n "${GITHUB_REF_NAME:-}" ]]; then
    if [[ "${GITHUB_REF_NAME}" == gh-readonly-queue/* ]]; then
      local queued_ref
      queued_ref="${GITHUB_REF_NAME#gh-readonly-queue/}"
      echo "${queued_ref%/pr-*}"
      return
    fi

    if [[ "${GITHUB_REF_NAME}" == */pr-* ]]; then
      echo "${GITHUB_REF_NAME%/pr-*}"
      return
    fi
  fi

  if [[ -n "${GITHUB_EVENT_PATH:-}" ]] && command -v jq >/dev/null 2>&1; then
    local branch
    branch="$(jq -r '.pull_request.base.ref // .merge_group.base_ref // .repository.default_branch // empty' "${GITHUB_EVENT_PATH}")"
    if [[ -n "$branch" && "$branch" != "null" ]]; then
      echo "$branch"
      return
    fi
  fi

  echo 'main'
}

target_branch="$(resolve_target_branch)"
base_ref="origin/${target_branch}"
base_label="${base_ref}"
tmp_dir="$(mktemp -d)"
base_timestamps_file="${tmp_dir}/base_timestamps.tsv"
added_timestamps_file="${tmp_dir}/added_timestamps.tsv"

trap 'rm -rf "${tmp_dir}"' EXIT

local_base_ref=''
if local_base_ref="$(resolve_github_merge_base_ref)"; then
  base_ref="${local_base_ref}"
  base_label="local merge base parent (${target_branch})"
  echo "Checking Supabase migrations against ${base_label}"
else
  echo "Checking Supabase migrations against ${base_ref}"
  if ! git fetch --no-tags origin "+refs/heads/${target_branch}:refs/remotes/origin/${target_branch}"; then
    if git rev-parse --verify --quiet "${base_ref}^{commit}" >/dev/null; then
      echo "⚠️  Could not fetch ${base_ref}; using existing local ref."
    elif git rev-parse --verify --quiet "HEAD^1^{commit}" >/dev/null \
      && git rev-parse --verify --quiet "HEAD^2^{commit}" >/dev/null; then
      base_ref='HEAD^1'
      base_label="local merge base parent (${target_branch})"
      echo "⚠️  Could not fetch origin/${target_branch}; using PR merge base parent."
    else
      echo "❌ Could not fetch ${base_ref} and no local fallback was available."
      exit 1
    fi
  fi
fi

if ! git merge-base "${base_ref}" HEAD >/dev/null; then
  if git rev-parse --verify --quiet "HEAD^1^{commit}" >/dev/null \
    && git rev-parse --verify --quiet "HEAD^2^{commit}" >/dev/null; then
    base_ref='HEAD^1'
    base_label="local merge base parent (${target_branch})"
    echo "⚠️  Could not find a merge base for ${target_branch}; using PR merge base parent."
  else
    echo "❌ Could not find a merge base between ${base_ref} and HEAD."
    exit 1
  fi
fi

: > "${base_timestamps_file}"
latest_base_timestamp='00000000000000'
while IFS= read -r file; do
  [[ "$file" != supabase/migrations/*.sql ]] && continue
  if ! extract_timestamp "$file" ts; then
    continue
  fi
  printf '%s\t%s\n' "$ts" "$file" >> "${base_timestamps_file}"
  if [[ "$ts" > "$latest_base_timestamp" ]]; then
    latest_base_timestamp="$ts"
  fi
done < <(git ls-tree -r --name-only "${base_ref}" -- supabase/migrations)

status=0

# Allow content-preserving re-stamps: a pure rename (100% identical content) of a
# migration to a timestamp NEWER than the latest on the base branch. This is the
# sanctioned way to repair an out-of-order migration (one whose timestamp sorts
# before a migration already applied on a remote, which `supabase db push`
# rejects) without altering its SQL. Content edits and deletions stay blocked.
restamped_files=''
while IFS=$'\t' read -r similarity _old_path new_path; do
  [[ -z "${new_path:-}" ]] && continue
  [[ "$similarity" != "R100" ]] && continue
  if ! extract_timestamp "$new_path" new_ts; then
    continue
  fi
  if (( 10#$new_ts > 10#$latest_base_timestamp )); then
    restamped_files+="${new_path}"$'\n'
  fi
done < <(git diff --name-status -M100% --diff-filter=R "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')

# This migration failed before it was recorded in production: first a legacy
# trigger referenced the removed column, then sequential DDL locks deadlocked
# with live RLS traffic. Permit only the audited repair below; later edits stay
# blocked by the exact blob hash.
failed_migration_hotfix='supabase/migrations/20260713114104_harden_rbac_compat_cleanup_after_rls.sql'
failed_migration_hotfix_blob='17dfb3f478bff6b52bc71a85f0016cce11f1d789'

modified_files="$(git diff --name-only --diff-filter=MR "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')"
if [[ -n "$modified_files" ]]; then
  disallowed_modified_files=''

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    ts=''
    extract_timestamp "$file" ts || true
    if [[ -n "$ts" && "$ts" == "$latest_base_timestamp" ]]; then
      echo "⚠️  Allowing fix to latest Supabase migration: $file"
      continue
    fi

    if [[ -n "$restamped_files" ]] && printf '%s' "$restamped_files" | grep -qxF "$file"; then
      echo "⚠️  Allowing content-preserving re-stamp to a newer timestamp: $file"
      continue


    fi

    if [[ "$file" == "$failed_migration_hotfix" ]] \
      && [[ "$(git hash-object "$file")" == "$failed_migration_hotfix_blob" ]]; then
      echo "⚠️  Allowing audited repair to failed unapplied migration: $file"
      continue
    fi

    disallowed_modified_files+="${file}"$'\n'
  done <<< "$modified_files"

  if [[ -n "$disallowed_modified_files" ]]; then
    echo '❌ Existing Supabase migrations were modified in this change.'
    echo '  Create a new migration instead of editing committed migration files.'
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      echo "  - $file"
    done <<< "$disallowed_modified_files"
    status=1
  fi
fi

deleted_files="$(git diff --name-only --diff-filter=D "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')"
if [[ -n "$deleted_files" ]]; then
  echo '❌ Existing Supabase migrations were deleted in this change.'
  echo '  Supabase migrations must remain append-only.'
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    echo "  - $file"
  done <<< "$deleted_files"
  status=1
fi

added_files="$(git diff --name-only --diff-filter=A "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')"
if [[ -n "$added_files" ]]; then
  : > "${added_timestamps_file}"

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    if ! extract_timestamp "$file" ts; then
      echo "❌ Invalid Supabase migration filename: $file"
      echo '  Expected format: YYYYMMDDHHMMSS_description.sql'
      status=1
      continue
    fi

    existing_base_file="$(awk -F '\t' -v ts="$ts" '$1 == ts { print $2; exit }' "${base_timestamps_file}")"
    if [[ -n "$existing_base_file" ]]; then
      echo "❌ Duplicate migration timestamp: ${ts}"
      echo "  New file: $file"
      echo "  Existing file: ${existing_base_file}"
      status=1
    fi

    existing_added_file="$(awk -F '\t' -v ts="$ts" '$1 == ts { print $2; exit }' "${added_timestamps_file}")"
    if [[ -n "$existing_added_file" ]]; then
      echo "❌ Duplicate migration timestamp in this change: ${ts}"
      echo "  First file: ${existing_added_file}"
      echo "  Second file: $file"
      status=1
    else
      printf '%s\t%s\n' "$ts" "$file" >> "${added_timestamps_file}"
    fi

    if (( 10#$ts < 10#$latest_base_timestamp )); then
      echo '❌ Migration timestamp regression detected'
      echo "  Latest timestamp on ${base_ref}: ${latest_base_timestamp}"
      echo "  New file: $file"
      echo "  New timestamp: ${ts}"
      status=1
    fi
  done <<< "$added_files"
fi

if [[ "$status" -ne 0 ]]; then
  exit 1
fi

echo '✅ Supabase migration filenames are unique and newer than the target branch.'
