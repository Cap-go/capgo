// src/schemas/onboarding.ts
// Input schema for the guided Capgo Builder onboarding `next_step` MCP tool.
// Shared so the runtime validation and the handler's TS type stay in sync.
import { z } from 'zod'

export const onboardingNextStepSchema = z.object({
  platform: z.enum(['ios', 'android']).optional().describe('Platform choice, when the previous step asked for it'),
  serviceAccountJsonPath: z.string().optional().describe('Path to your Google Play service-account JSON file, when the previous step asked for it'),
  runBuild: z.boolean().optional().describe('Set true (with platform) to trigger the first cloud build; set false to skip it and finish onboarding'),
  keyId: z.string().optional().describe('App Store Connect Key ID (iOS), when asked'),
  issuerId: z.string().optional().describe('App Store Connect Issuer ID (iOS), when asked'),
  p8Path: z.string().optional().describe('Path to your App Store Connect .p8 key file (iOS), when asked'),
  serviceAccountMethod: z.enum(['generate', 'existing']).optional().describe('Android service-account setup method: "generate" (via Google sign-in) or "existing" (your own JSON), when the step asks you to choose'),
  playDeveloperId: z.string().optional().describe('Your Google Play Console developer ID or Play Console URL (Android OAuth), when asked'),
  gcpProjectId: z.string().optional().describe('Google Cloud project id to host the service account, or "__new__" to create one, when choosing'),
  gcpProjectName: z.string().optional().describe('Display name for a new Google Cloud project, when creating one'),
  androidPackage: z.string().optional().describe('The Android applicationId / package name to grant release access to, when asked'),
  saMethodChoice: z.enum(['retry', 'save-anyway', 'oauth']).optional().describe('Recovery choice at service-account validation failure'),
  checkBuild: z.boolean().optional().describe('Set true after running the build command, to read the build output record and confirm the result'),
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
})

export type OnboardingNextStepInput = z.infer<typeof onboardingNextStepSchema>
