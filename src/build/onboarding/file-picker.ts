// src/build/onboarding/file-picker.ts
import { execFile } from 'node:child_process'
import { basename } from 'node:path'
import { platform } from 'node:process'

function openMacFilePicker(script: string): Promise<string | null> {
  if (!canUseFilePicker())
    return Promise.resolve(null)

  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', script],
      { encoding: 'utf-8', timeout: 120000 },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        const path = stdout.trim()
        resolve(path || null)
      },
    )
  })
}

/**
 * Returns true if we're on macOS and can use the native file picker.
 */
export function canUseFilePicker(): boolean {
  return platform === 'darwin'
}

/**
 * Open the macOS native file picker dialog filtered to .p8 files.
 * Returns the selected file path, or null if the user cancelled.
 * Non-blocking — uses async execFile so Ink spinners keep animating.
 */
export function openFilePicker(): Promise<string | null> {
  return openMacFilePicker('POSIX path of (choose file of type {"p8"} with prompt "Select your .p8 API key file")')
}

export function openPackageJsonPicker(): Promise<string | null> {
  return openMacFilePicker('POSIX path of (choose file with prompt "Select your package.json file")')
    .then((selectedPath) => {
      if (!selectedPath)
        return null
      return basename(selectedPath).toLowerCase() === 'package.json' ? selectedPath : null
    })
}
