#!/usr/bin/env bash

# Script to start Cloudflare Workers for testing
# This script starts the API and Plugin workers in the background

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

# Start API worker on port 8787
echo -e "${GREEN}Starting API worker on port 8787...${NC}"
wrangler dev -c cloudflare_workers/api/wrangler.jsonc --port 8787 --env-file=internal/cloudflare/.env.local &
API_PID=$!

# Wait a bit for the first worker to start
sleep 3

# Start Plugin worker on port 8788
echo -e "${GREEN}Starting Plugin worker on port 8788...${NC}"
wrangler dev -c cloudflare_workers/plugin/wrangler.jsonc --port 8788 --env-file=internal/cloudflare/.env.local &
PLUGIN_PID=$!

# Wait a bit for the second worker to start
sleep 3

# Start Files worker on port 8789
echo -e "${GREEN}Starting Files worker on port 8789...${NC}"
wrangler dev -c cloudflare_workers/files/wrangler.jsonc --port 8789 --env-file=internal/cloudflare/.env.local &
FILES_PID=$!

echo -e "${GREEN}All workers started!${NC}"
echo "API Worker PID: $API_PID (http://127.0.0.1:8787)"
echo "Plugin Worker PID: $PLUGIN_PID (http://127.0.0.1:8788)"
echo "Files Worker PID: $FILES_PID (http://127.0.0.1:8789)"
echo ""
echo "Press Ctrl+C to stop all workers"

# Function to cleanup on exit
cleanup() {
  echo -e "\n${YELLOW}Stopping workers...${NC}"
  kill $API_PID $PLUGIN_PID $FILES_PID 2>/dev/null || true
  pkill -f "wrangler dev" || true
  echo -e "${GREEN}All workers stopped${NC}"
}

# Trap SIGINT and SIGTERM
trap cleanup EXIT INT TERM

# Wait for all background processes
wait
