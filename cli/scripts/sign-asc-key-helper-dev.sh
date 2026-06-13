#!/usr/bin/env bash
#
# DEV-ONLY local signing for testing Apple sign-in persistence.
#
# WKWebsiteDataStore(forIdentifier:) only persists when the helper runs as a
# real app — a bundle-less raw executable has no WebKit container, so macOS
# SIGKILLs it. This wraps the compiled helper in a minimal .app bundle (giving it
# a CFBundleIdentifier) and ad-hoc code-signs it, which is enough for WebKit to
# create a persistent store at ~/Library/WebKit/<bundle-id>/. The signature is
# valid only on this machine — for distribution, sign + notarize the .app in CI.
#
# Persistence is automatic once running as an .app (no env flag) — the helper
# detects its bundle id and persists the session.
#
# Usage:
#   scripts/sign-asc-key-helper-dev.sh [path-to-helper-binary]
#
# Defaults to dist-helper/capgo-asc-key-helper (the build-asc-key-helper.sh out).
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: dev signing only runs on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_BIN="${1:-$SCRIPT_DIR/../dist-helper/capgo-asc-key-helper}"
APP_NAME="CapgoAscKeyHelper"
BUNDLE_ID="app.capgo.asc-key-helper"

if [[ ! -f "$HELPER_BIN" ]]; then
  echo "error: helper binary not found at '$HELPER_BIN'." >&2
  echo "build it first: scripts/build-asc-key-helper.sh" >&2
  exit 1
fi

OUT_DIR="$(cd "$(dirname "$HELPER_BIN")" && pwd)"
APP="$OUT_DIR/$APP_NAME.app"
INNER="$APP/Contents/MacOS/$APP_NAME"

echo "› Building minimal .app bundle: $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$HELPER_BIN" "$INNER"
chmod +x "$INNER"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST

echo "› Ad-hoc signing (valid on this Mac only)"
codesign --force --deep --sign - "$APP"
codesign --verify --verbose=2 "$APP"

echo ""
echo "✅ Signed dev app: $APP"
echo "   WebKit persists the session at ~/Library/WebKit/$BUNDLE_ID/"
echo ""
echo "Test persistence (sign in once, quit, run again — you should stay logged in):"
echo ""
echo "  CAPGO_ASC_KEY_HELPER_PATH=\"$INNER\" \\"
echo "    node dist/index.js build init"
echo ""
echo "Reset the saved session:  rm -rf ~/Library/WebKit/$BUNDLE_ID"
