# Shared Google authentication

This extends the shared Apple authentication and account-provisioning pipeline. All Google credentials go through the backend; Supabase remains the session and account-linking engine. Clients install the returned session with `supabase.auth.setSession`. There is no direct Supabase Google exchange fallback.

## Native credential exchange

`POST /auth/google` accepts JSON:

```ts
{
  id_token: string
  nonce: string
  access_token?: string
  captcha_token?: string
  reauthenticate?: boolean
  registration_metadata?: Record<string, string>
}
```

Generate a fresh random nonce for every attempt, send its lowercase SHA-256 hex digest to the Google SDK, and send the original nonce to this endpoint. Use the installed SocialLogin online mode with `iOSClientId` and `iOSServerClientId` (the web client ID). iOS uses `forcePrompt: true` to avoid restoring a cached credential with another attempt's nonce. Android consumers use their separately configured native implementation and the same backend contract.

The backend independently verifies Google's RS256 signature, either documented Google issuer, expiration, issue time (maximum age ten minutes), configured single audience, optional configured authorized presenter, verified email, subject, and nonce. Browser tokens must use the web audience and presenter. Native audiences are the configured web, iOS and explicit Android client IDs. If `at_hash` is present, the matching Google access token is required and verified. Names come only from signed claims and remain optional display data. Client names, email and user IDs are never trusted as identity.

The token is consumed once before the Supabase exchange. The shared pipeline checks deleted accounts and enforced SSO for both the Google email and any linked primary email. It preserves selected profile names, newsletter consent, existing accounts and factors. Default newsletter consent is false. Scheduled deletion remains restorable: disabled accounts receive their normal session without new profile writes, then follow the existing disabled-account guard. Failed provisioning revokes only the newly issued session.

Success returns `{ user, session: { access_token, refresh_token }, is_new_user, name_status, account_status }`. `is_new_user` means this request inserted the actual Capgo public profile; linked, returning and duplicate insertions are false. `name_status` is `saved` or `unavailable`; `account_status` is `active` or `disabled`. Existing MFA and onboarding guards still run after session installation.

## Browser and Android system-browser transport

1. `POST /auth/google/start` accepts `{ redirect_uri, code_challenge, client_state, reauthenticate?, registration_metadata? }`. The redirect must match the exact configured allowlist. The client retains a random verifier and state; the challenge is base64url SHA-256 of the verifier. The response is `{ authorization_url, expires_in: 600 }`.
2. The backend creates separate Google state, nonce and provider PKCE values. Google submits its authorization response to **POST `https://api.capgo.app/auth/google/callback`**, using `response_mode=form_post`. The server claims the state once, exchanges the code with its secret and provider verifier, verifies the credential, and encrypts it in temporary server storage.
3. The client receives only `#google_code=<opaque one-use code>&state=<client_state>` or `#google_error=google_authorization_failed&state=<client_state>`. No Google or Supabase credential enters the redirect URL.
4. `POST /auth/google/exchange` accepts `{ code, code_verifier, captcha_token? }`. Atomic consumption checks the verifier and expiry. A wrong verifier does not consume the completion. The server performs the shared account checks and returns the session over POST.

Attempts expire after ten minutes and replay markers after fifteen minutes. Primary/unique indexes bind state, completion and credential hashes; indexed expiry cleanup processes at most 100 expired rows per request. These are console login paths, not plugin request paths. Both tables deny anonymous and authenticated access, with explicit service-role grants and constant service-role RLS policies. No new SQL functions, queues, extensions or cron jobs are introduced.

## Website entry and console completion

The website opens `https://console.capgo.app/login?google_oauth=1&google_website_state=<random state>`, retaining the popup reference and state. It may forward the same allowlisted signup attribution and registration metadata as Apple. The exact production console redirect is `https://console.capgo.app/login`, without a trailing slash. The console owns the verifier and session exchange. Its shared provider transport strips callback fragments before router and analytics startup; the completion credential and verifier remain together only in memory.

After session installation, the console sends this analytics-only receipt to the exact website origin:

```ts
window.opener.postMessage({
  type: 'capgo:google-auth-complete',
  state,
  is_new_user,
  user: { id, email },
}, 'https://capgo.app')
```

The website must validate the exact console origin, expected popup source, retained state, provider and one-time receipt. Signup conversions run only when `is_new_user === true`. Retain the opener through provider navigation. The receipt contains no session or provider credential. Normal console MFA, disabled-account and onboarding guards still apply. Website and Android UI enablement belong to their separate consumer changes.

## Capability and rollout settings

`GET /auth/google/capabilities` returns:

```ts
{
  native: {
    enabled: boolean
    ios_client_id?: string
    web_client_id?: string
    ios_min_version?: string
  }
  web: { enabled: boolean, redirect_uris: string[] }
}
```

Missing configuration, failed lookups or a disabled Supabase Google provider fail closed. Public client IDs can remain available for authenticated reauthentication with signup disabled. Server deployment settings:

| Setting | Purpose |
| --- | --- |
| `GOOGLE_SIGN_IN_WEB_CLIENT_ID` | Dedicated web app sign-in client; also the native server audience |
| `GOOGLE_SIGN_IN_WEB_CLIENT_SECRET` | Server-only web code exchange and temporary credential encryption |
| `GOOGLE_SIGN_IN_IOS_CLIENT_ID` | Dedicated client for the checked-in iOS bundle identifier `ee.forgr.capacitorgo` (not the OTA app ID `ee.forgr.capacitor_go`) |
| `GOOGLE_SIGN_IN_ANDROID_CLIENT_IDS` | Optional JSON array of allowed Android client IDs |
| `GOOGLE_SIGN_IN_OAUTH_CALLBACK_URL` | Fixed HTTPS form-post callback above |
| `GOOGLE_SIGN_IN_REDIRECT_URLS` | JSON array of exact allowed client redirects |

Vault-backed runtime settings `NATIVE_GOOGLE_LOGIN_ENABLED` and `WEB_GOOGLE_LOGIN_ENABLED` default off. `NATIVE_GOOGLE_IOS_MIN_VERSION` must name the first native binary containing Google support. Deployment environment values with those names override Vault; remove them to control runtime configuration through Vault. Settings are cached for up to 60 seconds. This change does not enable production flags or configure credentials.

## iOS binary and deletion requirements

The compiled SocialLogin Google provider is enabled and Google callback URLs are offered to `GIDSignIn` before the existing preview/deep-link handler. Google is shown alongside Apple only on iOS with SocialLogin and a configured compatible binary. The native version comes from `App.getInfo().version`, never the OTA bundle/package version. Missing or older binary versions keep Google hidden.

**Release prerequisites remain external:** create dedicated iOS and web OAuth clients; register the actual reversed iOS client-ID URL scheme in `ios/App/App/Info.plist`; rebuild/sync the native project with Google SDK dependencies; choose the first compatible native release version; configure Google and Supabase provider audiences with nonce verification enabled. The existing broker and Desktop clients must not be reused. No guessed client IDs, empty URL scheme, release version, CI credentials or signing targets are added here. Preserve the iOS16/FastSQL8.2.13 repair from #3716 when integrating this dependent branch with current main. Until the actual client IDs and compatible binary are configured, native availability remains false.

Google-linked accounts on a compatible iOS binary can delete their account without inventing a password. Reauthentication sends `reauthenticate: true` with the current Supabase Bearer token. The backend requires the existing verified Google subject and the same resulting user ID, even when signup rollout is off. The page rechecks the account at confirmation and retains existing email OTP, enrolled MFA and the deletion RPC's five-minute fresh-login requirement. Apple-linked accounts retain Apple reauthentication and authorization-code revocation before deletion.

Before enabling rollout, verify real-device first/returning login, cancellation, existing-email linking, optional names, consent preservation, managed SSO, MFA, disabled/deleted accounts, passwordless deletion and old-binary hiding. Verify browser form-post callback, replay rejection, exact redirects and website popup completion against configured providers. Unit and local browser mocks cannot replace these credentialed checks.

Errors use the existing JSON error shape and include `invalid_request`, `invalid_google_credential`, `invalid_exchange`, `not_authenticated`, `account_deleted`, `sso_required`, `reauth_user_mismatch`, `captcha_failed`, `too_many_requests`, `google_login_failed` and `google_login_unavailable`. Responses are no-store; provider credentials and upstream response bodies are never forwarded to error reporters.
