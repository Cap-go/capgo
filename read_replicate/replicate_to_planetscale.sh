#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> NOTE: replicate_to_planetscale.sh was renamed to replicate_to_replica.sh (PlanetScale + Google)."
echo "==> This wrapper will be removed later. Please use ./replicate_to_replica.sh"
echo ""

exec "${SCRIPT_DIR}/replicate_to_replica.sh" "$@"

