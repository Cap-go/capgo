#!/usr/bin/env bash

set -euo pipefail

extract_timestamp() {
  local file_name="$1"
  local base_name
  base_name="$(basename "$file_name")"

  if [[ "$base_name" =~ ^([0-9]{14})_.+\.sql$ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    return 1
  fi
}

count_nonempty_lines() {
  local value="$1"

  if [[ -z "$value" ]]; then
    echo 0
    return
  fi

  printf '%s\n' "$value" | awk 'NF { count++ } END { print count + 0 }'
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
tmp_dir="$(mktemp -d)"
base_timestamps_file="${tmp_dir}/base_timestamps.tsv"
added_timestamps_file="${tmp_dir}/added_timestamps.tsv"

trap 'rm -rf "${tmp_dir}"' EXIT

echo "Checking Supabase migrations against ${base_ref}"
if ! git fetch --no-tags origin "${target_branch}"; then
  if git rev-parse --verify --quiet "${base_ref}^{commit}" >/dev/null; then
    echo "⚠️  Could not fetch ${base_ref}; using existing local ref."
  elif git rev-parse --verify --quiet "HEAD^1^{commit}" >/dev/null \
    && git rev-parse --verify --quiet "HEAD^2^{commit}" >/dev/null; then
    base_ref='HEAD^1'
    echo "⚠️  Could not fetch origin/${target_branch}; using PR merge base parent."
  else
    echo "❌ Could not fetch ${base_ref} and no local fallback was available."
    exit 1
  fi
fi

: > "${base_timestamps_file}"
while IFS= read -r file; do
  [[ "$file" != supabase/migrations/*.sql ]] && continue
  ts="$(extract_timestamp "$file" || true)"
  [[ -z "$ts" ]] && continue
  printf '%s\t%s\n' "$ts" "$file" >> "${base_timestamps_file}"
done < <(git ls-tree -r --name-only "${base_ref}" -- supabase/migrations)

latest_base_timestamp='00000000000000'
if [[ -s "${base_timestamps_file}" ]]; then
  latest_base_timestamp="$(awk -F '\t' '
    BEGIN { max = "00000000000000" }
    $1 > max { max = $1 }
    END { print max }
  ' "${base_timestamps_file}")"
fi

status=0
current_migration_files="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort)"
current_migration_count="$(count_nonempty_lines "$current_migration_files")"

# Allow content-preserving re-stamps: a pure rename (100% identical content) of a
# migration to a timestamp NEWER than the latest on the base branch. This is the
# sanctioned way to repair an out-of-order migration (one whose timestamp sorts
# before a migration already applied on a remote, which `supabase db push`
# rejects) without altering its SQL. Content edits and deletions stay blocked.
restamped_files=''
while IFS=$'\t' read -r similarity _old_path new_path; do
  [[ -z "${new_path:-}" ]] && continue
  [[ "$similarity" != "R100" ]] && continue
  new_ts="$(extract_timestamp "$new_path" || true)"
  [[ -z "$new_ts" ]] && continue
  if (( 10#$new_ts > 10#$latest_base_timestamp )); then
    restamped_files+="${new_path}"$'\n'
  fi
done < <(git diff --name-status -M100% --diff-filter=R "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')

modified_files="$(git diff --name-only --diff-filter=MR "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')"
if [[ -n "$modified_files" ]]; then
  disallowed_modified_files=''

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    ts="$(extract_timestamp "$file" || true)"
    if [[ -n "$ts" && "$ts" == "$latest_base_timestamp" ]]; then
      echo "⚠️  Allowing fix to latest Supabase migration: $file"
      continue
    fi

    if [[ -n "$restamped_files" ]] && printf '%s' "$restamped_files" | grep -qxF "$file"; then
      echo "⚠️  Allowing content-preserving re-stamp to a newer timestamp: $file"
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

added_files="$(git diff --name-only --diff-filter=A "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')"
deleted_files="$(git diff --name-only --diff-filter=D "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')"
if [[ -n "$deleted_files" ]]; then
  allow_full_squash=0
  remaining_migration_file=''
  remaining_migration_rewritten=0

  if [[ -z "$added_files" && "$current_migration_count" == '1' ]]; then
    remaining_migration_file="$current_migration_files"
    remaining_timestamp="$(extract_timestamp "$remaining_migration_file" || true)"
    if ! git diff --quiet "${base_ref}...HEAD" -- "$remaining_migration_file"; then
      remaining_migration_rewritten=1
    fi

    if [[ "$remaining_migration_rewritten" == '1' && -n "$remaining_timestamp" && "$remaining_timestamp" == "$latest_base_timestamp" ]]; then
      deleted_latest_or_newer_files=''

      while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        ts="$(extract_timestamp "$file" || true)"
        if [[ -z "$ts" || "$ts" == "$latest_base_timestamp" || 10#$ts > 10#$latest_base_timestamp ]]; then
          deleted_latest_or_newer_files+="${file}"$'\n'
        fi
      done <<< "$deleted_files"

      if [[ -z "$deleted_latest_or_newer_files" ]]; then
        allow_full_squash=1
      fi
    fi
  fi

  if [[ "$allow_full_squash" == '1' ]]; then
    echo "⚠️  Allowing intentional Supabase migration squash into baseline: ${remaining_migration_file}"
  else
    echo '❌ Existing Supabase migrations were deleted in this change.'
    echo '  Supabase migrations must remain append-only except for a full baseline squash.'
    if [[ -n "$remaining_migration_file" && "$remaining_migration_rewritten" != '1' ]]; then
      echo "  The remaining migration was not rewritten: ${remaining_migration_file}"
    fi
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      echo "  - $file"
    done <<< "$deleted_files"
    status=1
  fi
fi

if [[ -n "$added_files" ]]; then
  : > "${added_timestamps_file}"

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    ts="$(extract_timestamp "$file" || true)"
    if [[ -z "$ts" ]]; then
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
