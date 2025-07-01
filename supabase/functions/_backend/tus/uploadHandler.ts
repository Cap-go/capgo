import type { DurableObjectState, R2UploadedPart } from '@cloudflare/workers-types'
import type { Context } from '@hono/hono'
import type { BlankSchema } from 'hono/types'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Digester } from './digest.ts'
import type { UploadMetadata } from './parse.ts'
import type {
  RetryMultipartUpload,
} from './retry.ts'
import type { Part } from './util.ts'
import { Buffer } from 'node:buffer'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { Hono } from 'hono/tiny'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { onError } from '../utils/on_error.ts'
import { noopDigester, sha256Digester } from './digest.ts'
import { parseChecksum, parseUploadMetadata } from './parse.ts'
import {
  DEFAULT_RETRY_PARAMS,
  isR2ChecksumError,
  isR2MultipartDoesNotExistError,
  RetryBucket,
} from './retry.ts'
import { ALLOWED_HEADERS, ALLOWED_METHODS, AsyncLock, EXPOSED_HEADERS, generateParts, readIntFromHeader, toBase64, WritableStreamBuffer } from './util.ts'

export const TUS_VERSION = '1.0.0'

// uploads larger than this will be rejected
export const MAX_UPLOAD_LENGTH_BYTES = 1024 * 1024 * 1024 // 1GB
export const MAX_CHUNK_SIZE_BYTES = 1024 * 1024 * 99 // 99MB
export const ALERT_UPLOAD_SIZE_BYTES = 1024 * 1024 * 20 // 20MB

export const X_CHECKSUM_SHA256 = 'X-Checksum-Sha256'

// how long an unfinished upload lives in ms
const UPLOAD_EXPIRATION_MS = 1 * 24 * 60 * 60 * 1000 // 1 day
// TODO: make sure partial unfinished uploads are cleaned up automatically in r2 after 1 day

// how much we'll buffer in memory, must be greater than or equal to R2's min part size
// https://developers.cloudflare.com/r2/objects/multipart-objects/#limitations
const BUFFER_SIZE = 1024 * 1024 * 5

// how much of the upload we've written
const UPLOAD_OFFSET_KEY = 'upload-offset'

// key for StoredUploadInfo
const UPLOAD_INFO_KEY = 'upload-info'

// Stored for each part with the key of the multipart part number. Part numbers start with 1
interface StoredR2Part {
  part: R2UploadedPart

  // the length of the part
  length: number
}

// Infrequently changing information about the upload
interface StoredUploadInfo {
  uploadLength?: number
  checksum?: Uint8Array
  multipartUploadId?: string
}

function optionsHandler(c: Context) {
  cloudlog({ requestId: c.get('requestId'), message: 'in DO optionsHandler' })
  return c.newResponse(null, 204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Length, X-Signal-Checksum-SHA256, tus-resumable, tus-version, tus-max-size, tus-extension, tus-checksum-sha256, upload-metadata, upload-length, upload-offset',
    'Tus-Resumable': TUS_VERSION,
    'Tus-Version': TUS_VERSION,
    'Tus-Max-Size': MAX_UPLOAD_LENGTH_BYTES.toString(),
    'Tus-Extension': 'creation,creation-defer-length,creation-with-upload,expiration',
  })
}

interface Env {
  ATTACHMENT_BUCKET: R2Bucket
}

export class UploadHandler {
  state: DurableObjectState
  env: Env
  router: Hono<MiddlewareKeyVariables, BlankSchema, '/'>
  parts: StoredR2Part[]
  multipart: RetryMultipartUpload | undefined
  retryBucket: RetryBucket

  // only allow a single request to operate at a time
  requestGate: AsyncLock

  constructor(state: DurableObjectState, env: Env) {
    const bucket = env.ATTACHMENT_BUCKET
    this.state = state
    this.env = env
    this.parts = []
    this.requestGate = new AsyncLock()
    this.retryBucket = new RetryBucket(bucket, DEFAULT_RETRY_PARAMS)
    this.router = new Hono<MiddlewareKeyVariables>()
    this.router.use('*', logger())
    this.router.options('/files/upload/:bucket', optionsHandler as any)
    this.router.post('/files/upload/:bucket', this.exclusive(this.create) as any)
    this.router.options('/files/upload/:bucket/:id{.+}', optionsHandler as any)
    this.router.patch('/files/upload/:bucket/:id{.+}', this.exclusive(this.patch) as any)
    this.router.get('/files/upload/:bucket/:id{.+}', this.exclusive(this.head) as any)
    // TODO: remove this when all users have been migrated
    this.router.options('/private/files/upload/:bucket', optionsHandler as any)
    this.router.post('/private/files/upload/:bucket', this.exclusive(this.create) as any)
    this.router.options('/private/files/upload/:bucket/:id{.+}', optionsHandler as any)
    this.router.patch('/private/files/upload/:bucket/:id{.+}', this.exclusive(this.patch) as any)
    this.router.get('/private/files/upload/:bucket/:id{.+}', this.exclusive(this.head) as any)
    this.router.onError(onError('TUS handler'))
  }

  // forbid concurrent requests while running clsMethod
  exclusive(clsMethod: (c: Context) => Promise<Response>): (c: Context) => Promise<Response> {
    return async (c) => {
      const release = await this.requestGate.lock()
      try {
        return await clsMethod.bind(this)(c)
      }
      catch (e) {
        if (e instanceof UnrecoverableError) {
          try {
            const ue = e as UnrecoverableError
            cloudlogErr({ requestId: c.get('requestId'), message: `Upload for ${ue.r2Key} failed with unrecoverable error ${ue.message}` })
            // this upload can never make progress, try to clean up
            await this.cleanup(ue.r2Key)
          }
          catch (cleanupError) {
            // ignore errors cleaning up
            cloudlogErr({ requestId: c.get('requestId'), message: `error cleaning up ${cleanupError}` })
          }
        }
        throw e
      }
      finally {
        release()
      }
    }
  }

  fetch(request: Request): Response | Promise<Response> {
    return this.router.fetch(request)
  }

  async alarm() {
    return await this.cleanup()
  }

  async initCreate(c: Context, uploadMetadata: UploadMetadata) {
    const r2Key = uploadMetadata.filename ?? ''
    if (r2Key == null) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files create r2Key is null' })
      throw new HTTPException(400, { message: 'bad filename metadata' })
    }

    const existingUploadOffset: number | undefined = await this.state.storage.get(UPLOAD_OFFSET_KEY)
    if (existingUploadOffset != null && existingUploadOffset > 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files create duplicate object creation' })
      await this.cleanup(r2Key)
      throw new HTTPException(409, { message: 'object already exists' })
    }

    const contentType = c.req.header('Content-Type')
    if (contentType != null && contentType !== 'application/offset+octet-stream') {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files create create only supports application/offset+octet-stream content-type' })
      throw new HTTPException(415, { message: 'create only supports application/offset+octet-stream content-type' })
    }
    const contentLength = readIntFromHeader(c.req.raw.headers, 'Content-Length')
    if (!Number.isNaN(contentLength) && contentLength > 0 && contentType == null) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files create body requires application/offset+octet-stream content-type' })
      throw new HTTPException(415, { message: 'body requires application/offset+octet-stream content-type' })
    }
    const hasContent = c.req.raw.body != null && contentType != null
    const uploadLength = readIntFromHeader(c.req.raw.headers, 'Upload-Length')
    const uploadDeferLength = readIntFromHeader(c.req.raw.headers, 'Upload-Defer-Length')
    if (Number.isNaN(uploadLength) && Number.isNaN(uploadDeferLength)) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files create must contain Upload-Length or Upload-Defer-Length header' })
      throw new HTTPException(400, { message: 'must contain Upload-Length or Upload-Defer-Length header' })
    }

    if (!Number.isNaN(uploadDeferLength) && uploadDeferLength !== 1) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files create bad Upload-Defer-Length' })
      throw new HTTPException(400, { message: 'bad Upload-Defer-Length' })
    }
    return {
      r2Key,
      uploadLength,
      hasContent,
    }
  }

  // create a new TUS upload
  async create(c: Context): Promise<Response> {
    cloudlog({ requestId: c.get('requestId'), message: 'in DO create' })
    const uploadMetadata = parseUploadMetadata(c, c.req.raw.headers)
    const checksum = parseChecksum(c.req.raw.headers)

    const { r2Key, uploadLength, hasContent } = await this.initCreate(c, uploadMetadata)

    const uploadInfo: StoredUploadInfo = {}

    const expiration = new Date(Date.now() + UPLOAD_EXPIRATION_MS)
    await this.state.storage.setAlarm(expiration)
    if (!Number.isNaN(uploadLength)) {
      uploadInfo.uploadLength = uploadLength
    }
    if (checksum != null) {
      uploadInfo.checksum = checksum
    }
    await this.state.storage.put(UPLOAD_OFFSET_KEY, 0)
    await this.state.storage.put(UPLOAD_INFO_KEY, uploadInfo)

    const uploadLocation = new URL(r2Key, c.req.url.endsWith('/') ? c.req.url : `${c.req.url}/`)

    const uploadOffset = hasContent
      ? await this.appendBody(c, r2Key, c.req.raw.body as ReadableStream<Uint8Array>, 0, uploadInfo)
      : 0
    return new Response(null, {
      status: 201,
      headers: new Headers({
        'Location': uploadLocation.href,
        'Upload-Expires': expiration.toString(),
        'Upload-Offset': uploadOffset.toString(),
        'Tus-Resumable': TUS_VERSION,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Expose-Headers': EXPOSED_HEADERS,
      }),
    })
  }

  // get the current upload offset to resume an upload
  async head(c: Context): Promise<Response> {
    cloudlog({ requestId: c.get('requestId'), message: 'in DO head detected' })
    const r2Key = c.req.param('id')

    let offset: number | undefined = await this.state.storage.get(UPLOAD_OFFSET_KEY)
    let uploadLength: number | undefined
    if (offset == null) {
      const headResponse = await this.retryBucket.head(r2Key)
      if (headResponse == null) {
        cloudlog({ requestId: c.get('requestId'), message: 'in DO files head headResponse is null' })
        return c.text('Not Found', 404)
      }
      offset = headResponse.size
      uploadLength = headResponse.size
    }
    else {
      const info: StoredUploadInfo | undefined = await this.state.storage.get(UPLOAD_INFO_KEY)
      uploadLength = info?.uploadLength
    }

    const headers = new Headers({
      'Upload-Offset': offset?.toString() ?? '0',
      'Upload-Expires': (await this.expirationTime()).toString(),
      'Cache-Control': 'no-store',
      'Tus-Resumable': TUS_VERSION,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    })
    if (uploadLength != null) {
      headers.set('Upload-Length', uploadLength.toString())
    }
    return new Response(null, { headers })
  }

  // append to the upload at the current upload offset
  async patch(c: Context): Promise<Response> {
    const r2Key = c.req.param('id')
    cloudlog({ requestId: c.get('requestId'), message: 'in DO patch', r2Key })

    let uploadOffset: number | undefined = await this.state.storage.get(UPLOAD_OFFSET_KEY)
    if (uploadOffset == null) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files patch uploadOffset is null' })
      return c.text('Not Found', 404)
    }

    const headerOffset = readIntFromHeader(c.req.raw.headers, 'Upload-Offset')
    if (uploadOffset !== headerOffset) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files patch incorrect upload offset' })
      return c.text('incorrect upload offset', 409)
    }

    const uploadInfo: StoredUploadInfo | undefined = await this.state.storage.get(UPLOAD_INFO_KEY)
    if (uploadInfo == null) {
      throw new UnrecoverableError('existing upload should have had uploadInfo', r2Key)
    }
    const headerUploadLength = readIntFromHeader(c.req.raw.headers, 'Upload-Length')
    if (uploadInfo.uploadLength != null && !Number.isNaN(headerUploadLength) && uploadInfo.uploadLength !== headerUploadLength) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files patch upload length cannot change' })
      return c.text('upload length cannot change', 400)
    }

    if (uploadInfo.uploadLength == null && !Number.isNaN(headerUploadLength)) {
      uploadInfo.uploadLength = headerUploadLength
      await this.state.storage.put(UPLOAD_INFO_KEY, uploadInfo)
    }

    if (c.req.raw.body == null) {
      cloudlog({ requestId: c.get('requestId'), message: 'in DO files patch must provide request body' })
      return c.text('Must provide request body', 400)
    }

    uploadOffset = await this.appendBody(c, r2Key, c.req.raw.body, uploadOffset, uploadInfo)

    return new Response(null, {
      status: 204,
      headers: new Headers({
        'Upload-Offset': uploadOffset.toString(),
        'Upload-Expires': (await this.expirationTime()).toString(),
        'Tus-Resumable': TUS_VERSION,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Expose-Headers': EXPOSED_HEADERS,
      }),
    })
  }

  async switchOnPartKind(c: Context, r2Key: string, uploadOffset: number, uploadLength: number | undefined, uploadInfo: StoredUploadInfo, part: Part, digester: Digester, checksum: Uint8Array | undefined) {
    switch (part.kind) {
      case 'intermediate': {
        this.multipart ??= await this.r2CreateMultipartUpload(r2Key, uploadInfo)
        this.parts.push({
          part: await this.r2UploadPart(r2Key, this.parts.length + 1, part.bytes),
          length: part.bytes.byteLength,
        })
        uploadOffset += part.bytes.byteLength
        const writePart = this.state.storage.put(this.parts.length.toString(), this.parts.at(-1))
        const writeOffset = this.state.storage.put(UPLOAD_OFFSET_KEY, uploadOffset)
        await Promise.all([writePart, writeOffset])
        break
      }
      case 'final':
      case 'error': {
        const finished = uploadLength != null && uploadOffset + part.bytes.byteLength === uploadLength
        if (!finished) {
          // write the partial part to a temporary object so we can rehydrate it
          // later, and then we're done
          await this.r2Put(c, this.tempkey(), part.bytes)
          uploadOffset += part.bytes.byteLength
          await this.state.storage.put(UPLOAD_OFFSET_KEY, uploadOffset)
        }
        else if (!this.multipart) {
          // all the bytes fit into a single in memory buffer, so we can just upload
          // it directly without using multipart
          await this.r2Put(c, r2Key, part.bytes, checksum)
          uploadOffset += part.bytes.byteLength
          await this.cleanup()
        }
        else {
          // upload the last part (can be less than the 5mb min part size), then complete the upload
          const uploadedPart = await this.r2UploadPart(r2Key, this.parts.length + 1, part.bytes)
          this.parts.push({ part: uploadedPart, length: part.bytes.byteLength })
          await this.r2CompleteMultipartUpload(c, r2Key, await digester.digest(), checksum)
          uploadOffset += part.bytes.byteLength
          await this.cleanup()
        }
        break
      }
    }
  }

  // Append body to the upload starting at uploadOffset. Returns the new uploadOffset
  //
  // The body is streamed into a fixed length buffer. If the object fits into a single
  // buffer, it's uploaded directly. Otherwise, each full buffer is uploaded to a
  // multipart transaction.
  //
  // If the stream ends but we have not hit uploadLength (either due to an error or a
  // partial upload), the remaining buffer is written to a temporary object. When
  // the upload is resumed, we retrieve the temporary and repopulate the buffer.
  //
  // If the client provides a checksum we need to do two things:
  // A. Reject the upload if it doesn't match the provided checksum
  // B. Once the object is uploaded, return the checksum on subsequent GET/HEAD requests
  //
  // Depending on how the object is uploaded, we achieve A and B different ways. If the object can be uploaded without
  // using mulitpart upload, R2 provides support for A and B directly. Otherwise, we support B by
  // adding custom metadata to the object when we create the multipart upload. For A, if the client manages to upload
  // the object in one-shot we calculate the digest as it comes in. Otherwise, after the multipart upload is
  // finished, we retrieve the object from R2 and recompute the digest.
  async appendBody(c: Context, r2Key: string, body: ReadableStream<Uint8Array>, uploadOffset: number, uploadInfo: StoredUploadInfo): Promise<number> {
    const uploadLength = uploadInfo.uploadLength
    if ((uploadLength ?? 0) > MAX_UPLOAD_LENGTH_BYTES) {
      await this.cleanup(r2Key)
      cloudlog({ requestId: c.get('requestId'), message: 'files append body Upload-Length exceeds maximum upload size' })
      throw new HTTPException(413, { message: 'Upload-Length exceeds maximum upload size' })
    }

    // We'll repeatedly use this to buffer data we'll send to R2
    const mem = new WritableStreamBuffer(new ArrayBuffer(BUFFER_SIZE))

    uploadOffset = await this.resumeUpload(r2Key, uploadOffset, uploadInfo, mem)

    const isSinglePart = uploadLength != null && uploadLength <= BUFFER_SIZE
    const checksum: Uint8Array | undefined = uploadInfo.checksum
    // optimization: only bother calculating the stream's checksum if the client provided it, and we're not resuming
    const digester: Digester = checksum != null && uploadOffset === 0 && !isSinglePart ? sha256Digester() : noopDigester()

    for await (const part of generateParts(c, body, mem)) {
      const newLength = uploadOffset + part.bytes.byteLength
      if (uploadLength != null && newLength > uploadLength) {
        await this.cleanup(r2Key)
        cloudlog({ requestId: c.get('requestId'), message: 'files append body body exceeds Upload-Length' })
        throw new HTTPException(413, { message: 'body exceeds Upload-Length' })
      }
      if (newLength > MAX_UPLOAD_LENGTH_BYTES) {
        await this.cleanup(r2Key)
        cloudlog({ requestId: c.get('requestId'), message: 'files append body body exceeds maximum upload size' })
        throw new HTTPException(413, { message: 'body exceeds maximum upload size' })
      }

      await digester.update(part.bytes)
      await this.switchOnPartKind(c, r2Key, uploadOffset, uploadLength, uploadInfo, part, digester, checksum)
    }
    return uploadOffset
  }

  // Check a checksum, throwing a 415 if the checksum does not match
  async checkChecksum(c: Context, r2Key: string, expected: Uint8Array, actual: ArrayBuffer) {
    if (!Buffer.from(actual).equals(expected)) {
      await this.cleanup(r2Key)
      cloudlog({ requestId: c.get('requestId'), message: 'files checksum checksum does not match' })
      throw new HTTPException(415, { message: `The SHA-256 checksum you specified ${toBase64(actual)} did not match what we received ${toBase64(expected)}.` })
    }
  }

  // Compute the SHA-256 checksum of a remote r2 object
  async retrieveChecksum(r2Key: string): Promise<ArrayBuffer> {
    const body = await this.retryBucket.get(r2Key)
    if (body == null) {
      throw new UnrecoverableError(`Object ${r2Key} not found directly after uploading`, r2Key)
    }
    // @ts-expect-error-next-line
    const digest = new crypto.DigestStream('SHA-256')
    await body.body.pipeTo(digest)
    return await digest.digest
  }

  // Prepare to begin uploading from uploadOffset.
  // Resume any ongoing multipart upload, and fetch stashed temporary object from R2 into mem.
  //
  // Return the uploadOffset for the first byte of mem
  async resumeUpload(r2Key: string, uploadOffset: number, uploadInfo: StoredUploadInfo, mem: WritableStreamBuffer): Promise<number> {
    if (uploadOffset === 0) {
      return 0
    }

    // Resume any existing multipart upload
    const partOffset = await this.hydrateParts(r2Key, uploadOffset, uploadInfo)
    if (partOffset === uploadOffset) {
      // the uploadOffset the client is starting at picks up exactly at the end
      // of the last multipart part we uploaded
      return partOffset
    }

    // Otherwise, we should have stashed a temporary object in R2 with whatever was
    // left-over after the last part we uploaded
    const tempobj = await this.retryBucket.get(this.tempkey())
    if (tempobj == null) {
      throw new UnrecoverableError(`we claimed to have ${uploadOffset} bytes, only had ${partOffset}`, r2Key)
    }
    if (partOffset + tempobj.size !== uploadOffset) {
      throw new UnrecoverableError(`we claimed to have ${uploadOffset} bytes,  had ${partOffset + tempobj.size}`, r2Key)
    }

    // Fill mem with the temporary object
    if (tempobj.size > mem.buf.byteLength) {
      throw new UnrecoverableError(`bad temp object ${this.tempkey()} of length ${tempobj.size}`, r2Key)
    }

    // copy into our temp buffer
    await tempobj.body.pipeTo(new WritableStream({
      write(chunk) {
        return mem.write(chunk)
      },
    }))

    // return the location in the overall upload where our memory buffer starts
    return uploadOffset - tempobj.size
  }

  // load part infos from durable object storage
  async hydrateParts(r2Key: string, uploadOffset: number, uploadInfo: StoredUploadInfo): Promise<number> {
    if (this.multipart != null) {
      return this.parts
        .map(p => p.length)
        .reduce((a, b) => a + b, 0)
    }

    let partOffset = 0
    for (; ;) {
      const part: StoredR2Part | undefined = await this.state.storage.get((this.parts.length + 1).toString())
      if (part == null) {
        break
      }
      partOffset += part.length
      if (partOffset > uploadOffset) {
        // this part is past where we've told the client to start uploading
        break
      }
      this.parts.push(part)
    }
    if (this.parts.length > 0) {
      if (uploadInfo.multipartUploadId == null) {
        throw new UnrecoverableError(`had ${this.parts.length} stored parts but no stored multipartUploadId`, r2Key)
      }
      this.multipart = this.r2ResumeMultipartUpload(r2Key, uploadInfo.multipartUploadId)
    }
    return partOffset
  }

  async r2CreateMultipartUpload(r2Key: string, uploadInfo: StoredUploadInfo): Promise<RetryMultipartUpload> {
    const customMetadata: Record<string, string> = {}
    if (uploadInfo.checksum != null) {
      customMetadata[X_CHECKSUM_SHA256] = toBase64(uploadInfo.checksum)
    }
    const upload = await this.retryBucket.createMultipartUpload(r2Key, { customMetadata })
    uploadInfo.multipartUploadId = upload.r2MultipartUpload.uploadId
    await this.state.storage.put(UPLOAD_INFO_KEY, uploadInfo)
    return upload
  }

  r2ResumeMultipartUpload(r2Key: string, multipartUploadId: string): RetryMultipartUpload {
    return this.retryBucket.resumeMultipartUpload(r2Key, multipartUploadId)
  }

  async r2Put(c: Context, r2Key: string, bytes: Uint8Array, checksum?: Uint8Array) {
    try {
      await this.retryBucket.put(r2Key, bytes, checksum as any)
    }
    catch (e) {
      if (isR2ChecksumError(e)) {
        cloudlogErr({ requestId: c.get('requestId'), message: `checksum failure: ${e}` })
        await this.cleanup()
        cloudlog({ requestId: c.get('requestId'), message: 'files put checksum failure' })
        throw new HTTPException(415)
      }
      throw e
    }
  }

  async r2UploadPart(r2Key: string, partIndex: number, bytes: Uint8Array): Promise<R2UploadedPart> {
    if (this.multipart == null) {
      throw new UnrecoverableError('cannot call complete multipart with no multipart upload', r2Key)
    }
    try {
      return await this.multipart.uploadPart(partIndex, bytes)
    }
    catch (e) {
      if (isR2MultipartDoesNotExistError(e)) {
        // The multipart transaction we persisted no longer exists. It either expired, or it's possible we
        // finished the transaction but failed to update the state afterwords. Either way, we should give up.
        throw new UnrecoverableError(`multipart upload does not exist ${e}`, r2Key)
      }
      throw e
    }
  }

  async r2CompleteMultipartUpload(c: Context, r2Key: string, actualChecksum?: ArrayBuffer, expectedChecksum?: Uint8Array) {
    if (this.multipart == null) {
      throw new UnrecoverableError('cannot call complete multipart with no multipart upload', r2Key)
    }

    // If we were able to calculate the streaming digest, we can accept or reject now.
    if (actualChecksum != null && expectedChecksum != null) {
      await this.checkChecksum(c, r2Key, expectedChecksum, actualChecksum)
    }

    await this.multipart.complete(this.parts.map(storedPart => storedPart.part))

    // Otherwise we have to compute the digest from the finished upload
    if (actualChecksum == null && expectedChecksum != null) {
      await this.checkChecksum(c, r2Key, expectedChecksum, await this.retrieveChecksum(r2Key))
    }
  }

  tempkey(): string {
    return `temporary/${this.state.id.toString()}`
  }

  // Cleanup the state for this durable object. If r2Key is provided, the method will make
  // a best-effort attempt to clean any temporary R2 objects that may exist.
  //
  // Cleanup should be called when:
  // 1. The upload is successfully completed
  // 2. The server experiences an error condition where retrying would be futile. Cleanup ensures a subsequent retry
  //    will hit a 404.
  // 3. The client has made a mistake uploading that cannot be fixed by retrying with different arguments. e.g.,
  //    an upload with an incorrect checksum.
  async cleanup(r2Key?: string): Promise<void> {
    // try our best to clean up R2 state we may have left around, but
    // if we fail these objects/transactions will eventually expire
    try {
      await this.retryBucket.delete(this.tempkey())
      if (r2Key != null) {
        await this.hydrateParts(
          r2Key,
          await this.state.storage.get(UPLOAD_OFFSET_KEY) ?? 0,
          await this.state.storage.get(UPLOAD_INFO_KEY) ?? {},
        )
        if (this.multipart != null) {
          await this.multipart.abort()
        }
      }
    }
    catch (e) {
      cloudlog(`failed to cleanup R2 state: ${e}`)
    }

    this.multipart = undefined
    this.parts = []
    await this.state.storage.deleteAll()
    await this.state.storage.deleteAlarm()
  }

  // After this time, the upload can no longer be used
  async expirationTime(): Promise<Date> {
    const expiration = await this.state.storage.getAlarm()
    if (expiration == null) {
      return new Date()
    }
    return new Date(expiration)
  }
}

export class AttachmentUploadHandler extends UploadHandler {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
  }
}

// export class BackupUploadHandler extends UploadHandler {
//   constructor(state: DurableObjectState, env: Env) {
//     super(state, env, env.BACKUP_BUCKET)
//   }
// }

class UnrecoverableError extends Error {
  r2Key: string

  constructor(message: string, r2Key: string) {
    super(message)
    this.name = this.constructor.name
    this.r2Key = r2Key
  }
}
