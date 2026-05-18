import type { Context } from 'hono'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { parseAppScopedAttachmentPath } from './util.ts'

function normalizeUploadedFileSize(fileSize: number): number | null {
  if (!Number.isFinite(fileSize) || fileSize <= 0)
    return null
  return Math.trunc(fileSize)
}

export async function recordUploadedFileSize(c: Context, s3Path: string, fileSize: number): Promise<void> {
  const normalizedSize = normalizeUploadedFileSize(fileSize)
  if (normalizedSize == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'recordUploadedFileSize skipped invalid size', s3Path, fileSize })
    return
  }

  const scopedPath = parseAppScopedAttachmentPath(s3Path)
  if (scopedPath?.kind !== 'scoped') {
    cloudlog({ requestId: c.get('requestId'), message: 'recordUploadedFileSize skipped invalid path', s3Path })
    return
  }

  const pgClient = getPgClient(c, false)
  try {
    await pgClient.query(
      `
        INSERT INTO public.uploaded_file_sizes (
          s3_path,
          file_size,
          owner_org,
          app_id,
          updated_at
        )
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (s3_path)
        DO UPDATE SET
          file_size = EXCLUDED.file_size,
          owner_org = EXCLUDED.owner_org,
          app_id = EXCLUDED.app_id,
          updated_at = now()
      `,
      [s3Path, normalizedSize, scopedPath.owner_org, scopedPath.app_id],
    )
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'recordUploadedFileSize failed', s3Path, fileSize: normalizedSize, error })
  }
  finally {
    await closeClient(c, pgClient)
  }
}

export function getCompletedTusUploadSize(headers: Headers): number | null {
  const rawOffset = headers.get('Upload-Offset')
  const rawLength = headers.get('Upload-Length')
  if (rawOffset == null || rawLength == null)
    return null

  const offset = Number.parseInt(rawOffset, 10)
  const length = Number.parseInt(rawLength, 10)
  if (!Number.isFinite(offset) || !Number.isFinite(length) || offset !== length)
    return null

  return normalizeUploadedFileSize(offset)
}
