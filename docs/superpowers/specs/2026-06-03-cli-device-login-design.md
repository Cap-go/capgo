# CLI Web Login (OAuth Device-Flow-Shaped API Key Delivery) — Design Spec

**Date:** 2026-06-03
**Status:** Draft for review · **Lifecycle: V4** (atomic create at authorize, hashed, transient one-time delivery)
**Branch:** worktree-cli-oauth-device-flow
**Mockup:** [authorize page](./assets/2026-06-03-cli-device-login-authorize-mockup.html) ·
**Diagrams:** [flow](./assets/2026-06-03-cli-device-login-flow-diagram.html) ·
[architecture](./assets/2026-06-03-cli-device-login-architecture.html) ·
**This spec (HTML):** [spec page](./assets/2026-06-03-cli-device-login-spec.html)

## Problem

The Capgo CLI can only authenticate by the user manually obtaining an API key and
pasting/passing it (`capgo login <key>`). There is no "click to log in from the
browser" path. We want a flow that *feels* like OAuth — open a page, pick scope,
authorize — but delivers a **Capgo API key** rather than an OAuth token.

## Goal

`capgo login` (no key) opens the browser, the user selects org/app RBAC roles and
authorizes, a **new** API key is minted and delivered back to the CLI over HTTPS.
Implemented as an **OAuth 2.0 Device Authorization Grant (RFC 8628) *shape*** — not a
real OAuth token server.

## Non-goals

- No OAuth access/refresh tokens, no token endpoint, no scopes machinery, no client
  registration. We borrow only the device-flow choreography.
- We do **not** reuse existing API keys; every login mints a fresh key.
- Manual `capgo login <key>` is retained as a fallback.
- No Cloudflare Access / `workers-oauth-provider` adoption (wrong output + no device
  grant + heavyweight).
- **apikey v2 / RBAC only.** There is no `read/upload/write/all` `mode` — permission is
  the **RBAC `role_name`** per binding (`post.ts` never writes `mode`).

## Why device flow (not loopback redirect)

Device flow keeps the key in TLS only (never in a localhost URL or browser history),
needs no local port, doesn't depend on tightening browser localhost policies, and is a
**recognizable, defensible** standard for security review. Cost: a few thin edge
endpoints + one short-lived table.

## Key lifecycle: V4 — create atomically at authorize, hashed, deliver once

**The key is created at authorize-time** (while the user's JWT is present), stored
**hashed** (`key = NULL`, only `key_hash`), and the **plaintext is held transiently** on
the session row for the CLI to fetch exactly once, then burned. After delivery, only the
hash remains anywhere.

Why V4 (vs deferring creation to poll, "V3"): deferring would mean storing the *intent*
(the bindings) and building the key later. A bug in that stored scope could mint a key
with the **wrong scope** within the user's rights — which the RBAC check cannot catch
(it only catches *escalation* beyond the user's rights). V4 creates the key atomically
under the JWT, so nothing scope-bearing is stored between steps; the only transient
state is the **opaque secret string**. A bug there can at worst yield a **dud key that
fails login** — never a wrong-scope key. V4 also surfaces any creation error in the
browser (user present), not on a later headless poll.

- **Authorize** (browser, JWT): validate the user's RBAC and **create the key now** via
  the shared creation function (hashed). Store `apikey_id` + an **encrypted, transient
  `delivery_key`** (the plaintext, burn-on-read) on the session; set `status=authorized`.
- **Poll** (CLI, `device_code`): on the first `authorized` poll, decrypt and return
  `delivery_key` **once**, then **null it and burn the session**.
- **Final at-rest state:** identical to a hashed dashboard key — only `key_hash` persists.

### Security guards

- **Creation always happens under the user's JWT** (at authorize). There is **no
  key creation in the unauthenticated poll** — the poll only *delivers* an
  already-created secret. This removes any "backend creates a key without the user's
  authenticated context" risk by construction.
- The shared creation function still performs the explicit RBAC check
  (`org.update_user_roles` per org) intrinsically — escalation cannot occur regardless of
  caller.
- `delivery_key` is **encrypted at rest** (Worker secret) + short TTL + burn-on-read, so
  a DB snapshot during the brief in-transit window is useless. It is the *only* plaintext
  copy (the apikey row is hashed) and carries **no scope semantics**.

## Architecture

```
 CLI                          Backend (CF Workers / Hono)              Browser (Vue page, logged in → JWT)
  |  POST /cli-auth/start  ----------> create session ----.                    |
  |  <-- device_code, user_code, URIs                      |                   |
  |  print user_code, open verification_uri_complete  -------------------->  /cli-login?code=user_code
  |                                                        |       show phrase + RBAC role picker
  |                                          POST /cli-auth/authorize  <-- (JWT)
  |                                          RBAC-check + CREATE key now (hashed),
  |                                          store apikey_id + encrypted delivery_key,
  |                                          mark authorized
  |  POST /cli-auth/poll {device_code} (loop) -> status; when authorized:      |
  |  <-- api_key (decrypt + return once), delivery_key nulled, session burned  |
  |  save to ~/.capgo / ./.capgo                                               |
```

### 1. CLI command (`cli/src/login.ts`, helpers in a new `cli/src/loginWeb.ts`)

- `capgo login` with no key → run the web device flow **in interactive terminals**. In
  **non-interactive / CI** environments (no TTY, or `CI` set) it does **not** open a
  browser — it requires an explicit key (positional `<key>` / `--apikey`) or the
  `CAPGO_TOKEN` env var, failing with clear guidance otherwise. Flags: `--web` (force
  web), `--local`/positional `<key>` keeps the manual path.
- `POST /cli-auth/start` with `{ client_version, device_name }`. Receives
  `{ device_code, user_code, verification_uri, verification_uri_complete, interval, expires_in }`.
- Print the `user_code` ("Confirm your browser shows: enjoy-enough-outwit-win-river")
  and open `verification_uri_complete` via the existing `open` dependency. Under
  SSH/no-browser, print the URL to open manually.
- Poll `POST /cli-auth/poll { device_code }`. Honor RFC 8628 responses:
  `authorization_pending`, `slow_down`, `access_denied`, `expired_token` (abort + offer
  manual `capgo login <key>`).
- On `authorized`, receive the plaintext key **once**; save with the existing
  `~/.capgo` / `./.capgo` writer (0o600, gitignore handling unchanged).
- Handle Ctrl-C / timeout cleanly. No local server is opened.

### 2. Backend (Hono, under `supabase/functions/_backend/`)

Routes live under `public/cli-auth/*` (same group as the existing `apikey` endpoint).

- **`POST /cli-auth/start`** — minimal/no auth. Generates `device_code` (32 random
  bytes, base64url) and `user_code`, stores a session row (storing only the **hash** of
  `device_code`), returns the device-flow payload. Rate-limited per IP. The `device_code`
  is the per-session **bearer secret** the CLI reuses to authenticate every `/poll`.
- **`GET /cli-auth/session?user_code=...`** — JWT-authed (the page). Returns only
  **display** info: `device_name`, `client_version`, `created_at`, `status`. Never
  returns `device_code` or `delivery_key`.
- **`POST /cli-auth/authorize`** — JWT-authed (the page). Body
  `{ user_code, name, bindings, expires_at, hashed }` (v2 RBAC: permission is the
  `role_name` per binding; there is no `mode`). Verifies the session is `pending` and
  unexpired, runs the full RBAC check under the JWT, **creates the key now** (hashed) via
  the shared creation function, stores `apikey_id` + **encrypted `delivery_key`**, sets
  `status=authorized`. Requires `org.update_user_roles` on every org in the bindings —
  i.e. **only org admins** can authorize a CLI key for that org. Strictly rate-limited.
- **`POST /cli-auth/poll`** — **authenticated by the `device_code` bearer secret**
  (sent as `Authorization: Bearer <device_code>`, not a user JWT); the backend hashes it
  and matches `device_code_hash` with a constant-time compare. Returns `{ status }`. On
  the first `authorized` poll, decrypts and
  returns `{ api_key }` **once**, nulls `delivery_key`, sets `status=consumed`, and burns
  the session. Rate-limited; returns `slow_down` if polled faster than `interval`. **Does
  not create keys** — delivery only.

### 3. Frontend page (`src/pages/cli-login.vue` + `/cli-login/success`)

- Requires an authenticated session (existing `auth` middleware); if not logged in, the
  normal login runs first and returns here.
- Reads `user_code` from the query (`verification_uri_complete` prefills it) or an input
  field; calls `GET /cli-auth/session` to show device info + the verification phrase
  prominently for the eyeball match.
- Reuses the **org+role and app+role selectors** (`selectedOrgRole`, `pendingAppBindings`)
  from `ApiKeys.vue` (extract a shared component/composable where practical) + expiration
  honoring org policy.
- "Authorize & send to CLI" → `POST /cli-auth/authorize` (creates the key); on success
  shows "Return to your terminal". Any creation error shows here, in the browser.
  "Cancel" marks the session denied.
- Visual language matches `login.vue`. See mockup.

## Data model: `cli_login_sessions`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `device_code_hash` | text | SHA-256 of `device_code`; poll matches by hashing input |
| `user_code` | text | 5 EFF-short words, hyphenated; unique among **active** sessions |
| `device_name` | text | reported by CLI |
| `client_version` | text | reported by CLI |
| `status` | enum | `pending` / `authorized` / `consumed` / `denied` / `expired` |
| `user_id` | uuid null | set on authorize (the approver) |
| `apikey_id` | uuid null | the key created at authorize (hashed) |
| `delivery_key` | text null | **encrypted JSON envelope** `{ name, key }` (apikey display name + plaintext); transient, nulled/burned on first poll |
| `delivery_key_name` | text null | name/version of the KEK used to encrypt `delivery_key` (enables KEK rotation) |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | `created_at + 10 min` (session TTL) |
| `authorized_at` | timestamptz null | |
| `last_poll_at` | timestamptz null | for `slow_down` enforcement |

- Stores **no scope/intent**. The key (hashed) and its bindings are real `apikeys` /
  `role_bindings` rows created at authorize; the session holds only the device_code hash
  and the encrypted one-time `delivery_key`.
- Not client-accessible via RLS; reached only through edge functions.
- Scheduled cleanup deletes expired/consumed rows (mirror `cleanup_expired_apikeys`).

## `user_code` & `device_code` generation

- `device_code`: 32 bytes, base64url. **Only its SHA-256 hash is stored.** The real
  high-entropy poll secret / "state" anchor.
- `user_code`: **EFF short wordlist** (1296 words), **5 words** hyphenated (~51 bits),
  regenerated on collision against active sessions. Server-generated and stored (the
  Stripe/GitHub model). It is a short-lived, rate-limited *handle*, not the secret — so
  ~51 bits + rate-limit + 10-min TTL is ample (GitHub uses ~35 bits).

## `delivery_key` encryption (AES-256-GCM, versioned KEK)

- **Algorithm:** AES-256-GCM via WebCrypto `crypto.subtle` (codebase idiom; native on
  Workers). Per-row random 12-byte IV; **AAD = session id** so a ciphertext can't be
  swapped between rows. Stored `delivery_key` = base64(`iv ‖ ciphertext ‖ tag`).
- **KEK storage:** a 256-bit key in a **Cloudflare Worker secret**, read via
  `getEnv(c, 'CLI_DELIVERY_KEK_<version>')` (never committed; dev/test via the existing
  gitignored vars). Generate with `openssl rand -base64 32`.
- **Versioning (not hardcoded):** one pointer env `CLI_DELIVERY_KEK_CURRENT` selects the
  version to encrypt new rows with; the row stores `delivery_key_name`, and decryption is
  **data-driven** by that stored name. No version literal in logic.
- **Rotation runbook (zero-downtime, free given 10-min TTL):** (1) `wrangler secret put
  CLI_DELIVERY_KEK_v2`; (2) set `CLI_DELIVERY_KEK_CURRENT=v2` + deploy; (3) wait ~10 min
  (old rows expire/burn); (4) delete `CLI_DELIVERY_KEK_v1`. In-flight v1 rows still
  decrypt via their stored name during overlap.
- **Simpler alt:** a single un-versioned KEK; rotation = swap the secret, accepting a
  ≤10-min "please re-login" blip. (Versioned is the chosen default.)

## Security checklist (the review-defensible story)

- `device_code` high-entropy (256-bit), stored hashed; poll matches by hash.
- `device_code` is the poll **bearer secret**: presented as `Authorization: Bearer`,
  compared constant-time, never logged, accepted only on `/poll` (single-purpose). The
  public `user_code` cannot be used to poll — only the secret `device_code` can.
- `user_code` ~51 bits + unique-among-active + 10-min TTL + **strict rate limit** on
  `authorize`/`poll` — mitigates the device-flow guess→planted-key attack.
- **Key created only under the user's JWT** (authorize). The poll never creates — it only
  delivers. No unauthenticated key creation exists.
- **No scope-bearing state stored between steps** — eliminates the wrong-scope bug class.
- **No privilege escalation**: shared creation function enforces `org.update_user_roles`
  per org intrinsically. Service-role insert without the explicit check is banned.
- **Hashed at rest**: `apikeys.key = NULL`, only `key_hash`. Not viewable in the dashboard.
- **`delivery_key`**: encrypted JSON envelope `{ name, key }` at rest, short TTL,
  burn-on-read; only plaintext copy, opaque (no scope meaning). `delivery_key_name`
  records the KEK name/version so the KEK can be **rotated** (short-lived rows decrypt
  via their stored name).
- **Single-use**: session burned on first successful poll.
- HTTPS-only + HSTS (existing CF posture). Optional CLI cert-pinning deferred.
- Page states "authorizing the Capgo CLI on *this device*" and shows the phrase.
- MITM: identical threat surface to every existing CLI call (key already rides HTTPS).
- Note: V4 creates the credential at authorize rather than at the poll/token step, a
  small, deliberate deviation from strict RFC 8628 chosen to remove the wrong-scope
  surface; still device-flow-shaped (browser authorizes, CLI polls for delivery).

## Reuse

- **Shared key-creation function**: factor the core of
  `supabase/functions/_backend/public/apikey/post.ts` (validation + RBAC check + key
  generation + binding creation) into one function taking an explicit `actingUserId`,
  with the RBAC gate **inside** it. Called by both the public endpoint (JWT) and
  `/cli-auth/authorize`. No duplicated/forked security logic. v2/RBAC only —
  permission is carried by `role_name` per binding, not a `mode`.
- **Scope/permission UI**: reuse `ApiKeys.vue` org+role / app+role selectors; extract a
  shared component/composable if it falls out cleanly.

## Error / timeout handling

- CLI: `pending` keep polling; `slow_down` widen interval; `expired_token` → message +
  manual-paste fallback; `access_denied` → abort; network error → bounded backoff retry.
- Page: invalid/expired/used `user_code` → clear error states; **creation errors surface
  here at authorize** (user present); cancel → `denied`.
- Fallback `capgo login <key>` always available.

## Testing plan

- **Unit**: `user_code` generator (format + collision regen), `device_code` hashing,
  `delivery_key` encrypt/decrypt + burn, shared creation RBAC gate (acting-user cannot
  exceed rights), CLI RFC 8628 poll state machine.
- **Integration**: start → authorize (key created, hashed) → poll (delivered once) happy
  path; expired session; denied; double-poll burns; rate-limit triggers `slow_down`;
  wrong `device_code` rejected; **escalation attempt** (bindings for an org the user
  isn't admin of → authorize rejected).
- **Frontend**: page renders phrase + RBAC role pickers; authorize calls endpoint;
  unauth redirect-then-return.
- Target ≥80% coverage on new modules.

## Open decisions (resolve in plan)

1. ~~Key-at-rest / when to create~~ **Resolved (V4)**: create atomically at authorize,
   store hashed, deliver via encrypted transient `delivery_key`, burn on poll.
2. ~~Web default~~ **Resolved**: web flow is the default in interactive terminals;
   non-interactive/CI requires an explicit key (`--apikey`/positional or `CAPGO_TOKEN`)
   and never opens a browser.
3. ~~Route mount~~ **Resolved**: routes live under `public/cli-auth/*` (alongside `apikey`).
4. ~~delivery_key encryption~~ **Resolved**: AES-256-GCM (WebCrypto) over the JSON
   envelope `{ name, key }`; 256-bit KEK in a Worker secret; `CLI_DELIVERY_KEK_CURRENT`
   pointer + per-row `delivery_key_name` for data-driven, zero-downtime rotation. See the
   `delivery_key` encryption section.
5. CLI certificate pinning — now or follow-up.
