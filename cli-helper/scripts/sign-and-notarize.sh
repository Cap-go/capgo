#!/usr/bin/env bash
# Codesign (hardened runtime + timestamp) and notarize both helper binaries,
# then verify each against the same designated requirement the CLI enforces
# at runtime — a cert/team mismatch fails the release, not the user.
#
# Required env:
#   DEVELOPER_ID_IDENTITY   codesign identity, e.g. "Developer ID Application: <name> (<TEAMID>)"
#   CAPGO_APPLE_TEAM_ID     10-char Apple Team ID (must match macos-signing.ts)
#   APPLE_KEY_ID            App Store Connect API key id
#   APPLE_ISSUER_ID         App Store Connect API key issuer
#   APPLE_KEY_PATH          path to the API key .p8 file
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEVELOPER_ID_IDENTITY:?}" "${CAPGO_APPLE_TEAM_ID:?}" "${APPLE_KEY_ID:?}" "${APPLE_ISSUER_ID:?}" "${APPLE_KEY_PATH:?}"

REQUIREMENT='=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = "'"$CAPGO_APPLE_TEAM_ID"'"'

# Stable code-signing identifier. macOS keys the Keychain "Always Allow" grant
# to the code's designated requirement, which includes this identifier — so
# pinning it now keeps users' grants intact across future re-signs, including a
# possible migration to a `Capgo.app` bundle that reuses the SAME
# CFBundleIdentifier. Never change this value. See "Future: native
# notifications & UI" in the design spec.
HELPER_IDENTIFIER="app.capgo.cli.helper"

for arch in arm64 x64; do
  bin="dist/helper-$arch"
  echo "── Signing $bin"
  codesign --force --sign "$DEVELOPER_ID_IDENTITY" --identifier "$HELPER_IDENTIFIER" --options runtime --timestamp "$bin"

  echo "── Notarizing $bin"
  ditto -c -k "$bin" "$bin.zip"
  out=$(xcrun notarytool submit "$bin.zip" \
    --key "$APPLE_KEY_PATH" --key-id "$APPLE_KEY_ID" --issuer "$APPLE_ISSUER_ID" \
    --wait --timeout 30m --output-format json) || true
  id=$(echo "$out" | jq -r '.id // empty')
  status=$(echo "$out" | jq -r '.status // empty')
  if [ "$status" != "Accepted" ]; then
    echo "Notarization failed for $bin (status: ${status:-unknown})" >&2
    if [ -n "$id" ]; then
      xcrun notarytool log "$id" \
        --key "$APPLE_KEY_PATH" --key-id "$APPLE_KEY_ID" --issuer "$APPLE_ISSUER_ID" >&2 || true
    fi
    exit 1
  fi
  echo "── Notarization accepted ($id)"

  echo "── Verifying $bin"
  codesign --verify --strict "$bin"
  codesign --verify --strict -R "$REQUIREMENT" "$bin"
done
echo "All binaries signed, notarized, and verified."
