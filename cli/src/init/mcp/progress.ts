// src/init/mcp/progress.ts
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const found = readdirSync(tmp.tmpdir)
    .map(name => ({ name, full: `${tmp.tmpdir}/${name}` }))
    .find(obj => obj.name.startsWith('capgocli'))
  tmpPath = found?.full ?? tmp.fileSync({ prefix: 'capgocli' }).name
  return tmpPath
}

export function loadLiveUpdateProgress(): LiveUpdateProgress | null {
  try {
    const raw = readFileSync(ensureTmpPath(), 'utf8')
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as LiveUpdateProgress
    if (typeof parsed.step_done !== 'number')
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
