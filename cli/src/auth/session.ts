import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import process from 'node:process'
import { createSupabaseClient, findSavedKeySilent, resolveUserIdFromApiKey, sendEvent } from '../utils'
import { appendToSafeFile, writeFileAtomic } from '../utils/safeWrites'

/**
 * Shared, UI-free authentication core.
 *
 * `cli/src/login.ts` (the interactive `capgo login` command) and the MCP login
 * tools (`capgo_login` / `capgo_whoami` / `capgo_logout`) all funnel through these
 * helpers so there is a single validate / persist / introspect path — no forked
 * security logic.
 */

export type KeySource = 'env' | 'global' | 'local'

export interface LoginState {
  loggedIn: boolean
  /** Resolved user id — only populated when `validate` was requested and the key is valid. */
  userId?: string
  /** Where the saved key was found, if any (even when it failed validation). */
  source?: KeySource
}

export interface SaveKeyOptions {
  /** Persist to `./.capgo` (project-local) instead of `~/.capgo` (global). */
  local?: boolean
  supaHost?: string
  supaAnon?: string
}

const globalKeyPath = () => `${homedir()}/.capgo`
const LOCAL_KEY_PATH = '.capgo'

/** Which source `findSavedKeySilent()` would resolve a key from, in precedence order. */
function detectSource(): KeySource | undefined {
  if (process.env.CAPGO_TOKEN?.trim())
    return 'env'
  if (existsSync(globalKeyPath()))
    return 'global'
  if (existsSync(LOCAL_KEY_PATH))
    return 'local'
  return undefined
}

/**
 * Validate an API key against Capgo and, if valid, persist it (0o600).
 * Returns the resolved user id. Throws on a missing/invalid key or a disallowed
 * local write (local requires a git repository, mirroring `capgo login --local`).
 *
 * Nothing is written when validation fails.
 */
export async function validateAndSaveKey(apikey: string, options: SaveKeyOptions = {}): Promise<{ userId: string }> {
  if (!apikey)
    throw new Error('Missing API key')

  const local = options.local ?? false
  if (local && !existsSync('.git'))
    throw new Error('To save a project-local key you must be inside a git repository')

  // Validate BEFORE writing so an invalid key never lands on disk.
  const supabase = await createSupabaseClient(apikey, options.supaHost, options.supaAnon, true)
  const userId = await resolveUserIdFromApiKey(supabase, apikey, true)

  if (local) {
    await writeFileAtomic(LOCAL_KEY_PATH, `${apikey}\n`, { mode: 0o600 })
    await appendToSafeFile('.gitignore', '.capgo\n', 0o600)
  }
  else {
    await writeFileAtomic(globalKeyPath(), `${apikey}\n`, { mode: 0o600 })
  }

  await sendEvent(apikey, {
    channel: 'user-login',
    event: 'User CLI login',
    icon: '✅',
    tracking_version: 2,
    notify: false,
  }).catch(() => {})

  return { userId }
}

/**
 * Report whether a saved key exists.
 *
 * Presence-only by default (no network) so it is cheap enough to gate every tool
 * call. Pass `{ validate: true }` (used by `capgo_whoami`) to additionally confirm
 * the key still authenticates and resolve the user id.
 */
export async function getLoginState(options: { validate?: boolean } = {}): Promise<LoginState> {
  const key = findSavedKeySilent()
  const source = detectSource()
  if (!key)
    return { loggedIn: false }

  if (!options.validate)
    return { loggedIn: true, source }

  try {
    const supabase = await createSupabaseClient(key, undefined, undefined, true)
    const userId = await resolveUserIdFromApiKey(supabase, key, true)
    return { loggedIn: true, userId, source }
  }
  catch {
    // A key is on disk but no longer valid (revoked/expired).
    return { loggedIn: false, source }
  }
}

/**
 * Remove the saved key. Clears the global key (`~/.capgo`) by default, or the
 * project-local key (`./.capgo`) when `local` is set. Never touches `CAPGO_TOKEN`
 * (an env var is not ours to unset). Returns whether a file was actually removed.
 */
export async function clearSavedKey(options: { local?: boolean } = {}): Promise<{ cleared: boolean }> {
  const path = options.local ? LOCAL_KEY_PATH : globalKeyPath()
  if (!existsSync(path))
    return { cleared: false }
  await rm(path, { force: true })
  return { cleared: true }
}
