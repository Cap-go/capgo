import { appendFile, mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

const DEFAULT_BASE_DIR = '/tmp/capgo-builds'

function getBaseDir(): string {
  return process.env.CAPGO_AI_LOG_BASE_DIR || DEFAULT_BASE_DIR
}

export function getLogCapturePath(jobId: string): string {
  return join(getBaseDir(), `${jobId}.log`)
}

export function getAiPromptPath(jobId: string): string {
  return join(getBaseDir(), `${jobId}.ai-prompt.txt`)
}

export function shouldCaptureLogs(): boolean {
  return process.stdout.isTTY === true
}

export async function startCaptureForJob(jobId: string): Promise<void> {
  await mkdir(getBaseDir(), { recursive: true })
  await writeFile(getLogCapturePath(jobId), '', { flag: 'w' })
}

export async function appendCapturedLine(jobId: string, line: string): Promise<void> {
  // Best-effort: if append fails we don't want to break the build stream
  try {
    await appendFile(getLogCapturePath(jobId), `${line}\n`)
  }
  catch {
    // swallow
  }
}

export interface CleanupOptions {
  keepAiPromptFile: boolean
}

export async function cleanupCapturedJobFiles(jobId: string, opts: CleanupOptions): Promise<void> {
  // Both unlinks are best-effort
  try {
    await unlink(getLogCapturePath(jobId))
  }
  catch {
    // ignore
  }
  if (!opts.keepAiPromptFile) {
    try {
      await unlink(getAiPromptPath(jobId))
    }
    catch {
      // ignore
    }
  }
}

/**
 * Register process-level cleanup handlers. Returns a function that removes
 * the handlers (call from request.ts after the build flow finishes normally).
 */
export function registerCleanupHandlers(jobId: string, getKeepPromptFile: () => boolean): () => void {
  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp)
      return
    cleanedUp = true
    void cleanupCapturedJobFiles(jobId, { keepAiPromptFile: getKeepPromptFile() })
  }
  // Signal handlers (SIGINT/SIGTERM) clean up and YIELD — they intentionally
  // don't call process.exit() so the build command's own SIGINT handler can
  // still run /build/cancel/:jobId before Node exits naturally.
  //
  // uncaughtException IS different: registering ANY handler suppresses Node's
  // default exit-with-code-1 behavior, and continuing after a thrown error
  // leaves the process in an unknown state. We clean up, then re-throw so the
  // default Node behavior (print + exit) takes over.
  const onExit = () => cleanup()
  const onSignal = () => {
    cleanup()
  }
  const onUncaught = (err: Error) => {
    cleanup()
    // Re-throw on the next tick so Node's default uncaughtException handling
    // (print stack + exit non-zero) still happens after our cleanup is queued.
    setImmediate(() => {
      throw err
    })
  }

  process.once('exit', onExit)
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  process.once('uncaughtException', onUncaught)

  return () => {
    process.removeListener('exit', onExit)
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    process.removeListener('uncaughtException', onUncaught)
  }
}
