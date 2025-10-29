#!/usr/bin/env bash

# Complete workflow for testing Cloudflare Workers with V2 (D1) enabled

set -e

echo "🧪 Cloudflare V2 (D1) Testing Workflow"
echo "======================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Reset and seed database
echo -e "\n${YELLOW}Step 1: Resetting Supabase database...${NC}"
supabase db reset

# 2. Sync to D1
echo -e "\n${YELLOW}Step 2: Syncing data from Postgres to D1...${NC}"
bun run scripts/sync-postgres-to-d1.ts

# 3. Start workers
echo -e "\n${YELLOW}Step 3: Starting Cloudflare Workers...${NC}"
./scripts/start-cloudflare-workers.sh > /tmp/cloudflare-workers-v2.log 2>&1 &
WORKERS_PID=$!

# Wait for workers to start
echo "Waiting for workers to start..."
sleep 8

# Check if workers are running
if curl -s http://127.0.0.1:8787/ok > /dev/null && curl -s http://127.0.0.1:8788/ok > /dev/null; then
  echo -e "${GREEN}✓ Workers started successfully${NC}"
else
  echo -e "\n${YELLOW}⚠️  Workers may not be ready yet, continuing anyway...${NC}"
fi

# 4. Run tests
echo -e "\n${YELLOW}Step 4: Running tests...${NC}"
bun test:cloudflare:backend

# Cleanup
echo -e "\n${YELLOW}Cleaning up...${NC}"
pkill -f "wrangler dev" || true

echo -e "\n${GREEN}✅ Test run complete!${NC}"
