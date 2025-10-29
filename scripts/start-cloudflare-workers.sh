#!/usr/bin/env bash

# Script to start Cloudflare Workers for testing
# This script starts all workers (D1 Sync, API, Plugin, Files) in the background

set -e

echo "Starting Cloudflare Workers for testing..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Kill any existing wrangler processes
echo -e "${YELLOW}Cleaning up existing wrangler processes...${NC}"
pkill -f "wrangler dev" || true
sleep 2

# Clean up D1 local database to ensure fresh state
echo -e "${YELLOW}Cleaning up D1 local database (.wrangler)...${NC}"
rm -rf .wrangler-shared
mkdir -p .wrangler-shared
echo -e "${GREEN}✓ D1 database cleaned${NC}"

# Start D1 Sync worker on port 8790
echo -e "${GREEN}Starting D1 Sync worker on port 8790...${NC}"
(cd cloudflare_workers/d1_sync && bunx wrangler dev -c wrangler.jsonc --port 8790 --env=local --persist-to ../../.wrangler-shared) &
SYNC_PID=$!

# Wait a bit for the sync worker to start
sleep 3

# Start API worker on port 8787
echo -e "${GREEN}Starting API worker on port 8787...${NC}"
(cd cloudflare_workers/api && bunx wrangler dev -c wrangler.jsonc --port 8787 --env-file=../../internal/cloudflare/.env.local --env=local --persist-to ../../.wrangler-shared) &
API_PID=$!

# Wait a bit for the first worker to start
sleep 3

# Start Plugin worker on port 8788
echo -e "${GREEN}Starting Plugin worker on port 8788...${NC}"
(cd cloudflare_workers/plugin && bunx wrangler dev -c wrangler.jsonc --port 8788 --env-file=../../internal/cloudflare/.env.local --env=local --persist-to ../../.wrangler-shared) &
PLUGIN_PID=$!

# Wait a bit for the second worker to start
sleep 3

# Start Files worker on port 8789
echo -e "${GREEN}Starting Files worker on port 8789...${NC}"
(cd cloudflare_workers/files && bunx wrangler dev -c wrangler.jsonc --port 8789 --env-file=../../internal/cloudflare/.env.local --env=local --persist-to ../../.wrangler-shared) &
FILES_PID=$!

echo -e "${GREEN}All workers started!${NC}"
echo "D1 Sync Worker PID: $SYNC_PID (http://127.0.0.1:8790)"
echo "API Worker PID: $API_PID (http://127.0.0.1:8787)"
echo "Plugin Worker PID: $PLUGIN_PID (http://127.0.0.1:8788)"
echo "Files Worker PID: $FILES_PID (http://127.0.0.1:8789)"
echo ""

# Queue initial data to D1 via PGMQ (production-like approach)
echo -e "${GREEN}Queueing initial data for D1 sync...${NC}"
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/trigger-initial-d1-sync.sql > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Initial data queued to PGMQ${NC}"

  # Trigger sync worker to process the queue
  echo -e "${GREEN}Triggering D1 sync worker...${NC}"
  curl -s -X POST http://127.0.0.1:8790/sync -H "x-webhook-signature: testsecret" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ D1 sync triggered successfully${NC}"
    sleep 2
    echo -e "${GREEN}✓ D1 database is now ready with initial data${NC}"
  else
    echo -e "${YELLOW}⚠ Warning: Failed to trigger D1 sync${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Warning: Failed to queue initial data${NC}"
fi

echo ""
echo "Press Ctrl+C to stop all workers"

# Function to cleanup on exit
cleanup() {
  echo -e "\n${YELLOW}Stopping workers...${NC}"
  kill $SYNC_PID $API_PID $PLUGIN_PID $FILES_PID 2>/dev/null || true
  pkill -f "wrangler dev" || true
  echo -e "${GREEN}All workers stopped${NC}"
}

# Trap SIGINT and SIGTERM
trap cleanup EXIT INT TERM

# Wait for all background processes
wait
