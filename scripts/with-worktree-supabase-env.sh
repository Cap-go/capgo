#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_NAME="$(basename "${ROOT_DIR}")"

SLUG="$(printf '%s' "${WORKTREE_NAME}" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed -E 's/^-+//; s/-+$//')"
if [ -z "${SLUG}" ]; then
  SLUG="worktree"
fi

WORKTREE_HASH_DEC="$(printf '%s' "${ROOT_DIR}" | cksum | awk '{ print $1 }')"
WORKTREE_HASH_HEX="$(printf '%x' "${WORKTREE_HASH_DEC}")"
WORKTREE_HASH_SHORT="$(printf '%s' "${WORKTREE_HASH_HEX}" | cut -c1-6)"
SLUG_SHORT="$(printf '%s' "${SLUG}" | cut -c1-20)"

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
  exit 0
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command...>" >&2
  exit 1
fi

exec "$@"
