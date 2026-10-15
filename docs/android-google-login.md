# Android Google sign-in

Android uses the installed SocialLogin provider's online Google flow and the
shared `POST /auth/google` backend. The backend verifies the Google token and
nonce, enforces account and SSO policy, provisions the Capgo profile idempotently,
and returns the Supabase session. The client only installs that returned session.
The shared Google backend/iOS work follows the shared Apple backend PR
[#3715](https://github.com/Cap-go/capgo.app/pull/3715); the Google API must ship
before enabling this consumer. Android Apple support is tracked separately in
[#3713](https://github.com/Cap-go/capgo.app/pull/3713).

Each attempt generates a fresh 32-byte nonce. SocialLogin receives its lowercase
SHA-256 hex digest; the backend receives the raw nonce, ID token and optional
matching Google access token. Client profile names, email and user IDs are never
used as authenticated identity. No direct Supabase Google exchange or fallback
runs on Android. Credential cancellation returns to the form normally.

## Native and provider setup

A new Android binary is required: `SocialLogin.providers.google` enables the
native Google libraries during Capacitor sync. The Env plugin carries an
immutable `CAPGO_NATIVE_GOOGLE_LOGIN` marker and a public
`CAPGO_GOOGLE_WEB_CLIENT_ID` in the installed binary. Older binaries have no
marker and cannot enable Google by receiving new JavaScript.

Use dedicated Google Cloud app sign-in clients in the same project:

- A **Web application** client is the online flow's `webClientId`. Set its public
  client ID as `CAPGO_GOOGLE_WEB_CLIENT_ID` when running `bun run sync:android`
  and when preparing the native build. It must match the backend's configured
  Google web client. Keep the web client secret on the backend only.
- **Android** clients register the actual package `ee.forgr.capacitor_go` and the
  SHA-1 of each certificate that really signs an installed build. Register debug,
  direct distribution/release, and Google Play app-signing certificates as
  applicable. Read the fingerprints from the actual keystore or Play Console's
  app signing page. An upload-key fingerprint alone does not identify a
  Play-signed installation. Never substitute example fingerprints or pass an
  Android client ID as `webClientId`.
- Configure the Supabase Google provider and backend audience/presenter
  allowlists for those exact clients, with nonce verification enabled. The
  backend's dedicated OAuth callback, web secret and runtime settings belong to
  the shared API setup. An unrelated broker or Desktop client is unsuitable.

This PR supplies no production OAuth IDs, secrets or certificate fingerprints.
Parent/operator provider setup and device validation are rollout prerequisites.
The existing release version and release workflows are unchanged.

## Availability and rollout

The login button requires all of:

1. A native Android platform with the SocialLogin and Env plugins.
2. The installed binary's marker and a valid bundled web client ID.
3. An explicit `VITE_ANDROID_GOOGLE_LOGIN_ENABLED=true` frontend build.
4. A successful no-store `GET /auth/google/capabilities` response whose
   `native.enabled` is true and `native.web_client_id` exactly matches the binary.

The frontend opt-in defaults to false, including production proxy builds.
The backend's Vault-backed `NATIVE_GOOGLE_LOGIN_ENABLED` rollout switch and real
provider readiness control the capability. Missing configuration or a failed
capability request hides normal login. This change does not enable any flag or
provider configuration.

Configured binaries retain authenticated same-account Google reauthentication
when signup switches are off or capability lookup fails. The backend still must
validate the current Bearer session, Google subject and resulting user ID.
Reauthentication does not create profiles or emit signup events.

## Existing account protections

Google sessions continue through the existing deleted-account, enforced-SSO,
MFA, account-status and onboarding guards. Missing optional names prompt the
user to add a name in account settings. The backend derives names from signed
claims, fills only eligible empty profile fields, preserves chosen names and
consent, and owns new-user registration analytics. The client forwards bounded
mobile attribution metadata; it does not emit a second `User Joined` event or
infer signup from token/name fields. Returning and linked accounts remain
`is_new_user=false` according to the backend response.

Google-only native accounts can delete without adding a password: recent email
OTP, fresh same-account Google reauthentication, enrolled MFA, then confirmation
and the existing `delete_user` RPC. Identity and recent OTP are checked again at
confirmation; the database still enforces freshness. Accounts also linked to
Apple retain the Apple authorization revocation path. Google does not bypass it.
Web, iOS and password-based deletion remain on their existing paths.

## Before rollout

With the actual signed Android build and provider clients configured, validate
new and returning accounts, linked-account behavior, optional names, cancellation,
MFA, enforced SSO, disabled/restorable accounts, and passwordless deletion.
Confirm new-user analytics occur once and returning logins do not become signup
events. Verify signup-off reauthentication still works and an older binary that
receives the JavaScript keeps the Google button hidden. Local mocked tests cannot
replace this real provider/device check.

Button artwork comes from Google's
[official sign-in assets](https://developers.google.com/identity/branding-guidelines).
The original gradient G asset and licensed Google Sans font are self-hosted.
