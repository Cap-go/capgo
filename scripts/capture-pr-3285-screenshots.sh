#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.bun/bin:${PATH}"

VARIANT="${1:-}"
if [ "$VARIANT" != "before" ] && [ "$VARIANT" != "after" ]; then
  echo "Usage: $0 before|after" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${TINBASE_PORT:-55321}"
APP_ID="com.demo.app"
USER_ID="6aa76066-55ef-4238-ade6-0b32334a4097"
RUN_DIR="$(mktemp -d)"
LOG="${RUN_DIR}/tinbase.log"
VITE_LOG="${RUN_DIR}/vite.log"
WORKTREE="${RUN_DIR}/frontend-tree"
TINBASE_PID=""
VITE_PID=""

cleanup() {
  if [ -n "${TINBASE_PID:-}" ]; then
    kill "$TINBASE_PID" 2>/dev/null || true
  fi
  if [ -n "${VITE_PID:-}" ]; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [ -n "${WORKTREE:-}" ] && [ -d "${WORKTREE}" ]; then
    git -C "$ROOT" worktree remove -f "$WORKTREE" 2>/dev/null || rm -rf "$WORKTREE"
  fi
  rm -rf "$ROOT/.tinbase" 2>/dev/null || true
  if [ -n "${RUN_DIR:-}" ]; then
    rm -rf "$RUN_DIR"
  fi
}
trap cleanup EXIT

rm -rf "$ROOT/.tinbase"

git -C "$ROOT" worktree add --detach "$WORKTREE" "$(
  if [ "$VARIANT" = "before" ]; then
    echo "origin/main"
  else
    git -C "$ROOT" rev-parse HEAD
  fi
)" >/dev/null

bunx tinbase start --dir "$ROOT" -p "$PORT" > "$LOG" 2>&1 &
TINBASE_PID=$!

for _ in $(seq 1 120); do
  grep -q "tinbase running" "$LOG" 2>/dev/null && break
  if ! kill -0 "$TINBASE_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! grep -q "tinbase running" "$LOG" 2>/dev/null; then
  echo "Tinbase failed to start:" >&2
  tail -n 100 "$LOG" >&2 || true
  exit 1
fi

ANON_KEY="$(awk '/anon key:/ {print $NF; exit}' "$LOG")"
SERVICE_KEY="$(awk '/service_role key:/ {print $NF; exit}' "$LOG")"
if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_KEY" ]; then
  echo "Failed to parse Tinbase keys from $LOG" >&2
  exit 1
fi

SUPABASE_URL="http://127.0.0.1:${PORT}"
API_DOMAIN="127.0.0.1:${PORT}/functions/v1"

curl -sf -X PUT "${SUPABASE_URL}/auth/v1/admin/users/${USER_ID}" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"password":"testtest","email_confirm":true}' >/dev/null

cd "$WORKTREE"
if [ ! -d "$WORKTREE/node_modules" ]; then
  (cd "$WORKTREE" && bun install --frozen-lockfile) >/dev/null
fi
ENV=local SUPA_URL="$SUPABASE_URL" SUPA_ANON="$ANON_KEY" API_DOMAIN="$API_DOMAIN" CAPTCHA_KEY='' \
  bun run serve:local > "$VITE_LOG" 2>&1 &
VITE_PID=$!

for _ in $(seq 1 180); do
  if curl -sf "http://localhost:5173/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://localhost:5173/" >/dev/null 2>&1; then
  echo "Vite failed to start:" >&2
  tail -n 80 "$VITE_LOG" >&2 || true
  exit 1
fi

mkdir -p "$ROOT/.github/pr-assets/3285"
cd "$ROOT"
CAPGO_PR_SCREENSHOTS=1 CAPGO_PR3285_VARIANT="$VARIANT" CAPGO_PR3285_APP_ID="$APP_ID" \
  SKIP_BACKEND_START=1 SKIP_FRONTEND_START=1 SKIP_STRIPE_EMULATOR_START=1 \
  SUPABASE_URL="$SUPABASE_URL" SUPABASE_ANON_KEY="$ANON_KEY" \
  bunx playwright test playwright/e2e/pr-3285-onboarding-hardgate-screenshots.spec.ts

ls -la "$ROOT/.github/pr-assets/3285"
