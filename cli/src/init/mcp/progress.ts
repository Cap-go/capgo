// src/init/mcp/progress.ts
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import tmp from 'tmp'

export interface LiveUpdateProgress {
  step_done: number
  appId?: string
  channelName?: string
  platform?: 'ios' | 'android'
  currentVersion?: string
  delta?: boolean
  encryptionEnabled?: boolean
}

let tmpPath: string | undefined

function ensureTmpPath(): string {
  if (tmpPath)
    return tmpPath
  tmpPath = join(tmp.tmpdir, 'capgocli-live-update-progress.json')
  return tmpPath
}

export function loadLiveUpdateProgress(): LiveUpdateProgress | null {
  try {
    const raw = readFileSync(ensureTmpPath(), 'utf8')
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as LiveUpdateProgress
    if (!Number.isInteger(parsed.step_done) || parsed.step_done < 0)
      return null
    return parsed
  }
  catch {
    return null
  }
}

export function saveLiveUpdateProgress(data: LiveUpdateProgress): void {
  writeFileSync(ensureTmpPath(), JSON.stringify(data))
}

export function clearLiveUpdateProgress(): void {
  if (!tmpPath)
    return
  try {
    rmSync(tmpPath)
  }
  catch {
    // ignore
  }
  tmpPath = undefined
}
