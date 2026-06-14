# Capgo CLI keychain helper

Small Swift program (Security framework only), shipped inside a hidden macOS
app bundle, **`CapgoKeychainHelper.app`**. The single binary uses subcommand dispatch — today
just `keychain-export`:

    CapgoKeychainHelper.app/Contents/MacOS/capgo keychain-export \
      --sha1 <40-hex> --output <path.p12> --passphrase <wrap-pass> --invoked-by capgo-cli

It exports one code-signing identity from the macOS Keychain as a
passphrase-wrapped PKCS#12 and always emits one line of JSON on stdout
(`{"ok":true,...}` or `{"ok":false,"errorCode":...}`). Future helpers are new
subcommands of the same signed binary.

## Why a bundle (not a bare binary)

`CapgoKeychainHelper.app` is an **`LSUIElement` agent** — no Dock icon, no Cmd-Tab entry, no
window; it runs headlessly and exits. The bundle gives two things a bare binary
can't:

- **Branded Keychain prompts.** Because the export runs from inside a signed
  `CapgoKeychainHelper.app`, the macOS Keychain "Allow / Always Allow" prompts show the
  **Capgo name + icon** instead of a generic process name. (This requires the
  bundle to be signed — see the dev note below.)
- **Stable ACL identity.** `CFBundleIdentifier = app.capgo.cli.helper` keys the
  Keychain "Always Allow" grant, and it never changes across releases, so the
  grant persists across CLI upgrades. The CLI also verifies the bundle's
  Developer ID + Capgo Team ID code signature before running it.

The CLI execs `CapgoKeychainHelper.app/Contents/MacOS/capgo` **directly** (never `open
CapgoKeychainHelper.app`), so there is no Dock flash and no Gatekeeper "downloaded from the
internet" prompt (npm doesn't set the quarantine xattr; direct exec isn't a
LaunchServices launch).

Shipped as two precompiled, Developer-ID-signed, notarized, **stapled** npm
packages:

- `@capgo/cli-helper-darwin-arm64` (Apple Silicon, macOS 11+)
- `@capgo/cli-helper-darwin-x64` (Intel, macOS 10.15+)

Both are `optionalDependencies` of `@capgo/cli`; npm installs at most one. Each
ships TWO signed bundles: `CapgoKeychainHelper.app` (the keychain helper
described here, per-arch) and `CapgoAscKeyHelper.app` (the App Store Connect API
key helper, a universal bundle — see `cli/native/asc-key-helper`). See
SECURITY.md for the threat model.

## Dev bootstrap (working on the Swift source)

The published CLI has no compile fallback. To test local Swift changes quickly:

    swiftc cli-helper/src/helper.swift -framework Security -O -o /tmp/helper-dev
    cd cli && NODE_ENV=development bun run build
    CAPGO_KEYCHAIN_HELPER_PATH=/tmp/helper-dev node dist/index.js ...

`CAPGO_KEYCHAIN_HELPER_PATH` only exists in dev builds — it is dead-code-
eliminated from npm release builds (asserted in CI). The env-override path skips
both the signature check and the bundle, so point it at a binary you built and
trust. Note: a bare dev binary is **not** signed, so the Keychain prompt shows
the process name, not "Capgo" — to see the branded prompt, build + sign the
bundle (`bash cli-helper/scripts/build.sh` then `codesign … CapgoKeychainHelper.app`).

## Release

The workflow has two triggers:

- **Normal release** — the deliberate button: GitHub Actions UI → "Run
  workflow" → enter the version, or `gh workflow run publish_cli_helper.yml -f
  version=X.Y.Z`. (`workflow_dispatch` requires the workflow to be on the
  default branch.)
- **Test from a branch / manual release** — push a `cli-helper-X.Y.Z` tag.
  The workflow runs the version of itself *at that tagged commit*, so you can
  validate the whole pipeline from a PR branch without merging:

      git tag cli-helper-1.0.0-rc.1            # tags your current HEAD
      git push origin cli-helper-1.0.0-rc.1

  (Use a `-rc.N` prerelease for tests — npm versions are immutable. The Apple
  secrets below must exist for the signing steps to pass.)

Either way it builds, signs, notarizes, staples, smoke-tests, publishes both
packages with npm provenance, and creates the `cli-helper-X.Y.Z` tag + GitHub
release. Release only when `src/helper.swift` actually changed.

**npm dist-tag:** while the packages are new/unproven they publish under the
**`rc`** dist-tag, not `latest`, so they never become the default bare install.
This doesn't affect `@capgo/cli`, whose `optionalDependencies` (`^1.0.0`)
resolve against published *versions*, not dist-tags. Promote to stable later by
dropping `--tag rc` in the workflow or `npm dist-tag add <pkg>@<version> latest`.

Required GitHub secrets: `DEVELOPER_ID_CERT_BASE64`, `DEVELOPER_ID_CERT_PASSWORD`
(Developer ID Application cert as base64 .p12), `APPLE_TEAM_ID`, plus existing
`APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_CONTENT` (App Store Connect API
key, used by notarytool) and `NPM_TOKEN`.
