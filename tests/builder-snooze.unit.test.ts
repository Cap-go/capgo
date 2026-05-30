import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isBuilderPromptSnoozed, snoozeBuilderPrompt } from '../cli/src/bundle/builder-snooze.ts'

let dir: string
let statePath: string
const now = new Date('2026-05-30T00:00:00.000Z')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'capgo-snooze-'))
  statePath = join(dir, 'builder-prompt.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('builder snooze', () => {
  it('reports not snoozed when no state file exists', async () => {
    expect(await isBuilderPromptSnoozed('com.app', now, join(dir, 'missing.json'))).toBe(false)
  })

  it('honors a snooze within the window and expires it after', async () => {
    await snoozeBuilderPrompt('com.app', 3, now, statePath)
    const twoDaysLater = new Date(now.getTime() + 2 * 86400_000)
    const fourDaysLater = new Date(now.getTime() + 4 * 86400_000)
    expect(await isBuilderPromptSnoozed('com.app', twoDaysLater, statePath)).toBe(true)
    expect(await isBuilderPromptSnoozed('com.app', fourDaysLater, statePath)).toBe(false)
  })

  it('is per-app (snoozing one app does not snooze another)', async () => {
    await snoozeBuilderPrompt('com.app.a', 3, now, statePath)
    expect(await isBuilderPromptSnoozed('com.app.a', now, statePath)).toBe(true)
    expect(await isBuilderPromptSnoozed('com.app.b', now, statePath)).toBe(false)
  })

  it('treats a corrupt state file as not snoozed', async () => {
    const p = join(dir, 'corrupt.json')
    writeFileSync(p, '{ not json')
    expect(await isBuilderPromptSnoozed('com.app', now, p)).toBe(false)
  })
})
