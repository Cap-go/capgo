#!/bin/bash

# Generic script to upload any database table to Cloudflare D1 replica
# Usage: ./scripts/upload-table-to-d1.sh <table_name> <location> [chunk_size]

set -e

# Configuration
TABLE_NAME="${1}"
LOCATION="${2}"
CHUNK_SIZE="${3:-100000}"  # Default 100,000 lines per chunk

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate arguments
if [ -z "$TABLE_NAME" ] || [ -z "$LOCATION" ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 <table_name> <location> [chunk_size]"
    echo ""
    echo "Arguments:"
    echo "  table_name  - Name of the table (e.g., manifest, apps, channels)"
    echo "  location    - Database location (eu, na, oc, etc.)"
    echo "  chunk_size  - Optional: Lines per chunk (default: 100000)"
    echo ""
    echo "Examples:"
    echo "  $0 manifest eu"
    echo "  $0 manifest eu 50000"
    echo "  $0 apps na"
    echo "  $0 channels oc 200000"
    exit 1
fi

# Map location to database ID
case "$LOCATION" in
    eu)
        DATABASE_ID="capgo_replicate_eu"
        ;;
    na)
        DATABASE_ID="capgo_replicate_na"
        ;;
    oc)
        DATABASE_ID="capgo_replicate_oc"
        ;;
    *)
        # Assume the location is a custom database ID
        DATABASE_ID="$LOCATION"
        echo -e "${YELLOW}Using custom database ID: $DATABASE_ID${NC}"
        ;;
esac

# Construct SQL file path
SQL_FILE="database_${TABLE_NAME}.sql"

# Check if file exists
if [ ! -f "$SQL_FILE" ]; then
    echo -e "${RED}Error: File '$SQL_FILE' not found${NC}"
    echo "Make sure you have exported the table first"
    exit 1
fi

echo -e "${GREEN}Uploading table '$TABLE_NAME' to database '$DATABASE_ID'...${NC}"
echo ""

# Call the main upload script
./scripts/upload-d1-chunks.sh "$TABLE_NAME" "$SQL_FILE" "$CHUNK_SIZE" "$DATABASE_ID"
