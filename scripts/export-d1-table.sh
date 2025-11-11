#!/bin/bash

# Generic script to export a table from Cloudflare D1 database
# Usage: ./scripts/export-d1-table.sh <table_name> <location>

set -e

# Configuration
TABLE_NAME="${1}"
LOCATION="${2}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate arguments
if [ -z "$TABLE_NAME" ] || [ -z "$LOCATION" ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 <table_name> <location>"
    echo ""
    echo "Arguments:"
    echo "  table_name  - Name of the table to export (e.g., manifest, apps, channels)"
    echo "  location    - Database location (eu, na, oc, as, etc.)"
    echo ""
    echo "Examples:"
    echo "  $0 manifest eu"
    echo "  $0 stripe_info as"
    echo "  $0 apps na"
    echo "  $0 channels oc"
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
    as)
        DATABASE_ID="capgo_replicate_as"
        ;;
    *)
        # Assume the location is a custom database ID
        DATABASE_ID="$LOCATION"
        echo -e "${YELLOW}Using custom database ID: $DATABASE_ID${NC}"
        ;;
esac

# Construct output file path
OUTPUT_FILE="database_${TABLE_NAME}.sql"

echo -e "${GREEN}Exporting table '$TABLE_NAME' from database '$DATABASE_ID'...${NC}"
echo -e "${YELLOW}Output file: $OUTPUT_FILE${NC}"
echo ""

# Export the table
if npx wrangler d1 export "$DATABASE_ID" --remote --output="./$OUTPUT_FILE" --no-schema --table="$TABLE_NAME"; then
    echo ""
    echo -e "${GREEN}✓ Export successful!${NC}"

    # Show file info
    if [ -f "$OUTPUT_FILE" ]; then
        FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
        LINE_COUNT=$(wc -l < "$OUTPUT_FILE")
        echo -e "${GREEN}File: $OUTPUT_FILE${NC}"
        echo -e "${GREEN}Size: $FILE_SIZE${NC}"
        echo -e "${GREEN}Lines: $LINE_COUNT${NC}"
    fi
    exit 0
else
    echo ""
    echo -e "${RED}✗ Export failed${NC}"
    exit 1
fi
