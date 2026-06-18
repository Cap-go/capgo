// src/schemas/onboarding.ts
// Input schema for the guided Capgo Builder onboarding `next_step` MCP tool.
// Shared so the runtime validation and the handler's TS type stay in sync.
import { z } from 'zod'

export const onboardingNextStepSchema = z.object({
  platform: z.enum(['ios', 'android']).optional().describe('Platform choice, when the previous step asked for it'),
  serviceAccountJsonPath: z.string().optional().describe('Path to your Google Play service-account JSON file, when the previous step asked for it'),
  runBuild: z.boolean().optional().describe('Set false (with platform) to SKIP the first cloud build and finish onboarding. The build itself is run with the start_capgo_build tool, not here — passing true is rejected with a pointer to start_capgo_build.'),
  keyId: z.string().optional().describe('App Store Connect Key ID (iOS), when asked'),
  issuerId: z.string().optional().describe('App Store Connect Issuer ID (iOS), when asked'),
  p8Path: z.string().optional().describe('Path to your App Store Connect .p8 key file (iOS), when asked'),
  serviceAccountMethod: z.enum(['generate', 'existing']).optional().describe('Android service-account setup method: "generate" (via Google sign-in) or "existing" (your own JSON), when the step asks you to choose'),
  playDeveloperId: z.string().optional().describe('Your Google Play Console developer ID or Play Console URL (Android OAuth), when asked'),
  gcpProjectId: z.string().optional().describe('Google Cloud project id to host the service account, or "__new__" to create one, when choosing'),
  gcpProjectName: z.string().optional().describe('Display name for a new Google Cloud project, when creating one'),
  androidPackage: z.string().optional().describe('The Android applicationId / package name to grant release access to, when asked'),
  androidVerifyAction: z.enum(['open', 'recheck', 'cancel']).optional().describe('Answer to the Android verify-app gate (android-app-verify) when the chosen package does not yet exist in Play Console: "open" to surface the Play Console create-app page, "recheck" to re-run the apps:search check after creating it, or "cancel" to stop'),
  saMethodChoice: z.enum(['retry', 'save-anyway', 'oauth']).optional().describe('Recovery choice at service-account validation failure'),
  reopenSignIn: z.boolean().optional().describe('Set true at the Google sign-in step to (re)open the browser for a fresh Google authorization — use this when the browser did not open, was closed, or the sign-in stalled on "still waiting", so the user is never stuck'),
  openSignInBrowser: z.boolean().optional().describe('At the Google sign-in step: set true to have the assistant open the sign-in link in the user\'s browser for them; set false (or omit) when the user will open the shown link themselves. The link is always returned in the step result either way.'),
  confirmCode: z.string().optional().describe('The confirmation code shown on the Google sign-in success page (e.g. "ABCD-2345"), read back by the user — provide it at the Google sign-in step to finish connecting their Google account. Required to complete sign-in via the MCP.'),
  checkBuild: z.boolean().optional().describe('Set true to record a finished cloud build and continue setup — call it only after start_capgo_build / capgo_build_wait reports the build completed.'),
  resumeChoice: z.enum(['continue', 'restart']).optional().describe('Answer to the resume prompt shown when an in-progress onboarding for the chosen platform already exists: "continue" picks up from the saved step, "restart" wipes the saved onboarding progress for that platform and begins again'),
  credentialsExistChoice: z.enum(['backup', 'cancel']).optional().describe('Data-safety choice when saved Android credentials already exist: "backup" (back them up, then continue) or "cancel" (stop onboarding), when the step asks'),
  keystoreMethod: z.enum(['existing', 'generate']).optional().describe('Whether you already have an Android keystore ("existing") or want one created ("generate")'),
  keystorePath: z.string().optional().describe('Absolute path to your existing Android keystore file (.jks/.keystore/.p12), when asked'),
  keystoreStorePassword: z.string().optional().describe('The keystore store password, when asked'),
  keystoreAlias: z.string().optional().describe('The key alias inside the keystore, when asked or when multiple are found'),
  keystoreKeyPassword: z.string().optional().describe('The key password (leave blank to match the store password), when asked'),
  keystoreNewAlias: z.string().optional().describe('Alias for a newly generated keystore (default "release"), when generating'),
  keystorePasswordMethod: z.enum(['random', 'manual']).optional().describe('For a new keystore: generate a random password or set your own'),
  keystoreCommonName: z.string().optional().describe('Certificate Common Name for a new keystore (defaults to the app id)'),
  verifyAction: z.enum(['pick', 'create-new', 'autofix', 'continue', 'recheck', 'open', 'reopen', 'back', 'cancel']).optional().describe('Answer to the iOS verify-app gate: "pick" an existing App Store app (with verifyAppId), "create-new" when the build id is correct and no app matches, "autofix" to rewrite the Xcode bundle id, "continue"/"recheck" to re-check after a manual fix, "open"/"reopen" to (re)surface the App Store Connect create-app page, "back" to return to the app picker, or "cancel" to stop'),
  verifyAppId: z.string().optional().describe('The bundle id of the App Store app picked at the iOS verify-app step — only together with verifyAction "pick"'),
  certToRevoke: z.string().optional().describe('Answer to the iOS cert-limit-prompt: the Apple resource id of the Distribution certificate to revoke (frees a slot so a new one can be created), or "__exit__" to stop'),
  duplicateProfileAction: z.enum(['delete', 'exit']).optional().describe('Answer to the iOS duplicate-profile-prompt: "delete" removes the duplicate Capgo provisioning profile(s) and recreates a fresh one, "exit" stops onboarding'),
  errorAction: z.enum(['retry', 'restart', 'exit', 'email-support']).optional().describe('Answer to the iOS error recovery screen: "retry" re-runs the failing step, "restart" wipes onboarding progress and starts over, "exit" stops here, "email-support" returns instructions for contacting Capgo support'),
  // ── Post-build tail (CI secrets / GitHub Actions / .env export / workflow) ──
  // One field per step FAMILY; the engine's strict tail gate enforces the
  // per-step vocabulary (e.g. ciSecretAction "confirm"/"cancel" only at
  // confirm-secrets-push) and one-answer-per-call.
  ciSecretAction: z.enum(['github', 'gitlab', 'skip', 'yes', 'no', 'replace', 'retry', 'continue', 'confirm', 'cancel']).optional().describe('Answer to the post-build CI-secrets steps — the allowed values per step: ci-secrets-target-select "github"/"gitlab"/"skip"; ask-ci-secrets "yes"/"no"; confirm-ci-secret-overwrite "replace"/"skip"; confirm-secrets-push "confirm"/"cancel"; ci-secrets-setup "retry"/"skip"; ci-secrets-failed "retry"/"continue"'),
  githubActionsSetup: z.enum(['with-workflow', 'secrets-only', 'no']).optional().describe('Answer to ask-github-actions-setup: "with-workflow" pushes the secrets AND writes a workflow file, "secrets-only" pushes only the secrets, "no" declines (offers a local .env export instead)'),
  exportEnvAction: z.enum(['yes', 'no', 'replace', 'skip']).optional().describe('Answer to the .env export steps: ask-export-env "yes" (optionally with envExportPath)/"no"; confirm-env-export-overwrite "replace"/"skip"'),
  envExportPath: z.string().optional().describe('Custom target path for the exported .env file — only together with exportEnvAction "yes" (defaults to the path shown in the prompt)'),
  packageManager: z.enum(['bun', 'npm', 'pnpm', 'yarn']).optional().describe('Answer to pick-package-manager: the package manager the generated workflow should install with'),
  buildScript: z.string().optional().describe('Answer to pick-build-script: a script name from the listed options, "__custom__" to type a custom command, or "__skip__" when the app needs no build step'),
  buildScriptCustom: z.string().optional().describe('Answer to pick-build-script-custom: the exact custom command the workflow runs to build the web assets (e.g. "make web")'),
  workflowFileAction: z.enum(['write', 'view', 'cancel']).optional().describe('Answer to preview-workflow-file: "write" writes the workflow file, "view" returns the proposed file content (and re-asks), "cancel" skips writing it'),
  // ── iOS import-existing fork (S12: setup-method-select + the import sub-flow) ──
  // One field per step; the engine's strict iOS gate enforces the per-step
  // vocabulary and one-answer-per-call against the parked/resume step.
  setupMethod: z.enum(['create-new', 'import-existing']).optional().describe('Answer to the iOS setup-method-select fork: "create-new" mints a fresh certificate + profile via the App Store Connect API; "import-existing" reuses a distribution certificate + provisioning profile already on this Mac (Keychain + Xcode profiles, macOS only)'),
  importDistribution: z.enum(['app_store', 'ad_hoc', '__cancel__']).optional().describe('Answer to iOS import-distribution-mode: "app_store" (TestFlight upload, needs an ASC API key), "ad_hoc" (direct/QR install, no ASC key), or "__cancel__" to switch to the create-new path'),
  identityChoice: z.string().optional().describe('Answer to iOS import-pick-identity: the chosen signing identity\'s SHA-1 (one of the listed option values), or "__cancel__" to switch to creating a fresh certificate'),
  profileChoice: z.string().optional().describe('Answer to iOS import-pick-profile: the chosen provisioning profile\'s UUID (one of the listed option values), or "__back__" to return to identity selection'),
  importRecoveryAction: z.enum(['create', 'provide-profile-path', 'browser', 'back']).optional().describe('Answer to iOS import-no-match-recovery: "create" makes a fresh App Store profile for the chosen certificate via Apple, "provide-profile-path" supplies a .mobileprovision file path, "browser" explains the manual Apple Developer Portal route, "back" returns to identity selection'),
  portalAction: z.enum(['use-create', 'open-anyway', 'use-file', 'back']).optional().describe('Answer to iOS import-portal-explanation: "use-create" creates the profile automatically (recommended), "use-file" provides a downloaded .mobileprovision path, "open-anyway"/"back" return to the recovery menu (the portal URL is in the result context — the server never opens a browser)'),
  profilePath: z.string().optional().describe('Absolute path to a .mobileprovision file — answers iOS import-provide-profile-path, when asked'),
  exportConfirm: z.enum(['go', 'back', 'exit']).optional().describe('Answer to iOS import-export-warning: "go" exports the certificate from the macOS Keychain now (the user must approve the one Keychain permission dialog — tell them to click "Always Allow"), "back" returns to profile selection, "exit" stops onboarding'),
})

export type OnboardingNextStepInput = z.infer<typeof onboardingNextStepSchema>
