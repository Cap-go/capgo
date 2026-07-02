# Capgo App Store Connect API-key helper (macOS)

A native macOS SwiftUI app that guides a user through creating an App Store
Connect **team** API key inside an embedded browser — auto-capturing the Issuer
ID + Key ID, intercepting the one-time `.p8`, validating it against Apple, and
saving it to `~/.appstoreconnect/private_keys/`.

The Capgo CLI spawns the **precompiled** binary from the iOS build-credentials
onboarding (`build init`) when the user has no `.p8` yet, and from
`build credentials apple-key`. The helper streams a stdout **stats protocol**
(`Sources/Models/StatsProtocol.swift`) that the CLI forwards to PostHog; see
`../../src/build/onboarding/asc-key/PROTOCOL.md`.

## Build

```bash
# Universal (arm64 + x86_64) release binary:
../../scripts/build-asc-key-helper.sh

# Or directly with SwiftPM (single arch, for dev):
swift build -c release
# → .build/release/P8Extract
```

The binary is **not** shipped in the npm tarball (macOS-only). The CLI locates
it via `CAPGO_ASC_KEY_HELPER_PATH`, the `~/.capgo/asc-key-helper/` cache, or a
local `.build/` product during development.

Portions adapted from AppStoreConnectKit (MIT) — see `THIRD-PARTY-LICENSES.md`.
