# MCP Sign-In (Paste-Key API Key Login) — Design Spec

**Date:** 2026-06-17
**Status:** Draft for review
**Flow:** A — paste-key (a key generated on a dashboard page, pasted into the AI, saved by an MCP tool)
**Related (not built):** [CLI device-login design](./2026-06-03-cli-device-login-design.md) — the heavyweight device-flow (Flow B) alternative, kept on the shelf as a future upgrade.

## Problem

The Capgo MCP servers have **no sign-in path**. The MCP reads an API key exactly once
at startup from `CAPGO_TOKEN` → `~/.capgo` → `.capgo` (`findSavedKey` in
`cli/src/utils.ts`). If no key is present, the server starts unauthenticated and every
authed tool fails. The only way to log in is to leave the AI, open a terminal, and run
`capgo login <key>` — which most MCP users never discover. There is also no way for a
tool to tell the user *whether they are logged in at all*.

## Goal

A user can sign in **without leaving the AI conversation**:

1. On a dashboard page, pick a role (Admin, or Member + specific apps) → a **non-expiring**
   API key for the **currently-active organization** is minted and shown once with a copy
   box and a ready-to-paste instruction line.
2. Paste that line to the AI → the AI calls a `capgo_login` MCP tool that validates the
   key, saves it to `~/.capgo`, and **re-initializes the running SDK** so the next tool
   call is authenticated with no server restart.
3. The **onboarding MCP** refuses build/credential actions when logged out, with clear
   guidance to run this flow first.

## Key scope — Admin or Member + apps

The `/connect` page offers a **role** choice, always scoped to the **active organization**
(`organizationStore.currentOrganization`):

- **Admin** → a single **`org_admin`** binding (full access to every app in the org).
- **Member** → an **`org_member`** binding plus one **`app_admin`** binding per app the
  user ticks in a searchable multi-select.

Both are minted through the new `createAiApiKey(supabase, name, { orgId, role, appUuids })`
service (`src/services/apikeys.ts`), which builds the v2 RBAC bindings (same shape as the
existing `createDefaultApiKey`) and calls the same `functions.invoke('apikey', …)` backend.
Keys never expire (no `expires_at`). A multi-org user switches the active org and
regenerates for a key in another org. No new permission model.

## Non-goals

- **No device flow / OAuth choreography.** No `cli_login_sessions` table, no
  confirmation phrase, no AES-GCM `delivery_key`, no `/cli-auth/*` endpoints. Those
  belong to the separate (unbuilt) device-login spec, which remains the future upgrade.
- **No org switcher / no expiry control.** The org is the dashboard's active org
  (read-only on the page), not a switcher; keys never expire (the chosen default).
  Expiring keys remain available through the existing `/apikeys` page.
- **No new backend endpoint.** Key minting reuses the existing `POST /apikey` path via
  the new `createAiApiKey()` service (a thin sibling of `createDefaultApiKey`).
- Manual `capgo login <key>` in a terminal is retained, unchanged.

## Security note (accepted tradeoff)

Flow A puts the **plaintext key into the chat transcript** (and the AI provider's logs).
This was an explicit, informed choice for simplicity. The key is `org_admin` and
non-expiring, so the page must state plainly that it is a powerful secret shown once, and
the dashboard's existing key-revocation UI is the mitigation if a transcript leaks. The
device-login spec exists as the no-secret-in-chat upgrade path if this tradeoff ever
needs to change.

## Architecture

```
 Browser (dashboard, logged in → JWT)            AI client + MCP server (stdio)
  /connect page                                   |
   click "Generate key for your AI"               |
   → createAiApiKey(name,{orgId,role,apps})        |
   → show plaintext key once + copy box            |
   → "Log into Capgo with this key: capgo_xxx"      |
          user copies the line  -----------------> pastes into the AI
                                                    |  AI calls capgo_login({ apikey })
                                                    |   validate (resolveUserIdFromApiKey)
                                                    |   write ~/.capgo (0o600)
                                                    |   re-init in-memory SDK
                                                    |  <- "Logged in as <email>"
                                                    |  next authed tool call works
```

## Components

### 1. Dashboard page — `src/pages/connect.vue` (route `/connect`) + `src/components/connect/ConnectAppPicker.vue`

- Authenticated page (file-based route → `/connect`, auto `meta.middleware='auth'`).
  **Adapted from** the `cli-login` authorize mockup
  (`docs/superpowers/specs/assets/2026-06-03-cli-device-login-authorize-mockup.html`) for
  visual continuity, but reframed as a self-initiated **generate → copy → paste** flow
  (no confirmation phrase, no device/terminal framing, no authorize/cancel).
- **Generate view:** token name, read-only active-org name, a **role** select
  (Admin / Member), and — for Member — the searchable multi-select `ConnectAppPicker`
  (checkbox rows with name + `app_id` + an `app_admin` tag, select-all/clear-all, a
  selected counter). Apps come from `supabase.from('apps').select('id, app_id, name, owner_org').in('owner_org', [orgId])`.
  Generate is disabled with no active org, or for Member with zero apps selected.
- On generate → `createAiApiKey(supabase, name, { orgId, role, appUuids })` returns the
  plaintext key **once**.
- **Success view:** the key in a read-only copy box (Copy button, toast on copy), a
  ready-to-paste line *"Log into Capgo with this key: `…`"* (its own Copy), a scope chip,
  a "shown once / revoke from `/apikeys`" warning, and a Back button to generate another.
- Tailwind + DaisyUI/slate styling with `dark:` variants; `vue-sonner` toasts; new
  `connect-*` i18n keys in `messages/en.json`. No new backend.

### 2. Shared auth module — `cli/src/auth/session.ts` (new)

Factor the validate/save/whoami core out of `cli/src/login.ts` so the CLI command and
**both** MCP servers share one path (no forked auth logic):

- `validateAndSaveKey(apikey, { scope: 'global' | 'local' }): Promise<LoginState>` —
  validates via the existing `resolveUserIdFromApiKey()`, writes to `~/.capgo` (global,
  default) or `./.capgo` (local) with `0o600`, returns the resolved identity.
- `getLoginState(): Promise<{ loggedIn: boolean; userId?: string; source?: 'env' | 'global' | 'local' }>` —
  reads via `findSavedKeySilent()` and validates; used by `capgo_whoami` and the
  onboarding gate.
- `clearSavedKey({ scope })` — backs `capgo_logout`.
- `cli/src/login.ts` is refactored to call these (behavior unchanged).

### 3. Main CLI MCP tools — `cli/src/mcp/server.ts`

The server already holds a mutable `sdk` and `savedApiKey` at startup. Add:

- **`capgo_login`** — input `{ apikey: string, scope?: 'global' | 'local' }` (default
  `global`). Calls `validateAndSaveKey`, then **reassigns the in-memory `sdk`** to a fresh
  `CapgoSDK({ apikey })` so subsequent tools are authenticated without restart. Returns
  the resolved identity. Clear, actionable error on an invalid key (point back to
  `/connect`).
- **`capgo_whoami`** — returns `getLoginState()` (logged-in status + identity + source).
- **`capgo_logout`** — clears the saved key and resets `sdk` to unauthenticated.

Server instructions (`cli/src/mcp/instructions.ts`) mention `capgo_login` so clients
surface it when a tool fails with an auth error.

### 4. Onboarding MCP login gate — `cli/src/build/onboarding/mcp/`

- `start_capgo_builder_onboarding` and `capgo_builder_credentials_manage` call
  `getLoginState()` first. When logged out, they **refuse** with a corrective message:
  *"You are not logged into Capgo. Open `/connect`, generate a key, and call
  `capgo_login`, then retry."* (Follows the existing corrective-response pattern used by
  `credentials_manage` when credentials are missing.)
- Register `capgo_login` and `capgo_whoami` in the onboarding tool set too, so the user
  can resolve the logged-out state in-place. Both MCPs share the section-2 module, so the
  login behavior is identical across servers.

## Data flow & error handling

- **Invalid key** → `capgo_login` returns a non-fatal error naming `/connect`; nothing is
  written.
- **Valid key** → written `0o600`; SDK re-init means the *same* MCP session is now
  authed (no restart, no reconnect).
- **Logged-out onboarding** → corrective refusal, not a crash; the AI is told exactly
  which tool to call.
- **`scope: 'local'`** writes `./.capgo` and respects existing gitignore handling in
  `login.ts`.

## Reuse summary

| Need | Reused from |
|---|---|
| Key minting (`org_admin`, no expiry) | `createDefaultApiKey({ orgId })` + existing `POST /apikey` |
| Active-org context | `organizationStore.currentOrganization` (as in `StepsApp.vue`) |
| Key validation | `resolveUserIdFromApiKey()` (today's `capgo login`) |
| Key persistence (`~/.capgo`, 0o600) | `login.ts` writer |
| Page look & feel | `cli-login` authorize mockup (stripped) + `login.vue` styling |
| Onboarding refusal pattern | `credentials-manage.ts` corrective responses |

## Testing plan

- **Unit:** `validateAndSaveKey` (valid → writes 0o600 + returns identity; invalid →
  throws, writes nothing); `getLoginState` (env / global / local / none); `clearSavedKey`.
- **Integration (main MCP):** `capgo_login` with a valid key → a subsequent authed tool
  call succeeds in the same session (proves SDK re-init); `capgo_whoami` before/after;
  `capgo_logout` returns to unauthenticated.
- **Integration (onboarding MCP):** `start_capgo_builder_onboarding` and
  `credentials_manage` refuse when logged out and proceed after `capgo_login`.
- **Frontend:** `/connect` renders the generate button + active-org name; clicking mints
  a key and shows the copy box + paste line; warning copy present.
- Target ≥80% coverage on new modules.

## Open decisions

1. **Route name** — `/connect` vs `/connect-ai` vs `/mcp`. Default `/connect`; confirm in
   plan.
2. **`capgo_logout` scope** — clear global only, or global + local? Default global only;
   local requires explicit `scope: 'local'`.
3. Whether server instructions should *proactively* advertise `capgo_login` on every
   start, or only surface it on an auth-failure. Default: surface on auth failure +
   include in instructions.
