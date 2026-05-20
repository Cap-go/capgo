#!/usr/bin/env bash

set -euo pipefail

SCHEMA_FILE='read_replicate/schema_replicate.sql'

echo "Generating ${SCHEMA_FILE} from the current database schema..."
bash read_replicate/replicate_prepare.sh

if git diff --quiet -- "${SCHEMA_FILE}"; then
  echo "Read-replica schema is up to date."
  exit 0
fi

echo "::error title=Read-replica schema is out of date::${SCHEMA_FILE} changed after running bun run readreplicate:prepare."
echo ''
echo "The PR changes the schema replicated to Google read replicas."
echo "Before merge:"
echo "  1. Run: bun run readreplicate:prepare"
echo "  2. Apply the matching migration to the Google read replica."
echo "  3. Commit the updated ${SCHEMA_FILE}."
echo ''
echo "Diff:"
git --no-pager diff -- "${SCHEMA_FILE}"
exit 1
