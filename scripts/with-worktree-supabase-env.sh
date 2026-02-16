#!/usr/bin/env bash

set -euo pipefail

for cmd in cksum awk tr sed cut; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_NAME="$(basename "${ROOT_DIR}")"

WORKTREE_HASH_DEC="$(printf '%s' "${ROOT_DIR}" | cksum | awk '{ print $1 }')"
WORKTREE_HASH_HEX="$(printf '%x' "${WORKTREE_HASH_DEC}")"
WORKTREE_HASH_SHORT="$(printf '%s' "${WORKTREE_HASH_HEX}" | cut -c1-6)"

SLUG="$(printf '%s' "${WORKTREE_NAME}" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed -E 's/^-+//; s/-+$//')"
if [ -z "${SLUG}" ]; then
  SLUG="worktree-${WORKTREE_HASH_SHORT}"
fi

SLUG_SHORT="$(printf '%s' "${SLUG}" | cut -c1-20)"

# Reserve a 20-port block per worktree to keep room for additional local services
# without renumbering existing allocations.
SLOT=$((WORKTREE_HASH_DEC % 600))
BASE_PORT=$((42000 + SLOT * 20))

export SUPABASE_PROJECT_ID="capgo-${SLUG_SHORT}-${WORKTREE_HASH_SHORT}"
export SUPABASE_DB_SHADOW_PORT="${BASE_PORT}"
export SUPABASE_API_PORT="$((BASE_PORT + 1))"
export SUPABASE_DB_PORT="$((BASE_PORT + 2))"
export SUPABASE_STUDIO_PORT="$((BASE_PORT + 3))"
export SUPABASE_INBUCKET_PORT="$((BASE_PORT + 4))"
export SUPABASE_ANALYTICS_PORT="$((BASE_PORT + 7))"
export SUPABASE_POOLER_PORT="$((BASE_PORT + 9))"
export SUPABASE_INSPECTOR_PORT="$((BASE_PORT + 13))"

export SUPABASE_URL="http://127.0.0.1:${SUPABASE_API_PORT}"
export SUPA_URL="${SUPABASE_URL}"
export SUPABASE_EXTERNAL_URL="${SUPABASE_URL}"
export API_URL="${SUPABASE_URL}"
export S3_ENDPOINT="127.0.0.1:${SUPABASE_API_PORT}/storage/v1/s3"
export STORAGE_API_URL="${SUPABASE_URL}/storage/v1"

if [ "${1:-}" = "--print-env" ]; then
  printf 'SUPABASE_PROJECT_ID=%s\n' "${SUPABASE_PROJECT_ID}"
  printf 'SUPABASE_DB_SHADOW_PORT=%s\n' "${SUPABASE_DB_SHADOW_PORT}"
  printf 'SUPABASE_API_PORT=%s\n' "${SUPABASE_API_PORT}"
  printf 'SUPABASE_DB_PORT=%s\n' "${SUPABASE_DB_PORT}"
  printf 'SUPABASE_STUDIO_PORT=%s\n' "${SUPABASE_STUDIO_PORT}"
  printf 'SUPABASE_INBUCKET_PORT=%s\n' "${SUPABASE_INBUCKET_PORT}"
  printf 'SUPABASE_ANALYTICS_PORT=%s\n' "${SUPABASE_ANALYTICS_PORT}"
  printf 'SUPABASE_POOLER_PORT=%s\n' "${SUPABASE_POOLER_PORT}"
  printf 'SUPABASE_INSPECTOR_PORT=%s\n' "${SUPABASE_INSPECTOR_PORT}"
  printf 'SUPABASE_URL=%s\n' "${SUPABASE_URL}"
  printf 'SUPA_URL=%s\n' "${SUPA_URL}"
  printf 'SUPABASE_EXTERNAL_URL=%s\n' "${SUPABASE_EXTERNAL_URL}"
  printf 'API_URL=%s\n' "${API_URL}"
  printf 'S3_ENDPOINT=%s\n' "${S3_ENDPOINT}"
  printf 'STORAGE_API_URL=%s\n' "${STORAGE_API_URL}"
  exit 0
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command...>" >&2
  exit 1
fi

# For local functions runtime, override only non-reserved local endpoints so
# uploads and storage calls follow the worktree port assignments.
cmd=("$@")
if [ "${#cmd[@]}" -ge 3 ]; then
  subcommand_start=-1
  if [ "${cmd[0]}" = "supabase" ]; then
    subcommand_start=1
  elif [ "${cmd[0]}" = "bunx" ] && [ "${cmd[1]:-}" = "supabase" ]; then
    subcommand_start=2
  fi

  if [ "${subcommand_start}" -ge 0 ] \
    && [ "${cmd[subcommand_start]:-}" = "functions" ] \
    && [ "${cmd[$((subcommand_start + 1))]:-}" = "serve" ]; then
    has_env_file=false
    for arg in "${cmd[@]}"; do
      if [ "${arg}" = "--env-file" ]; then
        has_env_file=true
        break
      fi
    done

    if [ "${has_env_file}" = false ]; then
      functions_env_file="${ROOT_DIR}/.context/worktree-supabase-functions.env"
      mkdir -p "${ROOT_DIR}/.context"
      if [ -f "${ROOT_DIR}/supabase/functions/.env" ]; then
        grep -vE '^(API_URL|S3_ENDPOINT|STORAGE_API_URL)=' "${ROOT_DIR}/supabase/functions/.env" > "${functions_env_file}" || true
      else
        : > "${functions_env_file}"
      fi
      {
        printf '\n'
        printf 'API_URL=%s\n' "${API_URL}"
        printf 'SUPABASE_EXTERNAL_URL=%s\n' "${SUPABASE_EXTERNAL_URL}"
        printf 'S3_ENDPOINT=%s\n' "${S3_ENDPOINT}"
        printf 'STORAGE_API_URL=%s\n' "${STORAGE_API_URL}"
      } >> "${functions_env_file}"
      exec "${cmd[@]}" --env-file "${functions_env_file}"
    fi
  fi
fi

exec "$@"
