# Security model — Capgo CLI keychain helper

## The boundary is the macOS Keychain ACL, not this binary

Exporting a code-signing private key triggers an OS-level Keychain prompt
("Allow" / "Always Allow") that macOS enforces against the **calling binary's
code signature**. That prompt — not anything in this helper or in `@capgo/cli`
— is the security boundary.

## Invoking the helper grants no privilege

An attacker who can run this `helper` on a victim's machine already has local
code execution as that user, and can call Apple's own `SecItemExport` or
`/usr/bin/security export` directly. This helper is a worse-for-them version of
tools already present on every Mac. It is **not** a privilege escalation.

## Why we don't authenticate the caller

- The CLI runs as `node dist/index.js`; **node is signed by the user's Node
  install, not by Capgo** — there is no Capgo signature on the parent to pin.
- A shared secret would live in readable JavaScript in the npm tarball.
- Parent-PID checks are TOCTOU-racy and subject to PID reuse.

## What we do instead

- The CLI verifies **this binary's** Developer ID + Capgo Team ID signature
  before running it (protects the CLI from a swapped helper).
- The sensitive `keychain-export` subcommand has an **anti-footgun gate**
  (requires an internal `--invoked-by capgo-cli` handshake and a non-TTY
  stdout). This stops casual/accidental/naive-script misuse. **It is explicitly
  not a security boundary** — a determined local attacker reads the handshake
  out of the open-source CLI. It exists to keep honest software honest.

## Reporting expectation

Demonstrating that you can invoke this helper yourself, or that doing so exports
a key after the user grants the macOS prompt, is **out of scope by design** — it
is equivalent to calling Apple's keychain APIs, which any local process with the
user's privileges can already do. Reports must show a privilege boundary being
crossed that the OS would otherwise enforce.
