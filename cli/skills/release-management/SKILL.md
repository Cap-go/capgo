---
name: release-management
description: Use when working on Capgo OTA release workflows including bundle uploads, compatibility checks, channel management, cleanup, and encryption key setup.
---

# Capgo CLI Release Management

Use this skill for OTA update workflows in Capgo Cloud.

## Shared notes

- Prefer `npx @capgo/cli@latest ...` examples.
- `appId` can often be inferred from the current Capacitor project.
- Shared public flags often include `-a, --apikey`.

## Bundle workflows

### `bundle upload [appId]`

- Alias: `u`
- Example: `npx @capgo/cli@latest bundle upload com.example.app --path ./dist --channel production`
- Key behavior:
  - Bundle version must be greater than `0.0.0` and unique.
  - Deleted versions cannot be reused.
  - External URL mode is useful for very large or privacy-sensitive bundles.
  - Encryption is recommended for trustless distribution.
  - Interactive prompts are disabled automatically in CI and other non-interactive sessions so uploads do not block automation.
  - Optional upload prompts can remember the user's answer on the current machine so future uploads can skip the same question.
- Important options:
  - `-p, --path <path>`
  - `-c, --channel <channel>`
  - `-e, --external <url>`
  - `--iv-session-key <key>`
  - `-b, --bundle <bundle>`
  - `--link <link>`
  - `--comment <comment>`
  - `--min-update-version <minUpdateVersion>`
  - `--auto-min-update-version`
  - `--ignore-metadata-check`
  - `--ignore-checksum-check`
  - `--force-crc32-checksum`
  - `--timeout <timeout>`
  - `--zip`
  - `--tus`
  - `--tus-chunk-size <tusChunkSize>`
  - `--delta`
  - `--delta-only`
  - `--no-delta`
  - `--encrypted-checksum <encryptedChecksum>`
  - `--auto-set-bundle`
  - `--dry-upload`
  - `--package-json <packageJson>`
  - `--node-modules <nodeModules>`
  - `--encrypt-partial`
  - `--delete-linked-bundle-on-upload`
  - `--no-brotli-patterns <patterns>`
  - `--disable-brotli`
  - `--version-exists-ok`
  - `--self-assign`
  - S3 options: `--s3-region`, `--s3-apikey`, `--s3-apisecret`, `--s3-endpoint`, `--s3-bucket-name`, `--s3-port`, `--no-s3-ssl`
  - Signing options: `--key-v2`, `--key-data-v2`, `--bundle-url`, `--no-key`, `--display-iv-session`
  - Deprecated options still supported: `--multipart`, `--partial`, `--partial-only`

### `bundle compatibility [appId]`

- Example: `npx @capgo/cli@latest bundle compatibility com.example.app --channel production`
- Use to check whether a bundle is safe for a given channel.
- Key options:
  - `-c, --channel <channel>`
  - `--text`
  - `--package-json <packageJson>`
  - `--node-modules <nodeModules>`

### `bundle releaseType [appId]`

- Example: `npx @capgo/cli@latest bundle releaseType com.example.app --channel production`
- Prints `native` or `OTA` based on channel compatibility.
- Key options:
  - `-c, --channel <channel>`
  - `--package-json <packageJson>`
  - `--node-modules <nodeModules>`

### `bundle list [appId]`

- Alias: `l`
- Example: `npx @capgo/cli@latest bundle list com.example.app`

### `bundle delete [bundleId] [appId]`

- Alias: `d`
- Example: `npx @capgo/cli@latest bundle delete BUNDLE_ID com.example.app`

### `bundle cleanup [appId]`

- Alias: `c`
- Example: `npx @capgo/cli@latest bundle cleanup com.example.app --bundle=1.0 --keep=3`
- Notes:
  - Linked bundles are preserved unless `--ignore-channel` is used.
- Key options:
  - `-b, --bundle <bundle>`
  - `-k, --keep <keep>`
  - `-f, --force`
  - `--ignore-channel`

### `bundle zip [appId]`

- Example: `npx @capgo/cli@latest bundle zip com.example.app --path ./dist`
- Notes:
  - Produces a checksum for encryption workflows.
  - Use `--json` for machine-readable output.
- Key options:
  - `-p, --path <path>`
  - `-b, --bundle <bundle>`
  - `-n, --name <name>`
  - `-j, --json`
  - `--no-code-check`
  - `--key-v2`
  - `--package-json <packageJson>`

### `bundle encrypt [zipPath] [checksum]`

- Example: `npx @capgo/cli@latest bundle encrypt ./myapp.zip CHECKSUM`
- Notes:
  - Returns the `ivSessionKey` needed for upload and later decryption.
- Key options:
  - `--key <key>`
  - `--key-data <keyData>`
  - `-j, --json`
  - `--package-json <packageJson>`

### `bundle decrypt [zipPath] [checksum]`

- Example: `npx @capgo/cli@latest bundle decrypt ./myapp_encrypted.zip CHECKSUM`
- Notes:
  - Mainly for testing.
  - Prints the base64 session key for verification.
- Key options:
  - `--key <key>`
  - `--key-data <keyData>`
  - `--checksum <checksum>`
  - `--package-json <packageJson>`

## Channel workflows

### `channel add [channelId] [appId]`

- Alias: `a`
- Example: `npx @capgo/cli@latest channel add production com.example.app --default`
- Key options:
  - `-d, --default`
  - `--self-assign`

### `channel list [appId]`

- Alias: `l`
- Example: `npx @capgo/cli@latest channel list com.example.app`

### `channel delete [channelId] [appId]`

- Alias: `d`
- Example: `npx @capgo/cli@latest channel delete production com.example.app`
- Key options:
  - `--delete-bundle`
  - `--success-if-not-found`

### `channel currentBundle [channel] [appId]`

- Example: `npx @capgo/cli@latest channel currentBundle production com.example.app`
- Key options:
  - `-c, --channel <channel>`
  - `--quiet`

### `channel set [channelId] [appId]`

- Alias: `s`
- Example: `npx @capgo/cli@latest channel set production com.example.app --bundle 1.0.0 --state default`
- Notes:
  - One channel must remain default.
  - Supports update policies `major`, `minor`, `metadata`, `patch`, and `none`.
  - Supports platform and device targeting.
- Key options:
  - `-b, --bundle <bundle>`
  - `-s, --state <state>`
  - `--latest-remote`
  - `--latest`
  - `--downgrade`, `--no-downgrade`
  - `--ios`, `--no-ios`
  - `--android`, `--no-android`
  - `--self-assign`, `--no-self-assign`
  - `--disable-auto-update <disableAutoUpdate>`
  - `--dev`, `--no-dev`
  - `--prod`, `--no-prod`
  - `--emulator`, `--no-emulator`
  - `--device`, `--no-device`
  - `--package-json <packageJson>`
  - `--ignore-metadata-check`

## Encryption key workflows

### `key save`

- Example: `npx @capgo/cli@latest key save --key ./path/to/key.pub`
- Notes:
  - Saves the public key in Capacitor config.
  - Useful for CI.
  - Recommended not to commit the key.
- Key options:
  - `-f, --force`
  - `--key <key>`
  - `--key-data <keyData>`

### `key create`

- Example: `npx @capgo/cli@latest key create`
- Notes:
  - Creates `.capgo_key_v2` and `.capgo_key_v2.pub`.
  - Saves the public key to Capacitor config.
  - Never commit the private key.
- Key options:
  - `-f, --force`

### `key delete_old`

- Example: `npx @capgo/cli@latest key delete_old`
