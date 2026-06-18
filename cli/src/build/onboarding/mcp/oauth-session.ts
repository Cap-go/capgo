// src/build/onboarding/mcp/oauth-session.ts
//
// Module-level pending-session registry for the MCP fire-and-poll OAuth model.
//
// The MCP server process is long-lived; Google sign-in is started on one tool
// call (browser opens) and collected on a later "continue" call. This registry
// tracks the in-flight session per appId so the bridge can check status without
// blocking a single MCP tool call on the full OAuth round-trip.
//
// Lifecycle per appId:
//   beginOAuthSession(appId, start)
//     → clears any prior entry
//     → calls start() to get the PendingOAuthSession
//     → stores { session, status:'pending' }
//     → a detached async task awaits the result so status advances to 'done'/'error'
//
//   pollOAuthSession(appId)
//     → returns { status, tokens?, error? }  or  { status: 'absent' }
//
//   clearOAuthSession(appId)
//     → calls session.close() and deletes the entry

import type { GoogleOAuthTokens } from '../android/oauth-google.js'
import type { PendingOAuthSession } from '../android/oauth-google.js'

// Re-export so callers can reference the type without importing oauth-google
export type { PendingOAuthSession }

interface OAuthSessionEntry {
  /** Absent when begin() itself failed before a real session was created. */
  session?: PendingOAuthSession
  status: 'pending' | 'done' | 'error'
  tokens?: GoogleOAuthTokens
  error?: Error
}

const registry = new Map<string, OAuthSessionEntry>()

/**
 * Start a new OAuth session for `appId`, replacing any existing one.
 *
 * `start` is a factory that returns a `PendingOAuthSession` (e.g.
 * `() => startOAuthFlow(config, options)`). Passing a factory rather than the
 * session directly lets the caller defer construction until after the prior
 * session has been cleaned up.
 */
export async function beginOAuthSession(
  appId: string,
  start: () => Promise<PendingOAuthSession>,
): Promise<void> {
  // Evict any prior session for this appId (safe even if status is 'done').
  clearOAuthSession(appId)

  let session: PendingOAuthSession
  try {
    session = await start()
  }
  catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    // Record the error so pollOAuthSession returns { status: 'error' } instead
    // of 'absent'. No real session was created, so `session` is omitted.
    registry.set(appId, { status: 'error', error })
    // Re-throw so the caller still knows begin() failed.
    throw err
  }

  const entry: OAuthSessionEntry = { session, status: 'pending' }
  registry.set(appId, entry)

  // Advance the status when the result settles (this does NOT block the caller —
  // a detached async task per the repo's async/await-over-.then() convention).
  void (async () => {
    try {
      const tokens = await session.result
      entry.status = 'done'
      entry.tokens = tokens
    }
    catch (err: unknown) {
      entry.status = 'error'
      entry.error = err instanceof Error ? err : new Error(String(err))
    }
  })()
}

/**
 * Poll the current status for `appId`.
 *
 * Returns `{ status: 'absent' }` when no session has been started or the
 * entry has been cleared. Otherwise returns the entry's current
 * `status`/`tokens`/`error`.
 */
export function pollOAuthSession(appId: string): {
  status: 'pending' | 'done' | 'error' | 'absent'
  tokens?: GoogleOAuthTokens
  error?: Error
} {
  const entry = registry.get(appId)
  if (!entry)
    return { status: 'absent' }
  return { status: entry.status, tokens: entry.tokens, error: entry.error }
}

/**
 * Close and remove the session entry for `appId`. Safe to call on an absent
 * appId or after the result has already settled.
 */
export function clearOAuthSession(appId: string): void {
  const entry = registry.get(appId)
  if (entry) {
    entry.session?.close?.()
    registry.delete(appId)
  }
}
