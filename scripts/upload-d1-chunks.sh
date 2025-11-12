#!/bin/bash

# Script to split large SQL files into chunks and upload to Cloudflare D1
# Usage: ./scripts/upload-d1-chunks.sh <database_name> <sql_file> [chunk_size] [database_id]

set -e

# Configuration
DATABASE_NAME="${1}"
SQL_FILE="${2}"
CHUNK_SIZE="${3:-10000}"  # Default 10,000 lines per chunk
DATABASE_ID="${4:-capgo_replicate_eu}"  # Default database ID

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate arguments
if [ -z "$DATABASE_NAME" ] || [ -z "$SQL_FILE" ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 <database_name> <sql_file> [chunk_size] [database_id]"
    echo ""
    echo "Examples:"
    echo "  $0 manifest database_manifest.sql"
    echo "  $0 manifest database_manifest.sql 5000"
    echo "  $0 manifest database_manifest.sql 10000 capgo_replicate_eu"
    exit 1
fi

# Check if file exists
if [ ! -f "$SQL_FILE" ]; then
    echo -e "${RED}Error: File '$SQL_FILE' not found${NC}"
    exit 1
fi

# Create temp directory for chunks
TEMP_DIR=$(mktemp -d)
echo -e "${GREEN}Created temporary directory: $TEMP_DIR${NC}"

# Cleanup function
cleanup() {
    echo -e "${YELLOW}Cleaning up temporary files...${NC}"
    rm -rf "$TEMP_DIR"
    echo -e "${GREEN}Cleanup complete${NC}"
}
trap cleanup EXIT

# Get file info
TOTAL_LINES=$(wc -l < "$SQL_FILE")
FILE_SIZE=$(du -h "$SQL_FILE" | cut -f1)
echo -e "${GREEN}File: $SQL_FILE${NC}"
echo -e "${GREEN}Size: $FILE_SIZE${NC}"
echo -e "${GREEN}Lines: $TOTAL_LINES${NC}"
echo -e "${GREEN}Chunk size: $CHUNK_SIZE lines${NC}"
echo ""

# Calculate number of chunks
NUM_CHUNKS=$(( (TOTAL_LINES + CHUNK_SIZE - 1) / CHUNK_SIZE ))
echo -e "${YELLOW}Splitting into $NUM_CHUNKS chunks...${NC}"

# Extract PRAGMA if present
PRAGMA_LINE=""
if head -1 "$SQL_FILE" | grep -q "PRAGMA"; then
    PRAGMA_LINE=$(head -1 "$SQL_FILE")
    echo -e "${GREEN}Found PRAGMA: $PRAGMA_LINE${NC}"
fi

# Split the file
echo -e "${YELLOW}Splitting file...${NC}"
if [ -n "$PRAGMA_LINE" ]; then
    # Skip the PRAGMA line when splitting
    tail -n +2 "$SQL_FILE" | split -l "$CHUNK_SIZE" - "$TEMP_DIR/chunk_"
else
    split -l "$CHUNK_SIZE" "$SQL_FILE" "$TEMP_DIR/chunk_"
fi

# Add PRAGMA and convert INSERT to INSERT OR IGNORE for each chunk
echo -e "${YELLOW}Processing chunks (converting INSERT to INSERT OR IGNORE)...${NC}"
for chunk in "$TEMP_DIR"/chunk_*; do
    # Create temp file
    if [ -n "$PRAGMA_LINE" ]; then
        echo "$PRAGMA_LINE" > "$chunk.tmp"
    else
        > "$chunk.tmp"
    fi

    # Convert INSERT INTO to INSERT OR IGNORE INTO and append to temp file
    sed 's/^INSERT INTO/INSERT OR IGNORE INTO/g' "$chunk" >> "$chunk.tmp"
    mv "$chunk.tmp" "$chunk"
done

echo -e "${GREEN}File split into $(ls "$TEMP_DIR"/chunk_* | wc -l) chunks${NC}"
echo ""

# Upload chunks
CHUNK_NUM=0
FAILED=0
for chunk in "$TEMP_DIR"/chunk_*; do
    CHUNK_NUM=$((CHUNK_NUM + 1))
    CHUNK_LINES=$(wc -l < "$chunk")

    echo -e "${YELLOW}[$CHUNK_NUM/$NUM_CHUNKS] Uploading chunk with $CHUNK_LINES lines...${NC}"

    if yes | npx wrangler d1 execute "$DATABASE_ID" --remote --file="$chunk" 2>&1; then
        echo -e "${GREEN}[$CHUNK_NUM/$NUM_CHUNKS] ✓ Success${NC}"
    else
        echo -e "${RED}[$CHUNK_NUM/$NUM_CHUNKS] ✗ Failed${NC}"
        FAILED=$((FAILED + 1))
    fi

    echo ""

    # Small delay to avoid rate limiting
    sleep 0.5
done

# Summary
echo ""
echo "================================"
echo -e "${GREEN}Upload Summary${NC}"
echo "================================"
echo "Total chunks: $NUM_CHUNKS"
echo "Successful: $((NUM_CHUNKS - FAILED))"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All chunks uploaded successfully!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some chunks failed to upload${NC}"
    exit 1
fi
