import { homedir } from 'node:os'
import { join } from 'node:path'
import { readSafeFile, writeFileAtomic } from '../utils/safeWrites'

export const builderPromptStatePath: string = join(homedir(), '.capgo-builder-prompt.json')

interface SnoozeEntry {
  snoozedUntil: string
}
type BuilderPromptState = Record<string, SnoozeEntry>

const DAY_MS = 24 * 60 * 60 * 1000

async function readState(path: string): Promise<BuilderPromptState> {
  try {
    const parsed = JSON.parse(await readSafeFile(path)) as unknown
    if (parsed && typeof parsed === 'object')
      return parsed as BuilderPromptState
    return {}
  }
  catch {
    return {}
  }
}

export async function isBuilderPromptSnoozed(appId: string, now: Date, path: string = builderPromptStatePath): Promise<boolean> {
  const entry = (await readState(path))[appId]
  if (!entry?.snoozedUntil)
    return false
  const until = Date.parse(entry.snoozedUntil)
  return Number.isFinite(until) && now.getTime() < until
}

export async function snoozeBuilderPrompt(appId: string, days: number, now: Date, path: string = builderPromptStatePath): Promise<void> {
  const state = await readState(path)
  const snoozedUntil = new Date(now.getTime() + days * DAY_MS).toISOString()
  const next: BuilderPromptState = { ...state, [appId]: { snoozedUntil } }
  await writeFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
}
