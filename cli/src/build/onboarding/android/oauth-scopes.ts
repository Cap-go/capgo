// src/build/onboarding/android/oauth-scopes.ts
import { GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER } from './oauth-google.js'

/** OAuth scopes for Capgo Android onboarding — androidpublisher (Play) plus
 *  cloud-platform (create GCP projects / service accounts / keys). Shared by the
 *  Ink wizard and the MCP bridge so the two drivers can never drift. */
export const OAUTH_SCOPES_FOR_ONBOARDING = [
  ...GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER,
  'https://www.googleapis.com/auth/cloud-platform',
] as const
