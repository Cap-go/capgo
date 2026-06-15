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
 * Read a build output record from `path`. Returns the parsed `BuildOutputRecord`
 * if the file exists, is valid JSON, and the parsed object contains a string
 * `jobId` property. Returns `null` in all other cases (missing file, parse
 * error, missing/wrong-type jobId).
 */
export async function readBuildOutputRecord(path: string): Promise<BuildOutputRecord | null> {
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object'
      && parsed !== null
      && typeof (parsed as Record<string, unknown>).jobId === 'string'
      && typeof (parsed as Record<string, unknown>).status === 'string'
      && ((parsed as Record<string, unknown>).outputUrl === null || typeof (parsed as Record<string, unknown>).outputUrl === 'string')
    ) {
      return parsed as BuildOutputRecord
    }
    return null
  }
  catch {
    return null
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof Error)
    return error.message
  return String(error)
}
