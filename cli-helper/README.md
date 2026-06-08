# Capgo CLI keychain helper

Small Swift program (Security framework only) shipped as one generic binary
named `helper`. Today it has a single subcommand:

    helper keychain-export --sha1 <40-hex> --output <path.p12> \
      --passphrase <wrap-pass> --invoked-by capgo-cli

It exports one code-signing identity from the macOS Keychain as a
passphrase-wrapped PKCS#12 and always emits one line of JSON on stdout
(`{"ok":true,...}` or `{"ok":false,"errorCode":...}`). Future helpers are new
subcommands of the same signed binary.

Shipped as two precompiled, Developer-ID-signed, notarized npm packages:

- `@capgo/cli-keychain-darwin-arm64` (Apple Silicon, macOS 11+)
- `@capgo/cli-keychain-darwin-x64` (Intel, macOS 10.15+)

Both are `optionalDependencies` of `@capgo/cli`; npm installs at most one. The
CLI verifies the binary's code signature (Developer ID + Capgo Team ID) before
every execution and refuses to run anything else. See SECURITY.md for the
threat model.

## Dev bootstrap (working on the Swift source)

The published CLI has no compile fallback. To test local Swift changes:

    swiftc cli-helper/src/helper.swift -framework Security -O -o /tmp/helper-dev
    cd cli && NODE_ENV=development bun run build
    CAPGO_KEYCHAIN_HELPER_PATH=/tmp/helper-dev node dist/index.js ...

`CAPGO_KEYCHAIN_HELPER_PATH` only exists in dev builds — it is dead-code-
eliminated from npm release builds (asserted in CI). The env-override path
skips both the signature check and the subcommand wrapper, so point it at a
binary you built and trust.

## Release

1. Bump nothing in-repo — the version comes from the dispatch input.
2. Run the workflow from the GitHub Actions UI ("Run workflow" → enter the
   version), or: `gh workflow run publish_cli_helper.yml -f version=X.Y.Z`
3. `.github/workflows/publish_cli_helper.yml` builds, signs, notarizes,
   smoke-tests, publishes both packages with npm provenance, and creates the
   `cli-helper-X.Y.Z` tag + GitHub release.
4. Release only when `src/helper.swift` actually changed.

Required GitHub secrets: `DEVELOPER_ID_CERT_BASE64`, `DEVELOPER_ID_CERT_PASSWORD`
(Developer ID Application cert as base64 .p12), `APPLE_TEAM_ID`, plus existing
`APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_CONTENT` (App Store Connect API
key, used by notarytool) and `NPM_TOKEN`.
