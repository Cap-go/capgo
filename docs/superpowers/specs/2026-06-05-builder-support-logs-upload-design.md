# Capgo Builder — Support-Logs Upload (R2): kill the manual attach

**Date:** 2026-06-05
**Status:** ✅ Approved follow-up to [`2026-06-03-builder-contact-support-simple-design.md`](./2026-06-03-builder-contact-support-simple-design.md) (shipped: local file + `mailto:` + manual attach). This adds an automatic logs upload so the email is **send-ready with a link** — no attach step, no Finder/Mail window dance.
**Scope:** CLI + capgo backend proxy + capgo_builder worker + one-time R2 setup. No bridge/email-infra changes.

---

## 1. Goal

When the user confirms "Email Capgo support", upload the gzipped logs bundle to R2 and put a **logs ID + download link in the email body**. The user just hits Send; support clicks the link from Discord. The local file remains as the offline/failure fallback.

---

## 2. Data flow

```
CLI (after the existing confirm gate; preview choice unchanged)
  gzip bundle (already exists) → sha256(gz) = ID
  POST ${apiHost}/build/support_logs   { appId, jobId?, gzB64 }   (header: capgkey)
        │
        ▼
capgo backend  public/build/support_logs.ts   (THIN PROXY — mirrors ai_analyze.ts)
  auth capgkey → resolve user → rate limit (see §5) → forward { gzB64, appId, jobId?, userId }
        │
        ▼
capgo_builder worker  POST /support-logs
  1. size cap: gz ≤ 10 MB (reject 413)
  2. text-only validation: gunzip first 64 KB → must decode as UTF-8, mostly printable
     (kills "free file hosting" abuse — only text logs pass)
  3. key = sha256(gz)  →  R2 put  support-logs bucket: `<sha256>.log.gz`
     customMetadata: { app_id, job_id?, user_id }   (no email/PII)
     → idempotent by construction: identical re-upload = same key, no new storage
  4. return { id: <sha256>, url: <public GET url> }
        ▼
CLI email body (URL-only — the sha256 id is visibly embedded in it):
  "Support logs (kept 30 days):
   <url>"
  → email is SEND-READY. No attach, no reveal, no clipboard-path needed on this path.

support team (from the Discord thread the bridge opens):
  GET /support-logs/<sha256>  → streams the .log.gz
  (Content-Type: application/gzip, Content-Disposition: attachment; 404/410 after expiry)
```

**Fallback (upload fails / offline):** the flow degrades to exactly today's shipped behavior — local `.log` + `.log.gz`, `.log.gz` path on the clipboard, Finder reveal (macOS), attach instructions in the email body and terminal.

---

## 3. Storage — NEW dedicated R2 bucket

- **Bucket:** `capgo-builder-support-logs` (separate from the build-artifact `capgo-builder` bucket — decided; isolates lifecycle, access, and blast radius).
- **Key:** `<sha256(gz)>.log.gz`. The hash is the ID and the capability (64 hex chars, content-derived incl. timestamps → unguessable). "Upload once" falls out for free: retries/double-fires/identical re-runs hit the same key.
- **Custom metadata:** `app_id`, `job_id` (when present), `user_id` (account id, not email — minimize PII).
- **Retention = R2 lifecycle rule, bucket-wide, 30 days.** One-time setup; **no cron, no cleanup code**:

```bash
npx wrangler r2 bucket create capgo-builder-support-logs
npx wrangler r2 bucket lifecycle add capgo-builder-support-logs --expire-days 30
```

- Worker binding (prod + preprod `wrangler.jsonc`):

```jsonc
"r2_buckets": [
  // ...existing UPLOAD_BUCKET...
  { "binding": "SUPPORT_LOGS_BUCKET", "bucket_name": "capgo-builder-support-logs" }
]
```

---

## 4. API

### Backend proxy — `supabase/functions/_backend/public/build/support_logs.ts` (new)
Mirrors `ai_analyze.ts` exactly: authenticate `capgkey` → resolve user → rate limit → forward JSON to the builder worker (same internal backend→worker auth as the ai_analyze proxy). Registered in `public/build/index.ts`.
Request: `{ appId: string, jobId?: string, gzB64: string }` (base64'd gzip; ≤ ~13.4 MB encoded for the 10 MB cap).
Response: `{ id: string, url: string }` · errors: `401` auth, `413` too big, `415` not-text, `429` rate-limited.

### Worker — `POST /support-logs`, `GET /support-logs/:id`
- POST: decode base64 → enforce 10 MB → gunzip-validate first 64 KB (valid UTF-8, ≥ ~85% printable) → sha256 → `SUPPORT_LOGS_BUCKET.put(key, bytes, { customMetadata })` → `{ id, url }`.
- GET: `SUPPORT_LOGS_BUCKET.get(id + '.log.gz')` → stream with `Content-Type: application/gzip`, `Content-Disposition: attachment; filename="capgo-support-<id8>.log.gz"`; missing/expired → 404 with a friendly "logs expired — ask the user to re-send" body. Public route on the same host pattern as the existing artifact download links.

---

## 5. Abuse posture (honest version)

The defenses, strongest first:
1. **Economics + TTL:** worst plausible abuse (account rotating Cloudflare colos to dilute the limiter: ~1,000 uploads/day × 10 MB × 30-day TTL) ≈ 300 GB steady-state ≈ **$4.50/month** R2 storage, self-purging. R2 egress is **free**, so the GET side can't run up a bill. There is no payoff.
2. **Size cap (10 MB gz)** — hard server-side check.
3. **Text-only validation** — gunzip + UTF-8/printable check defeats the only attractive misuse (hosting arbitrary files behind a capgo.app URL).
4. **sha256 keying** — duplicate floods cost nothing extra.
5. **Account-keyed rate limit, 1/min + 10/day,** via the existing `CacheHelper` limiter (`utils/rate_limit.ts`).
   **Documented caveat:** that limiter is backed by the Cloudflare Cache API → **per-colo** and **fails open**; a colo-hopping VPN dilutes it. It is a *speed bump*, not a guarantee — acceptable because of (1)–(4).
6. **Account bans** as the backstop (capgkey required; no anonymous path).

**No captcha** (wrong tool: authenticated CLI API, no browser). **Optional later hardening** (only if real abuse appears): a globally-consistent per-account counter in Postgres (`upsert count+1` per user/day) — small, contained, deferred.

---

## 6. CLI changes (`cli/src/support/`)

- **`contact-support.ts`:** after the confirm gate (unchanged gate, updated copy — see below) and bundle write, attempt the upload (new injected dep `upload?: (gz: Buffer) => Promise<{ id, url } | null>`):
  - **Upload OK** → email body gains the download URL + "kept 30 days" (URL-only; the id is embedded in it); **skip** clipboard-path / Finder reveal / attach instructions (nothing to attach); terminal print still shows the local paths for reference.
  - **Upload fails/absent** → exact current behavior (clipboard `.log.gz` path, reveal, attach instructions). Never block on the upload: short timeout (~10 s), degrade silently to fallback.
- **`support-upload.ts` (new):** gzip→base64, POST to `${apiHost}/build/support_logs` with capgkey (same client pattern as `ai/analyze.ts`'s `postAnalyzeRequest`), parse `{ id, url }`, return null on any error.
- **Confirm copy (platform-aware bits preserved):**
  > "We'll save your logs locally, **upload a copy to Capgo support (kept 30 days)**, and open a pre-filled email to support@capgo.app in your mail app. Continue?"
  The "view logs first" preview choice is unchanged and still shows exactly what will be uploaded.
- All five entry points (iOS/Android error step, AI prompt, AI result escalation, init, build request) get this for free — they already call `contactSupport`.

---

## 7. Components & tests

| Where | What |
|---|---|
| **Ops (one-time)** | create bucket + lifecycle rule (commands in §3); add `SUPPORT_LOGS_BUCKET` binding (prod + preprod) |
| **Worker** | `POST /support-logs` + `GET /support-logs/:id` routes; size cap; gunzip/text validation; sha256; tests with a mock R2 binding (put/get/oversize/non-text/idempotent re-put) |
| **Backend** | `public/build/support_logs.ts` proxy (auth → user → rate limit → forward) + route registration; tests: 401/413/429/happy-path forward |
| **CLI** | `support-upload.ts` + `contact-support.ts` upload branch + confirm-copy update; tests: upload-ok path (email body has id+url, no attach text), upload-fail path (identical to today's behavior), timeout degrade |

---

## 8. Open items
1. Exact public URL host/path for GET (reuse the artifact-download host pattern — confirm route shape during implementation).
2. The backend→worker internal auth detail (mirror whatever `ai_analyze` proxying uses — confirm in code).
3. Whether preprod points at the same bucket or a `-preprod` twin (suggest twin, consistent with existing bucket conventions).
4. Deferred: global Postgres rate counter (only if telemetry/abuse ever warrants).
