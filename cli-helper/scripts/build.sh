#!/usr/bin/env bash
# Build Capgo.app bundles (one per macOS arch) wrapping the keychain helper.
#
# Hidden agent app (LSUIElement = no Dock icon, not in Cmd-Tab) branded "Capgo",
# so the macOS Keychain prompts shown during export display the Capgo name +
# icon. The bundle identifier (app.capgo.cli.helper, from Info.plist) keys the
# Keychain "Always Allow" grant and is part of the codesign designated
# requirement the CLI enforces at runtime.
#
#   Usage: build.sh [VERSION]
# VERSION is baked into Info.plist BEFORE signing (changing it after signing
# would break the seal). Defaults to 0.0.0 for local dev builds.
#
# arm64 targets macOS 11 (first Apple Silicon release); x64 targets 10.15
# (oldest macOS that can run Node 20, the CLI's floor).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-0.0.0}"
ASSETS="assets"
rm -rf dist
mkdir -p dist

build_arch() {
  local arch="$1" target="$2" minos="$3"
  local app="dist/$arch/Capgo.app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  swiftc src/helper.swift -framework Security -O -target "$target" \
    -o "$app/Contents/MacOS/capgo"
  chmod +x "$app/Contents/MacOS/capgo"
  cp "$ASSETS/Capgo.icns" "$app/Contents/Resources/Capgo.icns"
  sed -e "s/__VERSION__/$VERSION/g" -e "s/__MINOS__/$minos/g" \
    "$ASSETS/Info.plist.template" > "$app/Contents/Info.plist"
  echo "Built $app (v$VERSION):"
  file "$app/Contents/MacOS/capgo"
}

build_arch arm64 arm64-apple-macos11     11.0
build_arch x64   x86_64-apple-macos10.15  10.15
