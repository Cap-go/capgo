# Android Sign in with Apple

This is a future Android feature. It does not change the `capgo-17.0.0` release or enable any production setting. Merge and deploy the shared backend/iOS Apple authentication PR (`wolny/shared-apple-auth`) and its migration **before** enabling this Android build. The authoritative endpoint contract is `docs/apple-auth-api.md` in that PR. Keep this PR based on `main`; do not change its base to the unmerged backend branch.

## Visibility and rollout

The existing Apple button stays below email login. It appears on Android only when all of these are true:

- This web bundle was built with `VITE_ANDROID_APPLE_LOGIN_ENABLED=true`. The default is `false`; the flag is a deployment-time opt-in, not a runtime database setting.
- The binary contains the native SocialLogin plugin, including `openSecureWindow` (the locked dependency is `@capgo/capacitor-social-login` 8.5.18).
- `/auth/apple/capabilities` reports `web.enabled: true` and includes exactly `capgo://apple-auth/callback` in `web.redirect_uris`. This fails closed on missing Services ID/callback/provider setup or a disabled Vault-backed `WEB_APPLE_LOGIN_ENABLED` setting.
- `/private/config` explicitly returns `nativeAppleLoginEnabled: true`, controlled by the existing Vault-backed `NATIVE_APPLE_LOGIN_ENABLED` switch. Keep that switch off until the required setup has been verified. Existing Apple users can reauthenticate for deletion with rollout off in a configured Android build; reauthentication bypasses both login visibility flags while the backend still checks configuration and the authenticated identity.

For a reviewed Android build after setup, run `VITE_ANDROID_APPLE_LOGIN_ENABLED=true bun run build` and `bunx cap sync android`. Do not enable the build opt-in in the existing release workflow. Web continues to hide the native button; iOS keeps its native authorization sheet and uses the shared backend exchange.

## Required external setup

These steps require the Apple/Supabase/backend operators. This PR creates no credentials and does not turn on production flags.

1. In Apple Developer Certificates, Identifiers & Profiles, keep Sign in with Apple enabled for the native primary App ID (`ee.forgr.capacitorgo`, the iOS bundle identifier). Create a **Services ID** for Android/browser authorization, enable Sign in with Apple for it, and associate it with that primary App ID. Grouping must preserve the same Apple identity for existing native accounts. The Android package is `ee.forgr.capacitor_go`; it is not the Apple Services ID or the native iOS audience.
2. Configure the Services ID's website domain to the deployed API callback domain. Set its Return URL to the exact HTTPS `<API host>/auth/apple/callback` (including `/functions/v1` if that deployment uses it). The Apple Return URL is the server callback, not the `capgo:` app URI.
3. Configure server-only `APPLE_SIGN_IN_WEB_CLIENT_ID` to that Services ID, `APPLE_SIGN_IN_OAUTH_CALLBACK_URL` to the exact HTTPS callback, and add exactly `capgo://apple-auth/callback` to the JSON array in `APPLE_SIGN_IN_REDIRECT_URLS`. Preserve the website's exact redirect entries; do not use a wildcard. Keep `APPLE_SIGN_IN_CLIENT_ID` as the native iOS audience and retain the existing Apple team, key ID and `.p8` signing-key settings on the server.
4. Enable the Supabase Apple provider and accept both the native App ID and the Services ID. Keep nonce verification and automatic account linking configured as required by the shared backend. Verify the Apple private email relay sender so Hide My Email users receive the email OTP required for deletion.
5. Deploy the shared backend migration and endpoints. Verify start, first callback name capture, exchange, same-account reauthentication and `client: 'web'` revocation in the intended environment. Complete the device checks below before building with the Android opt-in and enabling `WEB_APPLE_LOGIN_ENABLED` and the existing native runtime switch.

`android/app/src/main/AndroidManifest.xml` already registers the `capgo` scheme on the exported `singleTask` MainActivity. No additional intent filter or `assetlinks.json` change is needed for this custom-scheme return. The exact callback is `capgo://apple-auth/callback`. The SocialLogin Custom Tab resolves through MainActivity's normal `onNewIntent` forwarding. The generic app-link router deliberately ignores this host and never stores its authorization fragment or routes it to a page. A third-party app intercepting the custom URI cannot exchange its code without this attempt's in-memory verifier.

## Flow and interruption behavior

Android calls `POST /auth/apple/start` with an S256 challenge, a fresh random client state and the exact app redirect. The backend generates Apple's state and nonce, then supplies the Apple authorization URL. `SocialLogin.openSecureWindow` opens it in the system browser's Custom Tab. The Android Apple `login()` provider path is deliberately unused: in 8.5.18 it expects tokens (or an Apple client secret) in redirect parameters and does not provide the name fields.

Apple POSTs the first-authorization name to the backend callback; names are absent from the ID token. The shared backend verifies identity and nonce, saves the initial name durably, and returns only an opaque code and client state in the app URI fragment. The app checks the entire destination and matching state, then sends the code, verifier and optional CAPTCHA in `POST /auth/apple/exchange`. It installs the returned session using `supabase.auth.setSession`. Supabase Apple authentication is never called directly by either native platform.

The verifier and client state are kept only in memory. Closing the browser returns quietly and allows another attempt. If Android kills the app during authorization, the old callback is ignored and the user starts again; the backend retains a verified first name independently of client completion. Attempts expire after ten minutes. An expired code or CAPTCHA, network failure or account policy rejection asks the user to retry. No session tokens or signing secrets travel in callback query strings, and callback fragments are not written to app storage or logs by this implementation.

A successful session continues through the existing MFA, managed-domain SSO, account status and onboarding checks. The backend owns duplicate/account linking and profile provisioning. An unavailable name leaves sign-in usable and points the user to account settings; it never forces name disclosure or overwrites an existing chosen name.

Deletion keeps email OTP, same-account Apple reauthentication, MFA and the existing five-minute freshness window. Android passes the authorization code from the shared exchange to `private/revoke_apple_authorization` with `client: 'web'`, so the backend exchanges/revokes it with the Services ID. iOS keeps its native audience. Revocation failure leaves the account intact; retry Apple authentication if the code expires while completing MFA or confirmation.

## Verification

Run `bun run lint:backend`, `bun run lint`, `bun run typecheck`, `bun run test:unit`, and `bun run build`. The Android transport tests cover verifier/challenge binding, fresh state, callback tampering, cancellation, concurrent attempts, reauthentication identity, session establishment, denied endpoints and the absence of a direct Supabase fallback. Page tests preserve MFA, SSO and deletion behavior and verify Android's revocation client. Deep-link tests ensure authorization fragments are never persisted or routed by the general handler.

Before rollout, test a signed Android review binary on a real device with Chrome and another supported Custom Tabs browser: first authorization (real and Hide My Email), returning login without a name, cancellation/back, app process death during authorization, expired/replayed callbacks, offline exchange/retry, duplicate email/account linking, MFA, enforced SSO, disabled/deleted accounts, onboarding and passwordless deletion/revocation. Verify the unconfigured Android build, web and older binaries hide the button, and that iOS still uses its native sheet. A local mocked browser preview cannot validate Apple credentials, actual browser return or native revocation.

Plugin references: [Android setup](https://github.com/Cap-go/capacitor-social-login#apple) and [openSecureWindow API](https://github.com/Cap-go/capacitor-social-login#opensecurewindow). Apple reference: [Configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/).
