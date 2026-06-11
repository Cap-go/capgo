// cli/src/support/clipboard.ts
import { spawnSync } from 'node:child_process'

interface ClipboardCandidate {
  cmd: string
  args: string[]
}

export function copyToClipboard(text: string): { ok: boolean, method?: string } {
  const osPlatform = process.platform
  const candidates: ClipboardCandidate[] = []
  if (osPlatform === 'darwin') {
    candidates.push({ cmd: 'pbcopy', args: [] })
  }
  else if (osPlatform === 'win32') {
    candidates.push({ cmd: 'clip', args: [] })
  }
  else {
    candidates.push({ cmd: 'wl-copy', args: [] })
    candidates.push({ cmd: 'xclip', args: ['-selection', 'clipboard'] })
    candidates.push({ cmd: 'xsel', args: ['--clipboard', '--input'] })
  }
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate.cmd, candidate.args, { input: text })
      if (result.error)
        continue
      if (result.status === 0)
        return { ok: true, method: candidate.cmd }
    }
    catch {
      // Try next candidate.
    }
  }
  return { ok: false }
}

// macOS only: select the file in Finder so it's a one-drag attach. Best-effort.
export function revealInFinder(filePath: string): boolean {
  if (process.platform !== 'darwin')
    return false
  try {
    const result = spawnSync('open', ['-R', filePath])
    return !result.error && result.status === 0
  }
  catch {
    return false
  }
}
