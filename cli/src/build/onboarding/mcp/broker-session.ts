// src/build/onboarding/mcp/broker-session.ts
//
// Disk-persisted, broker-backed Google sign-in session for the MCP onboarding. Wraps the broker HTTP client
// (broker-oauth.ts) and stores the in-flight session handle in the on-disk Android onboarding progress, so a
// poll survives the MCP server process restarting between tool calls (the old in-memory loopback registry
// could not). MCP-only — the interactive TUI keeps its own loopback flow.
import { createBrokerSession, pollBrokerSession } from './broker-oauth.js'
import { loadAndroidProgress, saveAndroidProgress } from '../android/progress.js'

export interface BrokerSessionState {
  status: 'absent' | 'pending' | 'awaiting_code' | 'done' | 'error'
  /** The Google sign-in URL the user opens — present once a session exists. */
  signInUrl?: string
  /** Short-lived Google access token, only on 'done'. */
  accessToken?: string
  /** Epoch ms the access token expires, on 'done'. */
  expiresAt?: number | null
  /** Human-readable failure reason for 'awaiting_code' (wrong code) / 'error'. */
  error?: string
}

/** Create a broker sign-in session for `appId`, persist its handle, and return the URL to show the user. */
export async function brokerBegin(appId: string, baseDir?: string): Promise<{ signInUrl: string }> {
  const created = await createBrokerSession(appId)
  const progress = await loadAndroidProgress(appId, baseDir)
  if (!progress)
    throw new Error('Onboarding progress is missing — restart the Capgo Builder setup.')
  progress._brokerOAuth = { pubId: created.pubId, pollSecret: created.pollSecret, signInUrl: created.signInUrl, expiresAt: created.expiresAt }
  await saveAndroidProgress(appId, progress, baseDir)
  return { signInUrl: created.signInUrl }
}

/** Poll the persisted broker session. Pass `confirmCode` (the code the user read off the page) to release the token. */
export async function brokerPoll(appId: string, confirmCode?: string, baseDir?: string): Promise<BrokerSessionState> {
  const progress = await loadAndroidProgress(appId, baseDir)
  const handle = progress?._brokerOAuth
  if (!handle)
    return { status: 'absent' }
  const res = await pollBrokerSession({ pubId: handle.pubId, pollSecret: handle.pollSecret }, confirmCode)
  switch (res.status) {
    case 'done':
      return { status: 'done', signInUrl: handle.signInUrl, accessToken: res.accessToken, expiresAt: res.expiresAt }
    case 'awaiting_code':
      return { status: 'awaiting_code', signInUrl: handle.signInUrl, error: res.error }
    case 'error':
      return { status: 'error', signInUrl: handle.signInUrl, error: res.error }
    default:
      return { status: 'pending', signInUrl: handle.signInUrl }
  }
}

/** Drop the in-flight broker session handle (reopen / error recovery). */
export async function brokerClear(appId: string, baseDir?: string): Promise<void> {
  const progress = await loadAndroidProgress(appId, baseDir)
  if (progress?._brokerOAuth) {
    delete progress._brokerOAuth
    await saveAndroidProgress(appId, progress, baseDir)
  }
}
