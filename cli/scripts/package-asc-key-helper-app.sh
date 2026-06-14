#!/usr/bin/env bash
#
# Build the App Store Connect key helper as a distributable .app bundle.
#
# Produces dist-helper/CapgoAscKeyHelper.app wrapping a UNIVERSAL (arm64 + x86_64)
# release binary, with a versioned Info.plist and the bundle id
# app.capgo.asc-key-helper (which keys the persistent WKWebsiteDataStore — see
# WebSessionStore.swift). The CI publish workflow then Developer ID signs +
# notarizes + staples this bundle. Signing is NOT done here.
#
#   Usage: package-asc-key-helper-app.sh [VERSION]
# VERSION is baked into Info.plist (defaults to 0.0.0 for local builds).
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: the ASC key helper only builds on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_DIR="$CLI_DIR/native/asc-key-helper"
PRODUCT_NAME="P8Extract"
APP_NAME="CapgoAscKeyHelper"
BUNDLE_ID="app.capgo.asc-key-helper"
VERSION="${1:-0.0.0}"

OUT_DIR="$CLI_DIR/dist-helper"
APP="$OUT_DIR/$APP_NAME.app"

echo "› Building universal release binary ($PRODUCT_NAME) ..."
swift build --package-path "$PKG_DIR" -c release --arch arm64 --arch x86_64

BUILT="$PKG_DIR/.build/apple/Products/Release/$PRODUCT_NAME"
if [[ ! -f "$BUILT" ]]; then
  # Fall back to a single-arch RELEASE build (never debug).
  BUILT="$(find "$PKG_DIR/.build" -maxdepth 3 -path "*/release/*" -name "$PRODUCT_NAME" -type f -perm -111 | head -1)"
fi
if [[ -z "${BUILT:-}" || ! -f "$BUILT" ]]; then
  echo "error: could not find built product '$PRODUCT_NAME' under $PKG_DIR/.build" >&2
  exit 1
fi

echo "› Wrapping $APP (v$VERSION)"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BUILT" "$APP/Contents/MacOS/$APP_NAME"
chmod +x "$APP/Contents/MacOS/$APP_NAME"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleName</key><string>Capgo</string>
  <key>CFBundleDisplayName</key><string>Capgo</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

echo "› Architectures:"
lipo -info "$APP/Contents/MacOS/$APP_NAME" || true
echo ""
echo "✅ Built $APP (v$VERSION)"
