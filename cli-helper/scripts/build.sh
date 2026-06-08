#!/usr/bin/env bash
# Compile helper for both macOS architectures into cli-helper/dist/.
# arm64 targets macOS 11 (first Apple Silicon release); x64 targets 10.15
# (oldest macOS that can run Node 20, the CLI's floor).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
swiftc src/helper.swift -framework Security -O \
  -target arm64-apple-macos11 -o dist/helper-arm64
swiftc src/helper.swift -framework Security -O \
  -target x86_64-apple-macos10.15 -o dist/helper-x64
echo "Built:"
file dist/helper-arm64 dist/helper-x64
