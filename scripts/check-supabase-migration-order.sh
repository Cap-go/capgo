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

is_allowed_modified_migration() {
  local file="$1"

  if [[ "$file" != "supabase/migrations/20260528090340_manifest_index.sql" ]]; then
    return 1
  fi

  local base_content
  local current_content
  base_content="$(git show "${base_ref}:${file}" 2>/dev/null || true)"
  current_content="$(cat "$file")"

  [[ "$base_content" == $'CREATE INDEX IF NOT EXISTS ON public.manifest USING btree (file_name);\n\nCREATE INDEX IF NOT EXISTS ON public.manifest USING btree (file_hash);' \
    && "$current_content" == $'CREATE INDEX IF NOT EXISTS manifest_file_name_idx ON public.manifest USING btree (file_name);\n\nCREATE INDEX IF NOT EXISTS manifest_file_hash_idx ON public.manifest USING btree (file_hash);' ]]
}

modified_files="$(git diff --name-only --diff-filter=MR "${base_ref}...HEAD" -- 'supabase/migrations/*.sql')"
if [[ -n "$modified_files" ]]; then
  blocked_modified_files=''
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    if is_allowed_modified_migration "$file"; then
      echo "⚠️  Allowing exact syntax repair for broken migration on ${base_ref}: $file"
      continue
    fi
    blocked_modified_files+="${file}"$'\n'
  done <<< "$modified_files"

  if [[ -n "$blocked_modified_files" ]]; then
    echo '❌ Existing Supabase migrations were modified in this change.'
    echo '  Create a new migration instead of editing committed migration files.'
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      echo "  - $file"
    done <<< "$blocked_modified_files"
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
