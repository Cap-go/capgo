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

export interface SaveFilePickerOptions {
  prompt: string
  defaultName?: string
  defaultLocation?: string
}

/**
 * Open the macOS native "Save As…" dialog. Returns the chosen path, or null if
 * the user cancelled. macOS prompts for overwrite confirmation natively, so
 * callers do not need to re-confirm.
 */
export function openSaveFilePicker(opts: SaveFilePickerOptions): Promise<string | null> {
  const escape = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  let script = `POSIX path of (choose file name with prompt "${escape(opts.prompt)}"`
  if (opts.defaultName)
    script += ` default name "${escape(opts.defaultName)}"`
  if (opts.defaultLocation)
    script += ` default location (POSIX file "${escape(opts.defaultLocation)}")`
  script += ')'
  return openMacFilePicker(script)
}

/**
 * Open the macOS native file picker filtered to Android keystore files.
 * Accepts .jks, .keystore, and .p12 extensions.
 */
export function openKeystorePicker(): Promise<string | null> {
  return openMacFilePicker(
    'POSIX path of (choose file of type {"jks", "keystore", "p12"} with prompt "Select your Android keystore")',
  )
}

/**
 * Open the macOS native file picker filtered to .mobileprovision files.
 * Returns the selected path, or null if the user cancelled.
 *
 * Used by the no-match-recovery "Use a .mobileprovision file from disk"
 * option — covers users who have a profile downloaded somewhere outside
 * Xcode's standard provisioning-profile directories (e.g. a downloads
 * folder, an artifact from another machine, a shared team archive).
 */
export function openMobileprovisionPicker(): Promise<string | null> {
  return openMacFilePicker(
    'POSIX path of (choose file of type {"mobileprovision"} with prompt "Select your .mobileprovision file")',
  )
}

/**
 * Open the macOS native file picker filtered to Google Play service account
 * JSON files. Used by the Android onboarding "import existing SA" path.
 *
 * Uses the official `public.json` Uniform Type Identifier rather than the raw
 * `"json"` extension hint — AppleScript treats unrecognized strings as 4-char
 * OSType codes, and the legacy OSType code for `"json"` does not match real
 * `.json` files, which makes the dialog grey them all out.
 */
export function openServiceAccountJsonPicker(): Promise<string | null> {
  return openMacFilePicker(
    'POSIX path of (choose file of type {"public.json"} with prompt "Select your Google Play service account JSON")',
  )
}
