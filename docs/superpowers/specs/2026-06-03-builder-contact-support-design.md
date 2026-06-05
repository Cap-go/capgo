# Capgo Builder — "Contact Support" & Easy Help Design

**Date:** 2026-06-03
**Status:** ⏸️ **Shelved — design complete, deemed too complex to build now (decision: Martin).** Preserved for future reference.

> **Outcome:** The feature was fully designed and stress-tested (sizing, Cloudflare Email Service limits, gzip/truncation, telemetry, and — most of all — integration with the `Cap-go/automations` email↔Discord bridge). The bridge integration is where the complexity concentrated: making a programmatically-sent ticket behave correctly through the bridge (avoiding the `ownedOutboundCopy` heuristic, the double-delivery race from multiple bridge-routed `@capgo.app` recipients, and reply threading for both the user and an internal recipient) kept surfacing edge cases. The cleanest robust path (a dedicated `POST /builder-ticket` endpoint in the automations worker, with the team working the ticket in Discord) was judged not worth the cost right now. This document captures the full analysis so the work isn't lost if the feature is revived. An implementation plan was intentionally **not** produced (§8 "Components to build" is the closest plan skeleton).
**Scope:** Capgo **builder** CLI flows only (build init, builder onboarding, and unhandled errors surfaced during these flows). Not the rest of the CLI; no standalone command.

---

## 1. Goal

Make it frictionless for a builder user to get help when something goes wrong, via two clearly-separated paths:

1. **Ask Capgo support** — send the user's logs to the Capgo team by email, CC the user, so the team can reply and the user receives it.
2. **Ask AI for help** — the existing AI build-log analysis (only meaningful when a build log exists).

A rich **internal log** is captured invisibly during every builder run and sent *in full* when help is requested — replacing today's truncated 12-line support bundle.

---

## 2. Triggers & menu

The unified help menu appears at three points, all within builder flows. **"Ask Capgo support" is always the first option.**

| Trigger | Has build log? | Menu options (in order) |
|---|---|---|
| Build failure | Yes (`jobId` + captured build log) | `📨 Ask Capgo support` · `🤖 Ask AI for help` · `🔄 Try again` · `❌ Exit` |
| Onboarding error (e.g. iOS/Android dependency sync fails) | No | `📨 Ask Capgo support` · `🔄 Try again` / `↩️ Restart onboarding` · `❌ Exit` |
| Unhandled / unexpected error (raw provider API error shown to user) | No | `📨 Ask Capgo support` · `🔄 Try again` · `❌ Exit` |

**AI is offered only when a build log exists** (build failures). For onboarding/unhandled errors AI is omitted entirely — only Capgo support.

### AI ↔ support relationship: fork + escalation

- AI and support are independent choices at the menu.
- After AI returns its analysis and the user is still stuck, the AI result screen gains an extra option:
  `📨 Still stuck — send this to Capgo support`
  which carries the **same logs PLUS the AI analysis** into the support email (no re-gathering).

---

## 3. Architecture & data flow

Reuses the exact proven path the AI feature already uses (`CLI → ${apiHost}/build/* → builder worker`). The capgo-new backend is a **thin proxy** that owns identity + rate limiting; the **capgo_builder worker** does the send. **Compression happens in the CLI** (see §4), so the worker is a near pass-through.

```
CLI (user machine)
  builder run writes a hidden verbose internal log as it goes
  on failure/error → unified help menu
  user picks "Ask Capgo support"
    • CLI assembles ONE combined bundle locally (labeled sections):
        === DIAGNOSTICS ===   (versions, OS, appId, platform, step)
        === INTERNAL CLI LOG ===
        === BUILD LOG (fastlane) ===   (if a build ran)
        === AI ANALYSIS ===            (if AI was run / escalation)
        === USER MESSAGE ===           (optional)
    • CLI redacts secrets (CLI-only) and TELLS the user it does so
    • CLI GZIPS (level 9) + BASE64-ENCODES the bundle (Node, no mem/CPU limits)
    • shows: "We'll email Capgo support and CC you (<email>), attaching your logs.
              Secrets are automatically removed."   Options: Send / View logs first / Cancel
        └ View logs first → Show path (copies path to clipboard, confirms)
                          / Open preview   (the combined bundle, raw local file)
    • on Send → POST { appId, jobId?, bundleB64, aiAnalysis?, description? }
                to ${apiHost}/build/support   (header: capgkey)
        │
        ▼
capgo-new backend  supabase/functions/_backend/public/build/support.ts  (THIN PROXY)
    1. authenticate capgkey → resolve user → user's VERIFIED email
    2. RATE LIMIT here (1/60s + 10/day per user) — NOT in the builder worker
    3. CC email = resolved email; if client supplied an email and it differs → reject
    4. forward JSON { bundleB64, verifiedEmail, appId, jobId? } to builder worker
        │  (same proxy shape as public/build/ai_analyze.ts — JSON only, no binary)
        ▼
capgo_builder worker  /support
    1. NO gzip / NO BUILD_LOGS DO pull — just place bundleB64 into the attachment
    2. env.EMAIL.send(...)   ← Cloudflare Email Service binding
         from: "Capgo Builder Support" <capgo_builder_support@capgo.app>
         to:   <verified user email>              (the USER — clean, well-titled email)
         cc:   michael@capgo.app                  (internal, NON-routed → safe; NOT martin@)
         bcc:  capgo_builder_support@capgo.app    (ONLY bridge-routed addr; invisible)
         (martin@ excluded — it IS bridge-routed → would race; NO replyTo)
         attachments: [{ content: bundleB64, filename: support-<appId>-<ts>.log.gz,
                         type: "application/gzip", disposition: "attachment" }]
        │  (only the BCC reaches the bridge → exactly one delivery → one thread, no race)
        ▼
Cap-go/automations bridge (email.capgo.app)
    ingests the BCC copy → stores attachment in R2 → opens Discord [SUPPORT] thread
    (team works in Discord, not email)
    team replies in Discord → To = capgo_builder_support@ (routed → dropped as self-copy),
    CC = buildReplyAllCc = user + michael@ (originalTo+originalCc) → both get every reply → no loop/race
```

**Responsibility split**
- *CLI* = capture, assemble (combined bundle), redact (+inform user), **gzip -9 + base64**.
- *capgo-new backend* = identity + verified email + **rate limiting** + forwarding (thin, JSON only).
- *capgo_builder worker* = attach the pre-encoded blob + `env.EMAIL.send(...)` (near pass-through).

---

## 4. Email transport — Cloudflare Email Service (and its real limits)

We use **Cloudflare Email Service** (the transactional product, onboarded for `capgo.app` with SPF/DKIM) — **not** the legacy Email Routing `send_email` binding (verified-destinations only). **Resend is not used.** **Capgo is on a paid Cloudflare plan** (confirmed), which is required to send to arbitrary recipients (CC the user).

`env.EMAIL.send({ from, to, cc, replyTo, subject, text, attachments, headers? })` supports arbitrary recipients (max 50), CC/BCC, replyTo, attachments, and custom headers.

### Addressing & the dedicated builder support address

**The user is the visible `To`; the bridge is triggered via a `BCC` to the single routed address.** The user gets a clean, well-titled email; the bridge still opens the Discord thread; and **no message ever has more than one bridge-routed recipient.**
- **From** = `"Capgo Builder Support" <capgo_builder_support@capgo.app>`.
- **To** = the **user** (verified server-side from the capgkey owner) — an external address, not bridge-routed.
- **BCC** = `capgo_builder_support@capgo.app` — the **single bridge-routed recipient** and the only envelope address that reaches the bridge. BCC is stripped from headers → invisible to the user. Routed via ForwardEmail.net alias `→ support@usecapgo.com`.
- **CC** = internal addresses that are **NOT bridge-routed** (e.g. `michael@capgo.app`). A non-routed CC is safe — it adds an inbox recipient without adding a second *routed* recipient — and the bridge includes it on replies (`buildReplyAllCc` reads `originalCc`), so it stays on the thread. **`martin@capgo.app` is excluded** because it **is** bridge-routed → CC'ing it would create the double-delivery race. Keep the CC list in worker config; **every entry must be a verified non-routed mailbox.**
- **`support@capgo.app` not used; no `Reply-To`** (bridge ignores it).

**Invariant: exactly ONE bridge-routed recipient per email — the BCC'd `capgo_builder_support@`.** `To`/`CC` may include non-routed addresses (the user; non-routed internal mailboxes like `michael@`), but **never a second bridge-routed address** (`support@`, `martin@`, …). **This safety hinges on the CC'd addresses staying non-routed — verify `michael@`'s routing before shipping, and never add a routed address to the CC config.** Rare edge: if the *builder user's own* email is a routed `@capgo.app` address, the `To` copy also routes in → detect and drop the BCC in that case (the single remaining routed copy still creates the thread), or accept the dedup as fallback.

### Why a single routed address — the double-delivery race
Two bridge-routed recipients ⇒ the bridge receives the mail twice. Its Message-ID dedup (index.ts:605-621) is **`get`-then-`put`, non-atomic, on eventually-consistent KV across separate worker invocations** — so simultaneous double-delivery (e.g. a reply-all hitting two routed addresses) could slip through and double-post. One routed recipient (the BCC) makes the race impossible by construction.

### Verified bridge behavior — replies reach the user (`Cap-go/automations/email/index.ts`)
- The bridge ingests the BCC'd copy (envelope-routed to `capgo_builder_support@`) and parses the **header** To/CC → `originalTo = [user]`, `originalSender = From = capgo_builder_support@`.
- Team replies in Discord → `to: originalSender` (`capgo_builder_support@`, routed → dropped as a self-copy via `x-bridge-source`) and `cc: buildReplyAllCc = originalTo + originalCc` = **the user + the non-routed internal CC** (`michael@`) (index.ts:185, 1577, 1660). So **the user (and `michael@`) receive every reply.** Those reply copies land in normal inboxes (non-routed) → no re-ingest, no race.
- If the user replies to the email, it's addressed to `capgo_builder_support@` → routed → threaded into their existing Discord thread (In-Reply-To). Bidirectional, and the user only ever sees clean emails.
- **No loop / no race:** the only routed recipient on any message is `capgo_builder_support@`, and the bridge drops its own `x-bridge-source` copies.

### Platform limits that actually matter (verified against Cloudflare docs)

| Limit | Value | Implication |
|---|---|---|
| **Total message size** | **5 MiB** (incl. attachments) | Hard ceiling on the base64'd email |
| Total message size (verified **destination** addresses only) | 25 MiB | "Verified address" = a recipient verified in the CF account (clicks a link), NOT the sender. An arbitrary CC'd user is not one → we are on the **5 MiB** tier. Not needed anyway (measured 28 KB). |
| **Attachments** | **must be base64** (~33% inflation) | The 5 MiB budget is the *encoded* size |
| Recipients (to+cc+bcc) | 50 | Fine (we use 2) |
| Header size | 16 KB | Fine |
| Worker **memory** | **128 MB** per isolate | NOT a constraint (the "10 MB" is *script bundle* size, unrelated) |
| Email Service Workers-binding **CPU** | **~50 ms/request** | **Why we do NOT gzip in the worker** |
| Worker request body | 100 MB (Free/Pro) | Fine for ≤ a few-MB upload |

### Sizing model (measured, not guessed)

- **Measured on a real GitHub build log** (`logs_72018286007.zip`): 123 KB raw → **28 KB gzipped(-9)+base64** = ~**4.4× effective** shrink. (GitHub logs carry per-line timestamps + ANSI codes, so they compress less than typical text — do not assume 10–20×.) That attachment is **188× smaller** than the 5 MiB ceiling.
- At that real ratio, the ~4.5 MiB encoded budget holds **~20 MiB of raw log**. The user only sees the "Run fastlane build" step (a subset of the 123 KB) plus the small CLI-side internal log; a failing build would need to be ~100× larger than the measured one to approach the limit. The encoded-size guard (§7) covers the tail.
- **Compression: gzip level 9** (max), done in the **CLI** (Node, no memory/CPU limits). The worker only base64-passes a ~1 MB blob, so it touches neither the 128 MB memory limit nor the ~50 ms binding-CPU limit.

### Configuration & sender

- `wrangler.jsonc` (builder worker, prod + preprod):
  ```jsonc
  "send_email": [
    { "name": "EMAIL", "remote": true, "allowed_sender_addresses": ["capgo_builder_support@capgo.app"] }
  ]
  ```
- **Sender setup:** the `capgo.app` domain onboarding (SPF/DKIM/MX) already done *is* the sender verification — any `@capgo.app` address then sends immediately, so `capgo_builder_support@capgo.app` works as-is.

### Reply-To — resolved (not used)
The bridge ignores `Reply-To` entirely (verified above), so we don't set it. The user is a **CC** recipient on replies (always receives them), never the primary `To` — unavoidable, since we can't send *as* the user, and acceptable.

---

## 5. The internal log (hidden verbose logger)

Today the CLI keeps only the last ~12 lines in memory. This adds a full, hidden, on-disk log per builder run.

- **Module:** `cli/src/support/internal-log.ts` (new).
- **File:** `~/.capgo-credentials/support/internal-<appId>-<timestamp>.log`, **append-as-you-go** (flushed per write) so it survives crashes and unhandled errors.
- **Captures:**
  - every log entry at all levels, including `debug` (not just the TUI-visible tones);
  - every external API request + response: method, URL, status, and body — **including raw provider/platform API errors** (Apple App Store Connect **and** Google Play, plus Gradle/CocoaPods/signing failures) that get surfaced to the user;
  - every shell command executed (`cap add ios`/`cap add android`, `pod install`, Gradle, build steps, …) with stdout/stderr;
  - diagnostics: OS + arch, Node version, CLI version, package manager, installed Capgo/Capacitor/CapAwesome versions, appId, platform, channel, current onboarding step.
- **Secret redaction on write (CLI-only):** `capgkey`/API keys, bearer tokens, Apple/Google API keys & signing secrets, and similar — redacted before bytes hit disk. **There is no server-side re-scrub** (CLI-only). Because masking is opaque otherwise, **the support flow explicitly tells the user that secrets are removed** (§6).
- **Visibility:** never shown during normal runs. Surfaced only when the user requests help (preview/path option) or sent to support.

### The combined bundle
When the user picks **Ask Capgo support**, the internal log and the build log are **combined into one bundle file** with labeled sections (`DIAGNOSTICS` / `INTERNAL CLI LOG` / `BUILD LOG (fastlane)` / `AI ANALYSIS` / `USER MESSAGE`). One file = one attachment, one preview, one thing to gzip.
- **Always:** diagnostics + internal log.
- **Build failures:** + the captured build log (`/tmp/capgo-builds/{jobId}.log`).
- **AI escalation:** + the AI analysis text.

This is built by **extending the existing `writeOnboardingSupportBundle`** (not a new assembler) to take the additional sections and emit the combined file; the file is then gzipped(-9)+base64'd in the CLI before upload.

---

## 6. Support-flow UX (CLI)

1. User picks `📨 Ask Capgo support`.
2. CLI assembles the **combined** bundle file locally (reusing `~/.capgo-credentials/support/`) and redacts secrets.
3. CLI explains, shows the user's email, **and states that secrets are removed**:
   > We'll send your request to the Capgo team and email you a copy at **<email>** — they'll reply right in that email thread. Your build/onboarding logs are attached, with **secrets (API keys, tokens, signing credentials) automatically removed**.

   (Mechanically: the email is addressed **To: the user**, with the Discord bridge triggered via an invisible BCC — see §4. The user is the only visible recipient.)
   Options: `Send` · `View logs first` · `Cancel`.
4. **View logs first** → sub-menu:
   - `Show path` → writes the bundle locally, **copies the path to the clipboard**, prints `Copied to clipboard: <path>`.
   - `Open preview` → opens/pages the combined bundle file contents.
   Then returns to `Send` / `Cancel`.
5. **Send** → spinner → gzip(-9)+base64 → POST to `${apiHost}/build/support`.
   - **Success:** `Sent — the Capgo team will reply to <email>. (Logs saved at <path>.)`
   - **Failure (network/backend):** fallback — `Couldn't reach support. Your logs are saved at <path>. Please email them to support@capgo.app.`
6. **Cancel** → back to the help menu.

Preview is **never shown by default** — only via the explicit "View logs first" option.

---

## 7. Security & privacy

- **Recipient anti-spoofing:** the user's `To` email is derived **server-side** from the capgkey owner; if the client sends an email that doesn't match the resolved owner, the backend rejects the request. The routed `BCC` (`capgo_builder_support@`) and any internal `CC` (**non-routed only**, e.g. `michael@`) are worker config, never client-supplied. **Never CC a bridge-routed address** (`support@`, `martin@`) — that causes the double-delivery race.
- **Secret redaction (CLI-only, and disclosed):** applied in the CLI on write (§5); there is **no** server-side re-scrub. The support flow **tells the user** secrets are removed, so the masking is meaningful and transparent.
- **Sender lock:** worker `send_email` binding restricted via `allowed_sender_addresses`.
- **Rate limiting (capgo-new backend, NOT the builder worker):** **1 request per 60 s per user, plus 10 per day per user**, enforced in `public/build/support.ts` using the resolved capgkey owner. The per-minute limit stops accidental double-sends/bursts; the daily cap stops a script that respects the minute limit. Reuse existing backend rate-limit patterns.
- **Size cap (on the *encoded* payload) — minimal safety guard, not gold-plating.** Decision: **no R2 now.** Real logs measure ~28 KB encoded (~188× under the 5 MiB ceiling), so the guard will almost never fire — but it converts a rare *hard failure* (`E_CONTENT_TOO_LARGE` → whole request fails on the user's worst day) into graceful degradation, so it's cheap insurance, not dead code. Fitting is iterative (gzip size isn't predictable from raw size) but **bounded and cheap** — it runs in the **CLI (Node), which has no 50 ms CPU limit**, so re-gzipping a few times costs milliseconds. Algorithm: (1) gzip(-9)+base64 once — if ≤ 4.5 MiB, **send, no loop** (the ~always case); (2) if over, keep the small diagnostics header untouched, then use the *measured* ratio from pass 1 to estimate a raw-body budget (`target_encoded × (raw/encoded) × 0.9`) and cut the body to its **tail** at that budget on line boundaries — lands close in one step; (3) refine with **linear fixed-size steps** (trim ~200 KB raw per pass — *not* exponential halving, so we never over-cut), re-checking each pass; (4) cap at ~8 iterations. Prepend an "older lines truncated (N lines omitted)" notice. No middle-dropping. Emit a **`support_truncated`** telemetry event whenever it fires — if telemetry ever shows real truncations, *that* is when an R2 fallback (attach-if-fits-else-upload-link, reusing the builder worker's existing R2 bucket + the CLI's existing TUS upload) becomes justified. Not before (YAGNI).

---

## 8. Components to build / change

### CLI (`cli/src`)
- `support/internal-log.ts` — new persistent verbose logger + CLI-only secret redaction.
- Wire the logger into builder/onboarding command paths and the API/shell call sites (capture raw Apple **and** Google provider errors).
- **Extend `writeOnboardingSupportBundle`** (in `onboarding-support.ts`) to emit the combined, labeled bundle (diagnostics + internal log + build log + AI analysis + optional user message).
- `support/contact-support.ts` (or similar) — assemble (via the extended bundler), gzip(-9)+base64, encoded-size guard/truncation, preview/path/clipboard UX (incl. the "secrets removed" disclosure), POST to backend, success/failure handling.
- Update the failure menus in `build/onboarding/ui/steps/ios-shared.tsx` and `init/command.ts` to the unified menu (support-first), and add the AI-result escalation option.
- **Telemetry → PostHog.** Reuse the existing `sendEvent()` path (`cli/src/utils.ts`) that already forwards CLI events to PostHog via the backend — the same mechanism behind `ai/telemetry.ts`'s `CLI AI Build Analysis Choice/Result` events. New events: `CLI Builder Support Requested` / `Sent` / `Failed` / `Truncated`, plus `CLI Builder Support Escalated from AI`. Tags = **closed-enum + metadata only**: `app_id`, `platform`, `job_id?`, `trigger` (`build_failure|onboarding_error|unhandled_error`), `has_build_log`, `has_ai_analysis`, `result`, `error_status?`, `truncated` (bool), `raw_bytes`, `encoded_bytes`. **Privacy boundary (mirrors AI telemetry): never send log content or the user's free-text description.** Respect existing opt-outs `CAPGO_DISABLE_TELEMETRY` / `CAPGO_DISABLE_POSTHOG`. Distinct from `cli/src/posthog.ts` (direct `unhandled_error` exception capture) — they coexist; the unhandled-error trigger may emit both.

### capgo-new backend (`supabase/functions/_backend/public/build`)
- `support.ts` — new endpoint mirroring `ai_analyze.ts`: auth capgkey → resolve user + verified email → **rate limit (1/60s + 10/day per user)** → reject email mismatch → validate payload size → proxy JSON to builder worker.
- Register route in `public/build/index.ts`.

### capgo_builder worker (`capgo_builder_new`)
- `/support` route handler — place `bundleB64` into the attachment, compose + `env.EMAIL.send(...)`, return result. No gzip in the worker.
- `wrangler.jsonc` — add `send_email` binding (prod + preprod, `remote: true`, sender allowlist).

### Ops / DNS / account (one-time)
- `capgo.app` onboarded/verified in Cloudflare Email Service (SPF + DKIM) — done.
- **Capgo is on a paid Cloudflare plan** — confirmed (required for arbitrary recipients / CC the user).
- **Route `capgo_builder_support@capgo.app` into the bridge** (ForwardEmail.net alias → `support@usecapgo.com`) — the single ingestion address, used only as **BCC**. **A `CC` is allowed only for NON-routed internal mailboxes** (e.g. `michael@`, which does not route to the bridge); **never CC a bridge-routed address** (`support@`, `martin@`) or the double-delivery race returns. **Verify each CC address's routing status before adding it to config** (and re-verify if routing rules change). Discord forum remains the team's primary view (optional role @mention in the bridge).

---

## 9. Error handling & testing

- **CLI:** network/backend failure → local-file fallback with copy-paste instructions; clipboard failure is non-fatal (still prints path); encoded-size guard with truncation.
- **Backend:** auth failure, email mismatch, **rate-limit (429)**, oversize (`413`) → clear, distinct errors.
- **Worker:** catch Email Service `send` errors by `code` (`E_CONTENT_TOO_LARGE`, `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`, `E_SENDER_DOMAIN_NOT_AVAILABLE`, …) → surface to backend → CLI fallback.
- **Tests:**
  - Unit: redaction correctness, combined-bundle assembly (extended `writeOnboardingSupportBundle`), gzip(-9)+base64 + encoded-size truncation, menu logic (AI shown iff build log), clipboard/path helper.
  - Integration: `/build/support` auth + rate-limit (429) + email-verify + proxy behavior; oversize/413 path.
  - Mocked Cloudflare Email Service `send` for the worker `/support` handler (incl. `E_CONTENT_TOO_LARGE`).

---

## 10. Open items (resolve during implementation)

1. Final menu/label wording (current wording is provisional).
2. Confirm preprod Email Service onboarding state for `capgo.app`.
3. Optional: a Discord **role @mention** when the bridge opens a builder ticket, if the team wants a stronger ping than the forum (small automations change; replaces the rejected internal-email-CC idea, which would have caused the double-delivery race).

### Resolved decisions
- Transport: Cloudflare Email Service (not Resend); paid plan confirmed.
- Compression: **gzip level 9**, in the CLI; worker is base64 pass-through.
- Oversize handling: minimal CLI-side estimate+linear truncation guard; **no R2 now**; `support_truncated` telemetry as the trigger to reconsider.
- Addressing (verified against the bridge code): **To = the user** (clean inbox), **BCC = `capgo_builder_support@capgo.app`** = the single bridge-routed recipient that triggers the Discord thread (invisible). From = `"Capgo Builder Support" <capgo_builder_support@>`. **CC = non-routed internal addresses only** (e.g. `michael@`, which doesn't route to the bridge) — safe, and included on replies via `buildReplyAllCc`; **`martin@` excluded** (it's bridge-routed → would race). `support@` not used; no Reply-To. The user (and `michael@`) receive every reply via `buildReplyAllCc`; single routed recipient + `x-bridge-source` drop ⇒ no loop, no race. Hinges on CC'd addresses staying non-routed.
- Logs: **combined** into one labeled bundle by **extending `writeOnboardingSupportBundle`**.
- Redaction: **CLI-only**, disclosed to the user.
- Rate limiting: **1/60s + 10/day per user**, at the **capgo-new backend**.
- Provider errors captured for **both** Apple and Google.
