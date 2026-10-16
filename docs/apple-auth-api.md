# Shared Apple authentication contract

Branch: `wolny/shared-apple-auth`. PR: https://github.com/Cap-go/capgo.app/pull/3715. This is the shared native/browser API and frontend-discovery contract.

All paths are relative to the existing API host (including `/functions/v1` when required by that host). JSON POST requests and responses use `Cache-Control: no-store`. No direct client Supabase Apple exchange or fallback is permitted. Supabase remains the session engine; clients install returned tokens with `supabase.auth.setSession(session)` and run their normal MFA/onboarding flow.

## Native iOS

`POST /auth/apple` JSON `{ id_token: string, nonce: string, first_name?: string, last_name?: string, captcha_token?: string, reauthenticate?: boolean }`.

Generate a fresh cryptographically random raw nonce for every attempt; send lowercase hex SHA256(raw nonce) to Apple's native API. Send the raw nonce here. Keep SocialLogin 8.5.18's immediate per-Apple-user local name cache. Names are optional display data, sanitized and bound only after signed Apple identity/nonce verification. Never send a client user ID. For reauthentication send `reauthenticate: true` and the existing Supabase access token as `Authorization: Bearer ...`; the backend requires the resulting verified Supabase identity to equal that caller before returning tokens.

## Android / browser OAuth (use this backend flow)

Do not depend on the Android SocialLogin profile names: that implementation returns null names. Use the system browser / browser navigation to the `authorization_url` below and capture the redirect in your application. The backend captures Apple's one-time `user.name` form field.

1. Retain a random 43–128 character base64url `code_verifier` locally for this attempt. Compute `code_challenge = base64url(SHA256(code_verifier))` without padding. Generate and retain a random `client_state` (32+ characters).
2. `POST /auth/apple/start` JSON `{ redirect_uri: string, code_challenge: string, client_state: string, reauthenticate?: boolean }`. The redirect must exactly match a server configured allowlist entry. Reauthentication also requires the existing session Bearer header. Response `{ authorization_url: string, expires_in: 600 }`. Navigate to that URL. Backend chooses the Apple Services ID, generates its own state and raw nonce, requests `code id_token`, scopes `name email`, and `response_mode=form_post`.
3. Apple POSTs to **`/auth/apple/callback`**, the exact HTTPS callback configured server-side and in Apple Developer Portal. Backend validates one-use state, Apple signature/issuer/audience/expiry and SHA256 nonce before retaining the first name. It redirects only to the stored allowlisted redirect with fragment `#apple_code=<opaque single-use code>&state=<client_state>`. Cancellation/error redirects use `#apple_error=apple_authorization_failed&state=<client_state>`. No Apple credentials or Supabase tokens appear in redirect query strings.
4. The consumer verifies the returned `state` equals its retained `client_state`, strips the fragment, then `POST /auth/apple/exchange` JSON `{ code: string, code_verifier: string, captcha_token?: string }`. A fresh CAPTCHA can be supplied here. Missing/expired/replayed codes and wrong verifier fail without issuing a session. Retain the verifier until completion; start another authorization after expiry.

## Session response / errors

Both `/auth/apple` and `/auth/apple/exchange` return HTTP 200 `{ user: <Supabase User>, session: { access_token: string, refresh_token: string }, name_status: 'saved' | 'unavailable', authorization_code?: string }`. Name persistence failures fail completion and retain the verified first name for retry; absent names never overwrite existing chosen names. `unavailable` means no name exists in the actual public profile and Apple supplied none; allow normal profile editing, do not require name disclosure for sign-in. OAuth `authorization_code` is Apple's original short-lived code, usable only for immediate deletion revocation with `client: 'web'` on `/private/revoke_apple_authorization`; iOS retains the native plugin code and uses the existing native revocation route. MFA remains required after installing an AAL1 session and before sensitive actions.

Errors use existing `{ error: string, message: string }` JSON shape: 400 `invalid_request` / `invalid_apple_credential` / `invalid_exchange`; 401 `not_authenticated`; 403 `account_deleted` / `sso_required` / `reauth_user_mismatch`; 422 `captcha_failed`; 429 `too_many_requests`; 500 `apple_login_failed`; 503 `apple_login_unavailable`. Do not display server internals or log request/response credentials, names, or sessions.

## Configuration / rollout

Existing server-only `APPLE_SIGN_IN_CLIENT_ID` is the native bundle audience. Additional `APPLE_SIGN_IN_WEB_CLIENT_ID` is the Apple Services ID for Android/browser. Supabase Apple provider must accept both configured IDs and preserve normal automatic identity linking; group the Services ID with the native app in Apple Developer Portal. Existing team/key/private-key settings stay server-only. `APPLE_SIGN_IN_OAUTH_CALLBACK_URL` must be the exact HTTPS API `/auth/apple/callback` URL. `APPLE_SIGN_IN_REDIRECT_URLS` is a JSON array of exact permitted consumer redirect URLs (HTTPS website URLs or explicitly registered native app links). Never wildcard this list. No production credentials, rollout flags, Apple portal settings, or Supabase configuration are changed by this PR. Backend availability and public visibility use separate default-off switches, described below. Native UI still requires a real supported iOS binary and SocialLogin plugin.

OAuth pending attempts expire after 10 minutes, are single-use and verifier-bound, and use restricted server storage. First names survive interrupted completion in restricted server storage bound to verified Apple subject, then fill only empty actual Capgo profile fields. No account is deleted as rollback for Apple failure. Existing email registration password rules and response remain compatible.

Consumers must wait for the backend migration/deployment and external Apple/Supabase configuration before enabling their UI. This contract may receive implementation clarifications; reread it before final validation.

## Website integration clarification (console-owned completion)

Use a **console-owned authorization round trip** for website entry. Do not exchange on the website origin and then attempt to transfer a session across origins. The website button navigates to `https://console.capgo.app/login?apple_oauth=1` and may add the allowlisted attribution/device/experiment fields below as ordinary query parameters (no credentials). The console creates and retains the verifier/state in its own sessionStorage, calls `/start` with `redirect_uri: 'https://console.capgo.app/login'`, navigates to Apple, consumes and immediately strips the returned fragment, completes `/exchange` with its CAPTCHA, installs the session and runs existing MFA/onboarding. This PR owns that minimal console bootstrap/completion handler. It adds no website or Android Apple button. The canonical website `/register/apple/callback/` is **not needed** by this flow. Native Android clients use their own app-link callback and retain their own verifier as described above.

`GET /auth/apple/capabilities` returns HTTP 200, no-store, without credentials:

```ts
{
  native: { enabled: boolean, api_enabled: boolean }
  web: { enabled: boolean, api_enabled: boolean, redirect_uris: string[] }
}
```

`api_enabled` reports new-login backend readiness; `enabled` additionally requires the corresponding explicit public-visibility switch. Native readiness requires backend credentials and an enabled Supabase Apple provider; web readiness also requires the Services ID, HTTPS callback and exact redirect allowlist. Missing settings or failed readiness lookups return false. With API on and both public switches off, both `enabled` values stay false while valid API calls can complete. The website and Android UI must continue requiring `enabled` and their exact configured redirect; they must never treat `api_enabled` alone as permission to show a public button. The redirect list remains available when the web API is ready and public visibility is off so an explicitly opted-in development frontend can verify its exact redirect. No secrets are exposed by that list.

| Vault runtime setting | Default | Controls |
| --- | --- | --- |
| `APPLE_LOGIN_API_ENABLED` | Off | New native login and new browser `/start` and `/exchange` session issuance |
| `NATIVE_APPLE_LOGIN_ENABLED` | Off | Public native button discovery through `/private/config.nativeAppleLoginEnabled` and native capabilities |
| `WEB_APPLE_LOGIN_ENABLED` | Off | Public browser/Android/website discovery through `web.enabled` |

Each setting supports the existing same-name deployment environment override; remove an override to control it through Vault. Runtime values are cached for up to 60 seconds. After deployment and Apple/Supabase setup, an operator can enable **only `APPLE_LOGIN_API_ENABLED=true`**, leaving **`NATIVE_APPLE_LOGIN_ENABLED=false` and `WEB_APPLE_LOGIN_ENABLED=false`**. That enables API testing without publishing any Apple button. Merging this code does not enable any flag or provider and does not prove that the production provider is configured. A failed/403 production capability request does not establish flag values.

Disabling the API switch rejects new logins even if they began earlier: `/exchange` checks availability in its atomic verifier-bound consume operation and leaves a new-login completion intact while disabled. A valid already-started `/callback` still verifies the Apple credential, nonce/code binding and state, and securely retains Apple's one-time name. It cannot issue a session. A later enabled exchange or fresh authorization can reuse the retained verified name.

**Deletion reauthentication is deliberately independent of all signup/visibility switches.** Native `reauthenticate: true` still requires the existing Bearer session, its verified Apple subject and the same resulting Supabase user. Browser reauthentication must be created with that authenticated session and stores the expected user/subject; exchange remains bound to that attempt and client verifier. These authenticated same-account paths and private authorization-code revocation remain available with signup switches off, provided credentials are configured. CAPTCHA, rate limits, email OTP, fresh-auth and MFA checks remain. No unauthenticated reauthentication flag bypasses these requirements.

Successful native and OAuth session responses additionally return `is_new_user: boolean`: true only when this request inserted the actual Capgo public profile, false for a returning/linked account or a concurrent duplicate. Signup conversion events must use this value. Existing server `on_user_create` provisioning hooks still run once from that insert. Clients must never infer newness from the Apple name, email, or token issuance.

`registration_metadata` is an optional object on `/auth/apple` and `/auth/apple/start`, persisted with the attempt and applied only when provisioning a new account. It accepts only bounded strings for `registration_device_type`, `registration_os`, `registration_browser`; attribution `signup_ref`, `signup_plugin`, `signup_source`, `first_touch_type`, `first_touch_path`, `first_utm_source`, `first_utm_medium`, `first_utm_campaign`, `first_utm_content`, `first_utm_term`; experiment `registration_variant`, `registration_experiment`, `registration_experiment_variant`. Attribution is sanitized with the existing shared signup-attribution parser. Unknown fields are discarded. These fields are analytics data only, never permissions/consent. Console website entry copies only these fields from the query string. Names remain optional and newsletters remain opted out unless separately chosen.

The exact production console redirect is **`https://console.capgo.app/login` (no trailing slash)**, matching `configs.json`. For website conversion tracking, open that console entry in a popup directly from the click, with `apple_website_state=<random 32+ character base64url state>`. Retain both that state and the returned popup Window reference on the website. After `/exchange` succeeds, the console sends `window.opener.postMessage({ type: 'capgo:apple-auth-complete', state: <apple_website_state>, is_new_user: <backend result>, user: { id, email } }, 'https://capgo.app')`. It sends no session/Apple credentials. The website MUST verify `event.origin === 'https://console.capgo.app'`, `event.source === popup`, and `data.state === retainedState`, accept once, and fire signup/affiliate conversion events only when `is_new_user === true`. It must use its retained original experiment/attribution for those events. A returning account may receive the completion message with `is_new_user: false`; do not count that as signup. A same-tab fallback still signs in at the console, but cannot report website popup completion and must not fabricate conversion events. The user id/email in this trusted-origin message are optional analytics identity data, never authorization. Local/preproduction callbacks require separately reviewed origin configuration; production origin checks must not be relaxed to suffix matching.

Account status: successful session responses include `account_status: active | disabled`. A scheduled-for-deletion account receives `disabled`, `is_new_user: false`, and no profile writes; clients install the session and use the existing disabled-account guard/restoration screen. Permanent deleted-email checks still reject authentication. Do not turn scheduled deletion into an unrecoverable login ban.

## Storage and execution model

The new tables are server-only (RLS enabled; explicit service-role policy/grants; no anon/authenticated privileges). Pending Apple ID tokens/codes are AES-GCM encrypted using a domain-separated key derived from the server Apple signing key; sessions are returned only over JSON POST. State, exchange-code and token-replay lookups use primary/unique indexes; cleanup uses expiry indexes and at most 100 rows/request. No extension, cron, queue, plugin hot path, auth grant or published-CLI contract changes. Captured names bind to the verified Apple subject and then the verified Supabase user; deleting that auth user cascades the saved name. Incomplete names with no user association are eligible for bounded cleanup after 30 days. Attempts expire after ten minutes; replay markers after fifteen. Apple tokens must have an issued-at within ten minutes. Failed completion preserves captured names; start a fresh authorization after a consumed exchange fails.

The account checks are existing RPCs, called once per verified email/identity per console authentication request, never in a per-row policy or plugin path. `get_sso_enforcement_by_domain` uses unique `sso_providers_domain_key` then `orgs_pkey`; `is_account_disabled` uses unique `to_delete_accounts_account_id_key`; profile lookups/conditional updates use `users_pkey`. `is_not_deleted` retains the existing registration/deletion-policy lookup on `deleted_account.email` (the existing small deleted-account dataset); no broad app/org resource scan or new SQL function is introduced. Production credential smoke tests and production-scale execution evidence require operator access and are rollout dependencies; local tests exercise signed Apple assertions, state/nonce/code-hash validation, replay, database privileges/constraints, and iOS deletion/MFA safeguards.

Rollout and deletion: ordinary native and browser signup/login requires `APPLE_LOGIN_API_ENABLED`; it does not require either public UI switch. Native deletion reauthentication requires the existing Bearer session and matching Apple subject/user, and browser deletion reauthentication stores those verified identities at `/start` and checks both at `/exchange`. These authenticated paths remain usable when the API/signup and UI switches are off. Clients must not gate deletion reauthentication on a signup capability boolean. Configuration and signing secrets must remain available until the last Apple account is deleted.

Console startup captures and strips callback fragments before router and analytics initialization, and analytics URL sanitization also removes Apple callbacks from initial person properties. Completion keeps the opaque code and verifier together only in memory after removing the pre-redirect storage entry. Reloading during CAPTCHA/completion requires a fresh authorization; the verified first name remains on the backend. Names containing markup delimiters are discarded as optional display data, and control/format characters are removed from accepted names. Browser/Android revocation exchanges include the same configured HTTPS callback URI as the original authorization request.


## Local development against a production backend

Use the actual browser Services-ID OAuth flow. Do not fake iOS or SocialLogin availability. The local opt-in is `VITE_DEV_APPLE_LOGIN_ENABLED=true`, and is honored only by a Vite development server, in a browser, on HTTPS, with `web.api_enabled === true` and an exact `${location.origin}/login` entry in the backend redirect allowlist. Production web builds ignore the opt-in even if the variable is set; native/mobile builds never use this browser override. The ordinary native button still requires the public native flag and actual iOS/plugin support.

For an internal development session using the existing production-backed dev-server configuration:

```sh
VITE_DEV_APPLE_LOGIN_ENABLED=true bun run serve:prod-no-cors -- --host 127.0.0.1
```

Serve that local frontend through your approved HTTPS setup and browse its **HTTPS** origin. The command by itself starts a local HTTP server; it does not register an HTTPS origin, expose a port, change backend/provider settings, or bypass network policy. If an HTTPS tunnel is needed, arrange it separately. Before testing, the operator must:

1. Deploy the migration/backend, configure Apple native/Services-ID audiences, signing credentials and Supabase Apple with nonce verification enabled.
2. Register the fixed production API HTTPS `/auth/apple/callback` as the Apple Services-ID return URL. Apple still posts to the backend; do not register the local frontend as Apple's credential callback.
3. Add the **exact** development `https://<approved-host>/login` URL, without a trailing slash, to `APPLE_SIGN_IN_REDIRECT_URLS`. No wildcard, suffix matching, automatic localhost entry or HTTP redirect exception is added. For a non-local HTTPS host, allow that exact origin using the existing `CORS_ALLOWED_ORIGINS` configuration and any applicable network policy; the code does not relax CORS or a production 403 policy.
4. Enable only `APPLE_LOGIN_API_ENABLED`, with both public UI switches explicitly false. Verify capability readiness and the exact redirect from the local browser before clicking.

The development button starts the same backend state/nonce/PKCE flow and installs the returned Supabase session on the local frontend. It retains normal CAPTCHA, MFA, SSO, disabled-account and onboarding guards. Keep the production popup receipt pinned to `https://capgo.app` and console origin `https://console.capgo.app`; local testing does not receive or fabricate website conversion receipts. Local testing here covers authentication in that frontend, not cross-origin production website tracking. No live credentials are needed for mocked automated tests, but a real provider smoke test requires the separately configured credentials and approved exact HTTPS origin.
