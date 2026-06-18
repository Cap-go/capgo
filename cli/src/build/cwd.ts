// src/build/cwd.ts
import { chdir, cwd } from 'node:process'
import { appendInternalLog } from '../support/internal-log.js'

/**
 * Single in-process queue guarding `process.chdir()`. Both `build request`
 * and the prescan context builder must share this queue: two independent
 * queues over the same global cwd can interleave under concurrent SDK/MCP
 * usage and resolve config against the wrong directory.
 */
let cwdQueue: Promise<unknown> = Promise.resolve()

/**
 * Run an async function with the process working directory temporarily set to `dir`.
 *
 * NOTE: `process.chdir()` is global, so this uses a simple in-process queue to avoid
 * concurrent calls interfering with each other.
 */
export async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const previous = cwd()
    try {
      chdir(dir)
    }
    catch (error) {
      throw new Error(`Failed to change working directory to "${dir}": ${(error as Error).message}`)
    }

    try {
      return await fn()
    }
    finally {
      try {
        chdir(previous)
      }
      catch (err) {
        appendInternalLog(`cwd restore failed (ignored): ${err instanceof Error ? err.message : String(err)}`)
        // Best-effort restore; ignore to avoid masking original errors.
      }
    }
  }

  const p = cwdQueue.then(run, run)
  cwdQueue = p.then(() => undefined, () => undefined)
  return p
}
