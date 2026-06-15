# Capgo Builder — Contact Support (Simplified: local logs file + `mailto:`, no backend)

**Date:** 2026-06-03
**Status:** ✅ **Active plan.** Supersedes the backend/Email-Service/bridge design in
[`2026-06-03-builder-contact-support-design.md`](./2026-06-03-builder-contact-support-design.md)
(that approach was shelved as too complex — kept as the rejected-alternative record).
**Scope:** Capgo **builder** CLI flows only.

---

## 1. Goal

Make "get help" trivial, with **zero backend**: when a builder run fails, save the user's logs to a local file and open a pre-filled email to `support@capgo.app`. The user attaches the file and hits send. That's the whole feature.

---

## 2. Why this is simpler *and* more correct

Every hard problem in the shelved design came from **us** trying to send a ticket *programmatically* through the `Cap-go/automations` email↔Discord bridge (the `ownedOutboundCopy` heuristic, the double-delivery race from multiple bridge-routed `@capgo.app` recipients, CC/Reply-To threading, a backend proxy, Cloudflare Email Service limits…).

When the **user** sends the email from their own mail client, all of that evaporates:

- The user is a **genuine external sender** emailing `support@capgo.app` → the existing bridge ingests it natively, opens a Discord thread, and **replies thread back to the user automatically**. No `ownedOutboundCopy`, no race, no CC/Reply-To gymnastics.
- The team (incl. michael) sees the ticket in **Discord** as normal — no email fan-out, no relay.
- We build **none** of: backend endpoint, worker `/support`, Email Service binding, rate limiting, CC/BCC logic, bridge changes.

The only cost: `mailto:` can't auto-attach a file, so the user does one manual "attach + send." We make that one drag trivial (save the file, copy its path, reveal it in Finder on macOS).

---

## 3. Flow

1. **A hidden internal log** is captured during builder/onboarding runs (verbose, secret-redacted, CLI-only) — including **failures that aren't build failures** (onboarding errors, raw Apple/Google API errors). For build failures it also folds in the captured build log.
2. On failure, the menu offers **📨 Email Capgo support** (plus **🤖 Ask AI for help** when a build log exists — unchanged from today).
3. When the user picks **Email Capgo support**, the CLI **first shows a confirmation** — it explains *"We'll save your logs locally, reveal them in Finder (macOS), and open a pre-filled email to support@capgo.app in your mail app"* and asks the user to **continue or cancel**. The Finder-reveal clause is included only on macOS. Only on confirm does it proceed. On confirm it:
   - writes **ONE combined logs bundle** — saved in **both** forms so the user can attach whichever they prefer:
     - `~/.capgo-credentials/support/builder-support-<appId>-<ts>.log` (plain, human-readable)
     - `…/builder-support-<appId>-<ts>.log.gz` (compact)
   - **copies the GZIPPED file's path (`.log.gz`) to the clipboard** and, on macOS, **reveals it in Finder** (`open -R`) so it's a one-drag attach;
   - **opens `mailto:support@capgo.app`** with a pre-filled subject + short body;
   - prints a clear instruction: *"We opened an email to support@capgo.app and saved your logs to `<path>.log.gz` (copied to your clipboard). Attach that file and send."*
4. Done. No network calls of our own.

> **Confirmation gate (required):** picking "Email Capgo support" must always present a continue/cancel confirmation that tells the user everything about to happen — logs saved, **revealed in Finder on macOS**, and an email opened for them — never silently launch the mail client. The confirmation copy is platform-aware (the Finder-reveal clause appears only on macOS).
> **Clipboard:** copy the **`.log.gz`** path (the compressed file), not the plain `.log`.

### The `mailto:` link

```text
mailto:support@capgo.app
  ?subject=Capgo%20Builder%20support%20—%20<appId>%20(<platform>)
  &body=<short greeting + 1-line problem + tiny diagnostics summary +
         "Please attach the logs file saved at <path> (copied to your clipboard).">
```

- Keep the body **short** (mailto URLs are length-limited in practice ~1.8–2 KB) — full logs live in the attached file, never in the body.
- Opened via the existing `open` npm package (`open('mailto:…')`), which the CLI already uses everywhere.

---

## 4. Reuse map (everything already exists in `cli/src`)

| Need | Reuse |
|---|---|
| Open the mail client | `open` npm package (`import open from 'open'`) — already used in `init/command.ts`, `bundle/builder-cta.ts`, onboarding UIs |
| Save a file + tell the user where | the `.env` export pattern in `build/credentials-manage.ts` (`exportToEnvFile` / `exportCombinedEnvFile`) |
| Copy path to clipboard | `copyToClipboard()` in `build/credentials-manage.ts` (pbcopy / xclip / wl-copy) |
| Write the bundle | extend `writeOnboardingSupportBundle()` in `onboarding-support.ts` (already writes to `~/.capgo-credentials/support/`) |
| Gzip the `.gz` variant | `node:zlib` `gzipSync` |
| Verbose internal log for non-build failures | extend the `src/debug.ts` / internal-log idea |

---

## 5. The internal log

- **Module:** `cli/src/support/internal-log.ts` (new), append-as-you-go to `~/.capgo-credentials/support/internal-<appId>-<ts>.log` so it survives crashes/unhandled errors.
- **Captures:** all log levels incl. `debug`; external API request/response incl. **raw Apple (App Store Connect) and Google (Play) API errors**; shell commands (`cap add ios/android`, `pod install`, Gradle…) with stdout/stderr; diagnostics (OS/arch, Node, CLI version, package manager, Capgo/Capacitor versions, appId, platform, channel, step).
- **Secret redaction on write (CLI-only):** capgkey/API keys, tokens, Apple/Google keys & signing secrets — before bytes hit disk. Because masking is opaque otherwise, **the email body / CLI output tells the user secrets were removed.**
- Never shown during normal runs; surfaced only when help is requested.

---

## 6. Components to build (CLI only — no backend/worker/bridge changes)

- `cli/src/support/internal-log.ts` — verbose logger + CLI-only redaction; wire into builder/onboarding + API/shell call sites.
- Extend `writeOnboardingSupportBundle` (`onboarding-support.ts`) → one combined bundle (diagnostics + internal log + build log if any), and emit **both** `.log` and `.log.gz`.
- `cli/src/support/contact-support.ts` — orchestrate: write both files → copy path to clipboard → macOS Finder reveal → build the `mailto:` URL → `open()` it → print instructions. Graceful fallbacks (clipboard/reveal/open failures are non-fatal; always print the path + the `support@capgo.app` address).
- Wire **📨 Email Capgo support** into the failure menus in `build/onboarding/ui/steps/ios-shared.tsx`, the Android equivalent, and `init/command.ts` (support-first; AI offered only when a build log exists).
- Tests: redaction correctness, combined-bundle assembly, both-file output, `mailto:` URL construction (escaping, length cap on body), menu logic (AI shown iff build log), clipboard/reveal helpers (mocked).

---

## 7. Explicitly NOT built (vs the shelved design)

Backend `/build/support` endpoint · capgo_builder worker `/support` · Cloudflare Email Service / `send_email` binding · automations-bridge changes · CC/BCC/Reply-To logic · server-side rate limiting · double-delivery-race handling · Discord threading code. All of it is unnecessary because the user's own mail client sends the email and the existing bridge handles inbound natively.

---

## 8. Trade-offs

- **+** Tiny, CLI-only, no infra, no new failure modes; bridge behavior is correct by construction (user = real external sender).
- **+** Works offline up to the send step (file is saved locally regardless); if `mailto`/clipboard/reveal fail, the user still has the path + the address.
- **−** One manual step: the user attaches the file and clicks send (mailto can't auto-attach). Mitigated by clipboard + Finder reveal.
- **−** No automatic logs upload, so no server-side telemetry of support volume by default. (Optional: a lightweight local `sendEvent` "support email opened" could be added later, but it's not core and is out of scope here.)

---

## 9. Open items

1. Final `mailto:` subject/body copy and the CLI instruction wording.
2. Exact bundle filename/format and whether the `.gz` is on by default or produced alongside (current plan: produce both).
3. Non-macOS reveal behavior (Linux/Windows: print path + clipboard; no Finder reveal).
