// src/build/onboarding/mcp/explanations.ts
// Plain-language, read-only explanations for onboarding steps. Surfaced by the
// capgo_builder_onboarding_explain tool when the user is confused. No engine
// dependencies — pure data + a lookup with a generic fallback.
//
// COVERAGE: every USER-FACING state (decision / input / gate) has an entry.
// AUTO/TRANSIENT states (spinners + internal transitions: *-running, *-loading,
// *-generating, *-validating, *-detecting-*, welcome, backing-up, *-guard, error,
// build-complete, requesting-build, writing-workflow-file, exporting-env,
// overwrite-and-export-env, uploading-ci-secrets, checking-ci-secrets,
// google-sign-in-running, saving-credentials, credentials-exist) intentionally
// have NO bespoke entry and resolve to FALLBACK — a user does not ask to
// "explain" a spinner. Some wording may be refined later when tests expand.

const FALLBACK = [
  'This step is part of setting up Capgo Builder so your app can be built in the cloud.',
  'If you tell me which part is unclear (the question, the options, or what to do next), I can explain it in more detail.',
].join(' ')

/** state → multi-line plain-language explanation (WHAT · WHY · OPTIONS · WHAT TO DO). */
export const EXPLANATIONS: Record<string, string> = {
  // ── Preflight ──────────────────────────────────────────────────────────────
  'no-capacitor-project': 'WHAT: We could not find a Capacitor app in this folder.\nWHY: Capgo Builder configures native iOS/Android builds for a Capacitor project, so it needs one here.\nWHAT TO DO: Run this in your app folder, or set up Capacitor first (npx cap init), then start again.',
  'login-required': 'WHAT: You need to be logged into Capgo before we can set up cloud builds.\nWHY: Capgo stores your build credentials against your account.\nWHAT TO DO: Get an API key from app.capgo.io (Account → API keys) and run `npx @capgo/cli login` in your terminal. Do not paste the key into chat.',
  'no-platform': 'WHAT: Your project does not have a native platform folder yet (ios/ or android/).\nWHY: Builds are produced from the native project, so one must exist.\nWHAT TO DO: Add one with `npx cap add android` or `npx cap add ios`, then continue.',
  'register-app-failed': 'WHAT: Registering your app in Capgo did not succeed.\nWHY: We register the app id so the cloud knows where to attach builds and credentials.\nWHAT TO DO: Check the error shown, confirm you are logged in, and retry.',
  'app-id-conflict': 'WHAT: The app id already exists and is not in your account.\nWHY: App ids are globally unique in Capgo.\nWHAT TO DO: Choose a different app id in your capacitor config, then continue.',
  // ── Platform ───────────────────────────────────────────────────────────────
  'platform-select': 'WHAT: We are choosing which app platform to set up first — iOS or Android.\nWHY: Each platform signs and ships builds differently, so Capgo configures them one at a time.\nOPTIONS: "ios" sets up Apple builds (you will create an App Store Connect API key). "android" sets up Google Play builds (mostly automatic; one Google sign-in).\nWHAT TO DO: Pick whichever you want to ship first. You can set up the other one later.',
  // ── iOS ────────────────────────────────────────────────────────────────────
  'ios-api-key': 'WHAT: We need an App Store Connect API key so Capgo can build and sign your iOS app.\nWHY: Apple requires this key to create the signing certificate and provisioning profile.\nWHAT TO DO: In App Store Connect → Users and Access → Integrations, create a key with App Manager access, download the .p8 (you can only download it once), and give me the Key ID, Issuer ID, and the path to the .p8. The .p8 stays on your machine.',
  'ios-credentials-failed': 'WHAT: Setting up the iOS signing credentials failed.\nWHY: Usually the API key details are wrong or the key lacks App Manager access.\nWHAT TO DO: Re-check the Key ID / Issuer ID / .p8 path and that the key has the right access, then retry.',
  // ── Keystore (generate) ──────────────────────────────────────────────────────
  'keystore-method-select': 'WHAT: An Android signing keystore is a file that cryptographically signs your app so Google Play knows the build really came from you.\nWHY: Every Android release must be signed with the SAME keystore. If you lose it you cannot update your app, so it matters that we set this up carefully.\nOPTIONS: "existing" — use a keystore file you already have (.jks/.keystore/.p12). "generate" — let Capgo create a fresh one for you and save it locally.\nWHAT TO DO: If this is a brand-new app, generating one is the simplest. If you have shipped before, use your existing keystore.',
  'keystore-explainer': 'WHAT: A short primer on what an Android keystore is.\nWHY: The keystore signs every release so Google Play trusts the build is really yours; it must stay the same across updates.\nWHAT TO DO: Once you understand it, choose to use an existing keystore or generate a new one.',
  'keystore-new-alias': 'WHAT: The keystore "alias" is the name of the key inside the keystore file.\nWHY: A keystore can hold multiple keys; the alias picks which one signs your app.\nWHAT TO DO: "release" is the conventional name and a fine default.',
  'keystore-new-password-method': 'WHAT: We are choosing how to set the password that protects your new keystore.\nWHY: The keystore file is encrypted with this password; you need it to sign future releases.\nOPTIONS: "random" — Capgo generates a strong password and stores it with your saved credentials so you never have to remember it (recommended). "manual" — you type your own password.\nWHAT TO DO: "random" is safest and easiest unless your team requires a specific password.',
  'keystore-new-store-password': 'WHAT: The store password locks the keystore file itself.\nWHY: It encrypts the whole keystore; you will need it for every future release.\nWHAT TO DO: Use a strong password (at least 6 characters) and keep it somewhere safe.',
  'keystore-new-key-password': 'WHAT: The key password protects the individual signing key inside the keystore.\nWHY: It can differ from the store password, but it is commonly the same.\nWHAT TO DO: Reuse the store password unless you specifically need a different one.',
  'keystore-new-cn': 'WHAT: The certificate "common name" identifies who the signing certificate belongs to.\nWHY: It is embedded in the certificate metadata; it does not affect functionality.\nWHAT TO DO: Your app id (or company/app name) is a fine value.',
  // ── Keystore (existing) ──────────────────────────────────────────────────────
  'keystore-existing-path': 'WHAT: We need the path to your existing keystore file.\nWHY: Capgo signs builds with the same keystore you already use, so we read it from disk.\nWHAT TO DO: Give the absolute path to your .jks/.keystore/.p12 file. The file stays on your machine.',
  'keystore-existing-picker': 'WHAT: We found candidate keystore files and you can pick one.\nWHY: Choosing the right file avoids signing with the wrong key.\nWHAT TO DO: Select the keystore you use for releases, or provide a path manually.',
  'keystore-existing-store-password': 'WHAT: We need the password that unlocks your existing keystore.\nWHY: We must open the keystore to read and use the signing key.\nWHAT TO DO: Provide the store password for that keystore file.',
  'keystore-existing-alias-select': 'WHAT: Your keystore holds more than one key; pick which alias signs the app.\nWHY: The alias selects the exact signing key.\nWHAT TO DO: Choose the alias you normally release with (often "release" or your app name).',
  'keystore-existing-alias': 'WHAT: Enter the alias (key name) inside your keystore.\nWHY: It selects which key signs your app.\nWHAT TO DO: Provide the alias you use for release signing.',
  'keystore-existing-key-password': 'WHAT: We need the password for the specific key (alias) inside your keystore.\nWHY: The key can have its own password separate from the store password.\nWHAT TO DO: Provide the key password (often the same as the store password).',
  // ── Service account fork ─────────────────────────────────────────────────────
  'service-account-method-select': 'WHAT: A Google Play "service account" is a special Google credential (a JSON key file) that grants Capgo permission to upload and publish builds to YOUR Google Play account on your behalf.\nWHY: Capgo needs Play access to deliver your Android builds. Without it, Capgo can build the app but cannot push it to Google Play.\nOPTIONS: "generate" (recommended) — sign in with Google once and Capgo creates and wires up the service account for you automatically. "existing" — you already have a service-account JSON file and want to use it.\nWHAT TO DO: If you are not sure, choose "generate" — it is the guided, one-sign-in path. Choose "existing" only if you already manage your own Play service account.',
  'sa-json-existing-path': 'WHAT: We need the path to your Google Play service-account JSON key file.\nWHY: That file is the credential Capgo uses to upload to Play.\nWHAT TO DO: Provide the absolute path to the .json key you downloaded from Google Cloud.',
  'sa-json-existing-picker': 'WHAT: We found candidate service-account JSON files; pick one.\nWHY: The right key must have Play upload permission for your app.\nWHAT TO DO: Choose the JSON that belongs to your Play service account, or provide a path.',
  'sa-json-validation-failed': 'WHAT: The service-account JSON you provided did not validate.\nWHY: It may be the wrong file, lack Play permissions, or be malformed.\nOPTIONS: try a different file, switch to the guided Google sign-in, or save anyway.\nWHAT TO DO: Use the guided "generate" path if you are unsure which JSON is correct.',
  'android-service-account-invalid': 'WHAT: The saved service account could not be used for Play access.\nWHY: The credential is missing required permissions or is no longer valid.\nWHAT TO DO: Re-run the service-account setup (guided Google sign-in is simplest).',
  // ── Google sign-in / Play / GCP ──────────────────────────────────────────────
  'google-sign-in': 'WHAT: We will open your browser for a Google sign-in.\nWHY: Capgo uses your one-time Google authorization to create and wire up the Play service account for you. Your tokens are used only during setup and revoked afterwards; they never reach Capgo servers.\nWHAT TO DO: Approve every requested permission in the browser, then tell me to continue.',
  'play-developer-id-input': 'WHAT: We need your Google Play developer account ID.\nWHY: The Play API cannot list your accounts, so you copy the ID from the Play Console URL.\nWHAT TO DO: Open Play Console, copy the developer ID from the URL, and paste it here.',
  'gcp-projects-select': 'WHAT: Pick which Google Cloud project to use for the service account.\nWHY: The service account and its key live inside a Google Cloud project.\nWHAT TO DO: Choose an existing project, or pick "create new" to make one for Capgo.',
  'gcp-project-create-name': 'WHAT: Name the new Google Cloud project we will create.\nWHY: Capgo provisions the service account inside this project.\nWHAT TO DO: Any clear name works (e.g. "capgo-builds").',
  'android-package-select': 'WHAT: Choose which Android package (application id) to grant Play access to.\nWHY: The service account is granted upload permission for a specific package.\nWHAT TO DO: Pick the package that matches the app you are shipping.',
  // ── Build phase ──────────────────────────────────────────────────────────────
  'build-ready': 'WHAT: Credentials are set up; you can run your first cloud build now.\nWHY: This produces a real signed build in the cloud to confirm everything works.\nWHAT TO DO: Choose to build now, or skip — onboarding still completes either way.',
  'build-run-handoff': 'WHAT: We are handing off to run the build.\nWHY: The build runs in the cloud and you can watch its progress.\nWHAT TO DO: Follow the instructions to start/track the build.',
  'build-failed': 'WHAT: The cloud build failed.\nWHY: Could be a code/build-config issue or a credentials problem.\nWHAT TO DO: Check the build log shown, fix the cause, and retry.',
  'build-appid-unsafe': 'WHAT: The app id contains characters that are unsafe to put in a shell command.\nWHY: We refuse to build with an app id that could be misinterpreted by the shell.\nWHAT TO DO: Use a normal reverse-domain app id (letters, digits, dots).',
  // ── CI secrets / GitHub Actions / env export sub-flow ────────────────────────
  'ask-ci-secrets': 'WHAT: Optionally store your build credentials as CI secrets.\nWHY: CI secrets let your pipeline build without re-entering credentials.\nWHAT TO DO: Say yes to set them up now, or skip and do it later.',
  'ci-secrets-target-select': 'WHAT: Choose where to store the CI secrets.\nWHY: Different CI providers store secrets in different places.\nWHAT TO DO: Pick your CI target (e.g. GitHub).',
  'confirm-ci-secret-overwrite': 'WHAT: A CI secret with this name already exists.\nWHY: We do not overwrite secrets without asking.\nWHAT TO DO: Confirm to overwrite, or cancel to keep the existing value.',
  'ci-secrets-failed': 'WHAT: Uploading the CI secrets failed.\nWHY: Often a permissions or token-scope issue with the CI provider.\nWHAT TO DO: Check the error, confirm your CI access, and retry.',
  'ask-github-actions-setup': 'WHAT: Optionally add a GitHub Actions workflow that builds your app.\nWHY: It automates cloud builds on push/PR.\nWHAT TO DO: Say yes to generate a workflow file, or skip.',
  'confirm-secrets-push': 'WHAT: Confirm pushing the secrets needed by the workflow.\nWHY: The workflow needs these secrets to build.\nWHAT TO DO: Confirm to proceed.',
  'ask-export-env': 'WHAT: Optionally export your credentials to a local .env file.\nWHY: Handy for local builds and scripts.\nWHAT TO DO: Say yes to write a .env, or skip.',
  'confirm-env-export-overwrite': 'WHAT: A .env file already exists.\nWHY: We do not overwrite it without asking.\nWHAT TO DO: Confirm to overwrite or cancel to keep yours.',
  'pick-package-manager': 'WHAT: Choose your package manager for the generated workflow.\nWHY: The workflow installs deps using it.\nWHAT TO DO: Pick npm/pnpm/yarn/bun to match your project.',
  'pick-build-script': 'WHAT: Choose which build script the workflow should run.\nWHY: It needs to know how to build your web assets.\nWHAT TO DO: Pick the script from your package.json (or "custom").',
  'pick-build-script-custom': 'WHAT: Enter a custom build command for the workflow.\nWHY: Your build does not match a standard script.\nWHAT TO DO: Provide the exact command to build your web assets.',
  'preview-workflow-file': 'WHAT: Review the GitHub Actions workflow file before writing it.\nWHY: So you see exactly what will be added to your repo.\nWHAT TO DO: Read it, then approve or adjust.',
  'view-workflow-diff': 'WHAT: Review the diff against your existing workflow file.\nWHY: So you do not lose existing CI configuration.\nWHAT TO DO: Review the changes, then approve.',
}

/** Return the explanation for a state, or a generic fallback for unknown states. */
export function explainForState(state: string | undefined | null): string {
  if (state && Object.prototype.hasOwnProperty.call(EXPLANATIONS, state))
    return EXPLANATIONS[state]
  return FALLBACK
}
