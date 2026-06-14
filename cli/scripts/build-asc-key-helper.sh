#!/usr/bin/env bash
#
# Build the precompiled App Store Connect API-key helper (a native macOS Swift
# app) as a universal (arm64 + x86_64) release binary, ready to ship as a
# downloadable artifact for `@capgo/cli build credentials apple-key`.
#
# The CLI itself does NOT bundle this macOS-only binary in its npm tarball
# (that would bloat every Linux/Windows install). Instead it locates the binary
# at runtime via:
#   1. CAPGO_ASC_KEY_HELPER_PATH  (dev / CI / this script's output)
#   2. ~/.capgo/asc-key-helper/capgo-asc-key-helper  (cached download)
#
# Usage:
#   scripts/build-asc-key-helper.sh [path-to-helper-swift-package] [out-dir]
#
# Defaults to the in-repo package at cli/native/asc-key-helper.
#
# Example:
#   scripts/build-asc-key-helper.sh                 # builds the vendored package
#   export CAPGO_ASC_KEY_HELPER_PATH="$PWD/dist-helper/capgo-asc-key-helper"
#
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: the ASC key helper can only be built on macOS." >&2
  exit 1
fi

# Default to the vendored package next to this script (cli/native/asc-key-helper).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_SRC="$SCRIPT_DIR/../native/asc-key-helper"
SRC_DIR="${1:-$DEFAULT_SRC}"
OUT_DIR="${2:-dist-helper}"
PRODUCT_NAME="P8Extract"          # SwiftPM executable product name
OUT_BINARY="capgo-asc-key-helper" # canonical name the CLI looks for

if [[ ! -f "$SRC_DIR/Package.swift" ]]; then
  echo "error: no Package.swift at '$SRC_DIR'." >&2
  echo "usage: $0 [path-to-helper-swift-package] [out-dir]" >&2
  exit 1
fi

echo "› Building universal release binary from $SRC_DIR ..."
swift build \
  --package-path "$SRC_DIR" \
  -c release \
  --arch arm64 \
  --arch x86_64

BUILT="$SRC_DIR/.build/apple/Products/Release/$PRODUCT_NAME"
if [[ ! -f "$BUILT" ]]; then
  # Fall back to a single-arch RELEASE build if a universal one wasn't produced.
  # Restrict to */release/* so a stale debug artifact from a prior build can
  # never be picked up and shipped.
  BUILT="$(find "$SRC_DIR/.build" -maxdepth 3 -path "*/release/*" -name "$PRODUCT_NAME" -type f -perm -111 | head -1)"
fi
if [[ -z "${BUILT:-}" || ! -f "$BUILT" ]]; then
  echo "error: could not find built product '$PRODUCT_NAME' under $SRC_DIR/.build" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cp "$BUILT" "$OUT_DIR/$OUT_BINARY"
chmod +x "$OUT_DIR/$OUT_BINARY"

echo "› Architectures:"
lipo -info "$OUT_DIR/$OUT_BINARY" || true
echo "› SHA-256:"
shasum -a 256 "$OUT_DIR/$OUT_BINARY"

echo ""
echo "✅ Built $OUT_DIR/$OUT_BINARY"
echo "   Try it:  CAPGO_ASC_KEY_HELPER_PATH=\"$PWD/$OUT_DIR/$OUT_BINARY\" npx @capgo/cli build credentials apple-key"
echo ""
echo "ℹ️  For distribution, codesign + notarize this binary before publishing:"
echo "     codesign --force --options runtime --sign \"Developer ID Application: …\" \"$OUT_DIR/$OUT_BINARY\""
echo "     xcrun notarytool submit … && xcrun stapler staple …"
