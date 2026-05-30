import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isBuilderPromptSnoozed, snoozeBuilderPrompt } from '../cli/src/bundle/builder-snooze.ts'

const now = new Date('2026-05-30T00:00:00.000Z')
const DAY = 86_400_000

// Each test gets its own isolated temp dir so the cases run concurrently without
// sharing mutable state (the snooze helpers take an injectable path).
function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'capgo-snooze-'))
}

describe('builder snooze', () => {
  it.concurrent('reports not snoozed when no state file exists', async () => {
    const dir = makeTempDir()
    try {
      expect(await isBuilderPromptSnoozed('com.app', now, join(dir, 'missing.json'))).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.concurrent('honors a snooze within the window and expires it after', async () => {
    const dir = makeTempDir()
    const path = join(dir, 'builder-prompt.json')
    try {
      await snoozeBuilderPrompt('com.app', 3, now, path)
      expect(await isBuilderPromptSnoozed('com.app', new Date(now.getTime() + 2 * DAY), path)).toBe(true)
      expect(await isBuilderPromptSnoozed('com.app', new Date(now.getTime() + 4 * DAY), path)).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.concurrent('is per-app (snoozing one app does not snooze another)', async () => {
    const dir = makeTempDir()
    const path = join(dir, 'builder-prompt.json')
    try {
      await snoozeBuilderPrompt('com.app.a', 3, now, path)
      expect(await isBuilderPromptSnoozed('com.app.a', now, path)).toBe(true)
      expect(await isBuilderPromptSnoozed('com.app.b', now, path)).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.concurrent('treats a corrupt state file as not snoozed', async () => {
    const dir = makeTempDir()
    const path = join(dir, 'corrupt.json')
    try {
      writeFileSync(path, '{ not json')
      expect(await isBuilderPromptSnoozed('com.app', now, path)).toBe(false)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
