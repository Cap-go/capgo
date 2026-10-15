# Native iOS Sign in with Apple

The Apple button is available only on iOS binaries containing the SocialLogin plugin, after server configuration explicitly enables it. Web and Android keep their current login UI. Older iOS binaries cannot call the missing plugin. Native login exchanges an Apple identity token with Supabase, with a random nonce whose SHA-256 hash is sent to Apple; Supabase verifies the original nonce. Existing MFA, SSO enforcement, disabled-account handling and onboarding remain in the login flow.

## Signing and provider setup

1. Enable Sign in with Apple on the existing Apple Developer App ID. The checked-in Xcode bundle identifier is `ee.forgr.capacitorgo`; verify it against the published app. The separate Capgo OTA app identifier is `ee.forgr.capacitor_go` and must not replace the Apple bundle identifier.
2. Regenerate the App Store Connect provisioning profile using the distribution certificate used by Builder. Update the matching entry in the GitHub Actions `CAPGO_IOS_PROVISIONING_MAP_BASE64` secret, preserving other targets. Existing certificate and upload API credentials can stay unchanged.
3. Enable the Apple provider in Supabase Auth and allow the native iOS bundle identifier as a client ID. Keep nonce verification enabled. No web Services ID or callback is needed for this iOS-only flow.
4. Create a Sign in with Apple key for the primary App ID, download its `.p8` private key, and record the key ID and developer team ID. This key is separate from the App Store Connect upload API key.
5. In the backend deployment secrets, set `APPLE_SIGN_IN_CLIENT_ID` (native bundle identifier), `APPLE_SIGN_IN_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, and `APPLE_SIGN_IN_PRIVATE_KEY` (PEM, actual or escaped newlines). These values stay on the server. The server generates short-lived client secrets for Apple token revocation.
6. Configure Apple's private email relay for Capgo's authentication email sender and verify OTP delivery to Hide My Email addresses. Email verification remains required for account deletion.
7. Set the Vault secret named `NATIVE_APPLE_LOGIN_ENABLED` to `true` only after provider configuration and the signing profile are ready. Omitting the switch, setting it to false, missing credentials, or a configuration lookup failure hides the button. The Vault value is cached at the edge for up to 60 seconds. A backend environment value with the same name is a deployment-time override, so remove it to control rollout through Vault. Existing Apple users can still reauthenticate for deletion when the switch is off, provided server credentials remain configured.

## Account deletion

Apple accounts use the same account-deletion screen, with Apple reauthentication instead of a password. Email OTP, matching account identity, fresh authentication and any enrolled MFA remain required. Before scheduling deletion, the authenticated backend exchanges the fresh Apple authorization code, validates its signed identity token against the authenticated user's server-side Apple identity, and revokes the access token with Apple. Codes and tokens are not persisted or logged by this implementation. The Apple sign-in must be less than five minutes old when revocation starts, including any time spent on MFA and confirmation. If it expires, restart Sign in with Apple; later MFA does not extend that window. A failed revocation leaves the account intact and asks the user to retry.

The existing delayed deletion and restoration policy remains in place. Authorization revocation does not delete the Capgo account by itself; deletion is scheduled through the existing user-scoped RPC.

## Release and verification

Use the release automation's native major-version boundary. Production currently blocks cross-major OTA updates. Stage the new native generation on a review channel while the production channel continues serving the existing generation. Keep a separate legacy release branch/channel if older native generations must continue receiving OTA fixes after release. Do not manually edit package versions or changelogs.

Build with Capgo Builder, then verify on TestFlight: first authorization with both real and relay email; returning login without another name; cancellation; existing-email account linking; MFA; managed SSO domains; disabled/deleted accounts; new-user onboarding; passwordless deletion and token revocation; and restoring within the existing deletion window. Verify web/Android and older iOS binaries never show the button. Use manual App Store release to hold the reviewed binary until launch.

The local production-backed visual preview uses an ignored Vite configuration under `.context/` to display the button in a browser. That override is not part of the PR and cannot perform the native Apple sheet in a web browser.
