import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { cwd } from 'node:process'
import QRCode from 'qrcode'

/** Stable shape written to disk; bump schemaVersion if breaking changes are made. */
export interface BuildOutputRecord {
  schemaVersion: 1
  jobId: string
  appId: string
  platform: 'ios' | 'android'
  buildMode: 'debug' | 'release'
  status: string
  outputUrl: string | null
  qrCodeAscii: string | null
  qrCodePngPath: string | null
  finishedAt: string
}

export interface WriteBuildOutputRecordInput {
  jobId: string
  appId: string
  platform: 'ios' | 'android'
  buildMode: 'debug' | 'release'
  status: string
  outputUrl: string | null
}

/**
 * Write a build-output record to `recordPath` (JSON) and, when a URL is available,
 * a PNG QR code to `<recordPath>.qr.png`. Returns the parsed record exactly as
 * written so callers can log a summary without re-reading the file.
 *
 * Failures rendering the PNG are non-fatal — the JSON is always written. The
 * record's `qrCodePngPath` field is null when the PNG could not be produced.
 */
export async function writeBuildOutputRecord(
  recordPath: string,
  input: WriteBuildOutputRecordInput,
  onWarn?: (msg: string) => void,
): Promise<BuildOutputRecord> {
  const absoluteRecordPath = resolve(cwd(), recordPath)
  const pngPath = `${absoluteRecordPath}.qr.png`

  // Create the parent directory once up-front so QRCode.toFile (called before
  // the JSON write below) does not fail with ENOENT for callers who passed
  // --output-record under a not-yet-created directory.
  await mkdir(dirname(absoluteRecordPath), { recursive: true })

  let qrCodeAscii: string | null = null
  let qrCodePngPath: string | null = null
  if (input.outputUrl) {
    try {
      qrCodeAscii = await QRCode.toString(input.outputUrl, { type: 'utf8', errorCorrectionLevel: 'L' })
    }
    catch (error) {
      onWarn?.(`Failed to render ASCII QR code: ${stringifyError(error)}`)
    }
    try {
      await QRCode.toFile(pngPath, input.outputUrl, { errorCorrectionLevel: 'L', width: 512 })
      qrCodePngPath = pngPath
    }
    catch (error) {
      onWarn?.(`Failed to render PNG QR code at ${pngPath}: ${stringifyError(error)}`)
    }
  }

  const record: BuildOutputRecord = {
    schemaVersion: 1,
    jobId: input.jobId,
    appId: input.appId,
    platform: input.platform,
    buildMode: input.buildMode,
    status: input.status,
    outputUrl: input.outputUrl ?? null,
    qrCodeAscii,
    qrCodePngPath,
    finishedAt: new Date().toISOString(),
  }

  await writeFile(absoluteRecordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8')

  return record
}

/**
 * Returns a deterministic temp-file path for the build output record for a
 * given (appId, platform) pair. Both the build hand-off (command emit) and
 * the confirm (record read) call this helper so that the path is never passed
 * back and forth across an MCP boundary.
 *
 * appId is sanitized: all `/` and `\` characters are replaced with `_`, and
 * any `..` sequences are replaced with `_`, to prevent path traversal.
 */
export function defaultBuildRecordPath(appId: string, platform: 'ios' | 'android'): string {
  const safe = appId.replace(/[/\\]/g, '_').replace(/\.\./g, '_')
  return join(tmpdir(), `capgo-build-record-${safe}-${platform}.json`)
}

/**
 * Thrown by `readBuildOutputRecord` when the record file EXISTS but cannot be
 * used: unreadable (permissions), not valid JSON (e.g. truncated write), or an
 * unexpected shape. Distinct from the `null` return (no record yet) so callers
 * polling for a build result can surface the failure instead of waiting forever.
 */
export class BuildRecordReadError extends Error {
  readonly recordPath: string
  constructor(message: string, recordPath: string) {
    super(message)
    this.name = 'BuildRecordReadError'
    this.recordPath = recordPath
  }
}

/**
 * Read a build output record from `path`.
 *
 * Returns `null` ONLY when the file does not exist yet (ENOENT — the build has
 * not finished). Every other failure mode (unreadable file, malformed JSON,
 * missing/wrong-type jobId/status/outputUrl) throws `BuildRecordReadError`:
 * a present-but-corrupt record is a surfaced failure, never "still waiting".
 */
export async function readBuildOutputRecord(path: string): Promise<BuildOutputRecord | null> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT')
      return null
    throw new BuildRecordReadError(`Build record at ${path} could not be read: ${stringifyError(error)}`, path)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    throw new BuildRecordReadError(`Build record at ${path} is not valid JSON (possibly a truncated write): ${stringifyError(error)}`, path)
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && typeof (parsed as Record<string, unknown>).jobId === 'string'
    && typeof (parsed as Record<string, unknown>).status === 'string'
    && ((parsed as Record<string, unknown>).outputUrl === null || typeof (parsed as Record<string, unknown>).outputUrl === 'string')
  ) {
    return parsed as BuildOutputRecord
  }
  throw new BuildRecordReadError(`Build record at ${path} has an unexpected shape (jobId/status must be strings; outputUrl must be a string or null).`, path)
}

function stringifyError(error: unknown): string {
  if (error instanceof Error)
    return error.message
  return String(error)
}
