import type { HeadObjectOutput } from '@aws-sdk/client-s3'
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { FetchHttpHandler } from '@smithy/fetch-http-handler'
import { normalizeEtag } from '../../supabase/functions/_backend/utils/r2_inventory.ts'

export interface CleanupStorageEnv {
  S3_ENDPOINT?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
}
export interface CleanupStorage {
  remove: (bucket: string, key: string, etag: string | null, signal: AbortSignal) => Promise<void>
}

export function createCleanupStorage(env: CleanupStorageEnv): CleanupStorage {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
    throw new Error('Cleanup storage configuration missing')
  const endpoint = new URL(env.S3_ENDPOINT.includes('://') ? env.S3_ENDPOINT : `https://${env.S3_ENDPOINT}`)
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)
    || endpoint.pathname !== '/' || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Cleanup requires an R2 account endpoint')
  }
  const client = new S3Client({
    endpoint: endpoint.href,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    maxAttempts: 1,
    requestHandler: new FetchHttpHandler(),
  })
  return cleanupStorage(client)
}

function errorCode(error: unknown) {
  const e = error as { name?: string, $metadata?: { httpStatusCode?: number } }
  return { name: e?.name, status: e?.$metadata?.httpStatusCode }
}
function sameMetadata(source: HeadObjectOutput, backup: HeadObjectOutput) {
  const fields = ['ContentType', 'CacheControl', 'ContentDisposition', 'ContentEncoding', 'ContentLanguage', 'Expires'] as const
  const metadata = (value: Record<string, string> | undefined) => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)))
  return metadata(source.Metadata) === metadata(backup.Metadata)
    && fields.every(field => String(source[field] ?? '') === String(backup[field] ?? ''))
}
const quoted = (etag: string) => `"${normalizeEtag(etag)}"`

// Exposed for transport tests; the production client has exactly one SDK attempt.
export function cleanupStorage(client: S3Client): CleanupStorage {
  return { remove: async (bucket, key, expectedEtag, signal) => {
    const check = () => signal.throwIfAborted()
    const head = async (path: string) => {
      check()
      try {
        return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: path }), { abortSignal: signal })
      }
      catch (error) {
        const code = errorCode(error)
        if (code.name === 'NoSuchKey' || (code.name === 'NotFound' && code.status === 404))
          return null
        throw error
      }
    }
    let etag = expectedEtag
    if (!etag) {
      const source = await head(key)
      check()
      if (!source)
        return
      etag = source.ETag ?? null
      if (!etag)
        throw new Error('Source ETag missing')
    }
    const trash = `deleted-after-7-days/${key}`
    const copy = new CopyObjectCommand({
      Bucket: bucket,
      Key: trash,
      CopySource: `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`,
      CopySourceIfMatch: quoted(etag),
      MetadataDirective: 'COPY',
    })
    // R2 extension: never overwrite/refresh the original backup on redelivery.
    copy.middlewareStack.add(next => async (args) => {
      const request = args.request as { headers: Record<string, string> }
      request.headers['cf-copy-destination-if-none-match'] = '*'
      return next(args)
    }, { step: 'build', name: 'preserveCleanupBackup' })
    check()
    try {
      const result = await client.send(copy, { abortSignal: signal })
      // The SDK consumes/parses the complete XML, including embedded HTTP-200 errors.
      if (!result.CopyObjectResult?.ETag || !result.CopyObjectResult.LastModified
        || !Number.isFinite(result.CopyObjectResult.LastModified.getTime())) {
        throw new Error('Copy completion unconfirmed')
      }
    }
    catch (error) {
      check()
      const code = errorCode(error)
      if (code.name === 'NoSuchKey') {
        // A source that disappeared is success only after a definitive observation.
        if (await head(key) === null)
          return
        throw error
      }
      if (code.status !== 412)
        throw error
      // Either source or destination precondition failed. Read sequentially to
      // keep the four workflows below the six-connection runtime ceiling.
      const source = await head(key)
      if (!source)
        return
      const backup = await head(trash)
      check()
      if (!backup || !source.ETag || normalizeEtag(source.ETag) !== normalizeEtag(etag)
        || !backup.ETag || normalizeEtag(backup.ETag) !== normalizeEtag(source.ETag)
        || !Number.isSafeInteger(source.ContentLength) || source.ContentLength !== backup.ContentLength || !sameMetadata(source, backup)) {
        throw new Error('Existing backup or source differs')
      }
    }
    // An abort can race a remotely successful COPY. Never let late resolution
    // start DELETE after the workflow deadline has abandoned this job.
    check()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal })
    check()
  } }
}
