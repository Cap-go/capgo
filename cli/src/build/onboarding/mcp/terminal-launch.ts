import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

const pExecFile = promisify(execFile)

const defaultExec = (cmd: string, args: string[]): Promise<unknown> => pExecFile(cmd, args)

/**
 * Build the arguments array for invoking osascript to open a Terminal window
 * running `command`. Escapes backslashes first, then double-quotes, so that
 * neither character can break out of the AppleScript string literal.
 */
export function buildOsascriptArgs(command: string): string[] {
  const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const script = `tell application "Terminal" to do script "${escaped}"`
  return ['-e', script]
}

/**
 * Returns true when the current platform is macOS (darwin).
 * Accepts an explicit platform string for testability.
 */
export function canLaunchTerminal(platform: string = process.platform): boolean {
  return platform === 'darwin'
}

/**
 * Launch `command` in a new macOS Terminal.app window via osascript.
 * The optional `exec` parameter is injectable so tests never spawn a real
 * process — pass a fake to avoid side effects.
 */
export async function launchBuildInTerminal(
  command: string,
  exec: (cmd: string, args: string[]) => Promise<unknown> = defaultExec,
): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    await exec('osascript', buildOsascriptArgs(command))
    return { ok: true }
  }
  catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
