import type { R2UploadedPart } from '@cloudflare/workers-types'
import type { Digester } from './digest.ts'
import type { UploadMetadata } from './parse.ts'
import type {
  RetryMultipartUpload,
} from './retry.ts'
import type { Part } from './util.ts'
import { Buffer } from 'node:buffer'
import { DurableObject } from 'cloudflare:workers'
import { HTTPException } from 'hono/http-exception'
import { quickError } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { noopDigester, sha256Digester } from './digest.ts'
import { parseChecksum, parseUploadMetadata } from './parse.ts'
import {
  DEFAULT_RETRY_PARAMS,
  isR2ChecksumError,
  isR2MultipartDoesNotExistError,
  RetryBucket,
} from './retry.ts'
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  AsyncLock,
  BUFFER_SIZE,
  EXPOSED_HEADERS,
  generateParts,
  MAX_UPLOAD_LENGTH_BYTES,
  readIntFromHeader,
  toBase64,
  TUS_VERSION,
  UPLOAD_EXPIRATION_MS,
  UPLOAD_INFO_KEY,
  UPLOAD_OFFSET_KEY,
  WritableStreamBuffer,
  X_CHECKSUM_SHA256,
} from './util.ts'

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

interface Env {
  ATTACHMENT_BUCKET: R2Bucket
}

function resJson(body: object): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export class UploadHandler extends DurableObject {
  parts: StoredR2Part[]
  requestId: string | undefined
  multipart: RetryMultipartUpload | undefined
  retryBucket: RetryBucket

  // only allow a single request to operate at a time
  requestGate: AsyncLock

  constructor(ctx: ConstructorParameters<typeof DurableObject>[0], env: Env) {
    super(ctx, env)
    const bucket = env.ATTACHMENT_BUCKET
    this.parts = []
    this.requestId = ''
    this.requestGate = new AsyncLock()
    this.retryBucket = new RetryBucket(bucket, DEFAULT_RETRY_PARAMS)
  }

  setRequestId(rId: string) {
    this.requestId = rId
  }

  // forbid concurrent requests while running clsMethod
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.requestGate.lock()
    try {
      return await fn()
    }
    catch (e) {
      if (e instanceof UnrecoverableError) {
        try {
          const unrecoverableError = e as UnrecoverableError
          cloudlogErr({ requestId: this.requestId, message: `Upload for ${unrecoverableError.r2Key} failed with unrecoverable error ${unrecoverableError.message}` })
          // this upload can never make progress, try to clean up
          await this.cleanup(unrecoverableError.r2Key)
        }
        catch (cleanupError) {
          // ignore errors cleaning up
          cloudlogErr({ requestId: this.requestId, message: `error cleaning up ${cleanupError}` })
        }
      }
      throw e
    }
    finally {
      release()
    }
  }

  override async alarm() {
    return await this.cleanup()
  }

  async initCreate(body: ReadableStream<Uint8Array> | null, headers: Headers, uploadMetadata: UploadMetadata) {
    cloudlog({
      requestId: this.requestId,
      message: 'TUS initCreate - start',
      metadata: uploadMetadata,
    })

    const r2Key = uploadMetadata.filename ?? ''
    if (r2Key == null) {
      cloudlog({
        requestId: this.requestId,
        message: 'TUS initCreate - r2Key is null',
        metadata: uploadMetadata,
      })
      throw new HTTPException(400, {
        res: resJson({
          error: 'bad_filename_metadata',
          message: 'Filename metadata is missing or invalid',
          moreInfo: { metadata: uploadMetadata, requestId: this.requestId },
        }),
      })
    }

    cloudlog({
      requestId: this.requestId,
      message: 'TUS initCreate - r2Key extracted',
      r2Key,
    })

    const existingUploadOffset: number | undefined = await this.ctx.storage.kv.get(UPLOAD_OFFSET_KEY)
    if (existingUploadOffset != null && existingUploadOffset > 0) {
      cloudlog({
        requestId: this.requestId,
        message: 'TUS initCreate - duplicate upload detected, cleaning up',
        r2Key,
        existingUploadOffset,
      })
      await this.cleanup(r2Key)
      throw new HTTPException(409, {
        res: resJson({
          error: 'duplicate_upload',
          message: 'Upload already exists',
          moreInfo: { r2Key, existingUploadOffset, requestId: this.requestId },
        }),
      })
    }

    const contentType = headers.get('Content-Type')
    cloudlog({
      requestId: this.requestId,
      message: 'TUS initCreate - checking content type',
      contentType,
    })

    if (contentType != null && contentType !== 'application/offset+octet-stream') {
      cloudlog({
        requestId: this.requestId,
        message: 'TUS initCreate - invalid content type',
        contentType,
        expected: 'application/offset+octet-stream',
      })
      throw new HTTPException(415, {
        res: resJson({
          error: 'invalid_content_type',
          message: 'Create only supports application/offset+octet-stream content-type',
          moreInfo: { contentType, requestId: this.requestId },
        }),
      })
    }

    const contentLength = readIntFromHeader(headers, 'Content-Length')
    if (!Number.isNaN(contentLength) && contentLength > 0 && contentType == null) {
      cloudlog({
        requestId: this.requestId,
        message: 'TUS initCreate - content-type required for body',
        contentLength,
      })
      throw new HTTPException(415, {
        res: resJson({
          error: 'missing_content_type',
          message: 'Body requires application/offset+octet-stream content-type',
          moreInfo: { contentLength, requestId: this.requestId },
        }),
      })
    }

    const hasContent = body != null && contentType != null
    const uploadLength = readIntFromHeader(headers, 'Upload-Length')
    const uploadDeferLength = readIntFromHeader(headers, 'Upload-Defer-Length')

    cloudlog({
      requestId: this.requestId,
      message: 'TUS initCreate - checking upload length headers',
      uploadLength,
      uploadDeferLength,
      hasContent,
    })

    if (Number.isNaN(uploadLength) && Number.isNaN(uploadDeferLength)) {
      cloudlog({
        requestId: this.requestId,
        message: 'TUS initCreate - missing upload length header',
      })
      throw new HTTPException(400, {
        res: resJson({
          error: 'missing_upload_length',
          message: 'Must contain Upload-Length or Upload-Defer-Length header',
          moreInfo: { requestId: this.requestId },
        }),
      })
    }

    if (!Number.isNaN(uploadDeferLength) && uploadDeferLength !== 1) {
      cloudlog({
        requestId: this.requestId,
        message: 'TUS initCreate - invalid Upload-Defer-Length',
        uploadDeferLength,
      })
      throw new HTTPException(400, {
        res: resJson({
          error: 'bad_upload_defer_length',
          message: 'Invalid Upload-Defer-Length value',
          moreInfo: { uploadDeferLength, requestId: this.requestId },
        }),
      })
    }

    cloudlog({
      requestId: this.requestId,
      message: 'TUS initCreate - validation complete',
      r2Key,
      uploadLength,
      hasContent,
    })

    return {
      r2Key,
      uploadLength,
      hasContent,
    }
  }

  // create a new TUS upload
  async create(url: string, headers: Headers, body: ReadableStream<Uint8Array> | null): Promise<Response> {
    return this.withLock(async () => {
      cloudlog({
        requestId: this.requestId,
        message: 'TUS create - start',
        url,
      })
      const uploadMetadata = parseUploadMetadata(this.requestId!, headers)
      cloudlog({
        requestId: this.requestId,
        message: 'TUS create - parsed metadata',
        metadata: uploadMetadata,
      })
      const checksum = parseChecksum(headers)
      cloudlog({
        requestId: this.requestId,
        message: 'TUS create - parsed checksum',
        checksum,
      })

      const { r2Key, uploadLength, hasContent } = await this.initCreate(body, headers, uploadMetadata)
      cloudlog({
        requestId: this.requestId,
        message: 'TUS create - initialized',
        r2Key,
        uploadLength,
        hasContent,
      })

      const uploadInfo: StoredUploadInfo = {}

      const expiration = new Date(Date.now() + UPLOAD_EXPIRATION_MS)
      await this.ctx.storage.setAlarm(expiration)
      if (!Number.isNaN(uploadLength)) {
        uploadInfo.uploadLength = uploadLength
      }
      if (checksum != null) {
        uploadInfo.checksum = checksum
      }
      await this.ctx.storage.kv.put(UPLOAD_OFFSET_KEY, 0)
      await this.ctx.storage.kv.put(UPLOAD_INFO_KEY, uploadInfo)

      const uploadLocation = new URL(r2Key, url.endsWith('/') ? url : `${url}/`)

      const uploadOffset = hasContent
        ? await this.appendBody(r2Key, body!, 0, uploadInfo)
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
    })
  }

  // get the current upload offset to resume an upload
  async head(r2Key: string): Promise<Response> {
    return this.withLock(async () => {
      cloudlog({ requestId: this.requestId, message: 'in DO head detected' })

      let offset: number | undefined = await this.ctx.storage.kv.get(UPLOAD_OFFSET_KEY)
      let uploadLength: number | undefined
      if (offset == null) {
        const headResponse = await this.retryBucket.head(r2Key)
        if (headResponse == null) {
          cloudlog({ requestId: this.requestId, message: 'in DO files head headResponse is null' })
          return quickError(404, 'not_found', 'Not Found')
        }
        offset = headResponse.size
        uploadLength = headResponse.size
      }
      else {
        const info: StoredUploadInfo | undefined = await this.ctx.storage.kv.get(UPLOAD_INFO_KEY)
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
    })
  }

  // append to the upload at the current upload offset
  async patch(r2Key: string, headers: Headers, body: ReadableStream<Uint8Array> | null): Promise<Response> {
    return this.withLock(async () => {
      cloudlog({ requestId: this.requestId, message: 'in DO patch', r2Key })

      let uploadOffset: number | undefined = await this.ctx.storage.kv.get(UPLOAD_OFFSET_KEY)
      if (uploadOffset == null) {
        cloudlog({ requestId: this.requestId, message: 'in DO files patch uploadOffset is null' })
        return new Response('Not Found', { status: 404 })
      }

      const headerOffset = readIntFromHeader(headers, 'Upload-Offset')
      if (uploadOffset !== headerOffset) {
        cloudlog({ requestId: this.requestId, message: 'in DO files patch incorrect upload offset' })
        return new Response('incorrect upload offset', { status: 409 })
      }

      const uploadInfo: StoredUploadInfo | undefined = await this.ctx.storage.kv.get(UPLOAD_INFO_KEY)
      if (uploadInfo == null) {
        throw new UnrecoverableError('existing upload should have had uploadInfo', r2Key)
      }
      const headerUploadLength = readIntFromHeader(headers, 'Upload-Length')
      if (uploadInfo.uploadLength != null && !Number.isNaN(headerUploadLength) && uploadInfo.uploadLength !== headerUploadLength) {
        cloudlog({ requestId: this.requestId, message: 'in DO files patch upload length cannot change' })
        return new Response('upload length cannot change', { status: 400 })
      }

      if (uploadInfo.uploadLength == null && !Number.isNaN(headerUploadLength)) {
        uploadInfo.uploadLength = headerUploadLength
        await this.ctx.storage.kv.put(UPLOAD_INFO_KEY, uploadInfo)
      }

      if (body == null) {
        cloudlog({ requestId: this.requestId, message: 'in DO files patch must provide request body' })
        return new Response('must provide request body', { status: 400 })
      }

      uploadOffset = await this.appendBody(r2Key, body, uploadOffset, uploadInfo)

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
    })
  }

  async switchOnPartKind(r2Key: string, uploadOffset: number, uploadInfo: StoredUploadInfo, part: Part, digester: Digester, checksum: Uint8Array | undefined) {
    switch (part.kind) {
      case 'intermediate': {
        this.multipart ??= await this.r2CreateMultipartUpload(r2Key, uploadInfo)
        this.parts.push({
          part: await this.r2UploadPart(r2Key, this.parts.length + 1, part.bytes),
          length: part.bytes.byteLength,
        })
        uploadOffset += part.bytes.byteLength
        const writePart = this.ctx.storage.kv.put(this.parts.length.toString(), this.parts.at(-1))
        const writeOffset = this.ctx.storage.kv.put(UPLOAD_OFFSET_KEY, uploadOffset)
        await Promise.all([writePart, writeOffset])
        break
      }
      case 'final':
      case 'error': {
        const finished = uploadInfo.uploadLength != null && uploadOffset + part.bytes.byteLength === uploadInfo.uploadLength
        if (!finished) {
          // write the partial part to a temporary object so we can rehydrate it
          // later, and then we're done
          await this.r2Put(this.tempkey(), part.bytes)
          uploadOffset += part.bytes.byteLength
          await this.ctx.storage.kv.put(UPLOAD_OFFSET_KEY, uploadOffset)
        }
        else if (!this.multipart) {
          // all the bytes fit into a single in memory buffer, so we can just upload
          // it directly without using multipart
          await this.r2Put(r2Key, part.bytes, checksum)
          uploadOffset += part.bytes.byteLength
          await this.cleanup()
        }
        else {
          // upload the last part (can be less than the 5mb min part size), then complete the upload
          const uploadedPart = await this.r2UploadPart(r2Key, this.parts.length + 1, part.bytes)
          this.parts.push({ part: uploadedPart, length: part.bytes.byteLength })
          await this.r2CompleteMultipartUpload(r2Key, await digester.digest(), checksum)
          uploadOffset += part.bytes.byteLength
          await this.cleanup()
        }
        break
      }
    }
    return uploadOffset
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
  // using multipart upload, R2 provides support for A and B directly. Otherwise, we support B by
  // adding custom metadata to the object when we create the multipart upload. For A, if the client manages to upload
  // the object in one-shot we calculate the digest as it comes in. Otherwise, after the multipart upload is
  // finished, we retrieve the object from R2 and recompute the digest.
  async appendBody(r2Key: string, body: ReadableStream<Uint8Array>, uploadOffset: number, uploadInfo: StoredUploadInfo): Promise<number> {
    if ((uploadInfo.uploadLength ?? 0) > MAX_UPLOAD_LENGTH_BYTES) {
      await this.cleanup(r2Key)
      cloudlog({ requestId: this.requestId, message: 'files append body Upload-Length exceeds maximum upload size' })
      throw new HTTPException(413, { message: 'Upload-Length exceeds maximum upload size' })
    }

    // We'll repeatedly use this to buffer data we'll send to R2
    const mem = new WritableStreamBuffer(new ArrayBuffer(BUFFER_SIZE))

    uploadOffset = await this.resumeUpload(r2Key, uploadOffset, uploadInfo, mem)

    const isSinglePart = uploadInfo.uploadLength != null && uploadInfo.uploadLength <= BUFFER_SIZE
    const checksum: Uint8Array | undefined = uploadInfo.checksum
    // optimization: only bother calculating the stream's checksum if the client provided it, and we're not resuming
    const digester: Digester = checksum != null && uploadOffset === 0 && !isSinglePart ? sha256Digester() : noopDigester()

    for await (const part of generateParts(this.requestId!, body, mem)) {
      const newLength = uploadOffset + part.bytes.byteLength
      if (uploadInfo.uploadLength != null && newLength > uploadInfo.uploadLength) {
        await this.cleanup(r2Key)
        cloudlog({ requestId: this.requestId, message: 'files append body body exceeds Upload-Length' })
        throw new HTTPException(413, { message: 'body exceeds Upload-Length' })
      }
      if (newLength > MAX_UPLOAD_LENGTH_BYTES) {
        await this.cleanup(r2Key)
        cloudlog({ requestId: this.requestId, message: 'files append body body exceeds maximum upload size' })
        throw new HTTPException(413, { message: 'body exceeds maximum upload size' })
      }

      await digester.update(part.bytes)
      uploadOffset = await this.switchOnPartKind(r2Key, uploadOffset, uploadInfo, part, digester, checksum)
    }
    return uploadOffset
  }

  // Check a checksum, throwing a 415 if the checksum does not match
  async checkChecksum(r2Key: string, expected: Uint8Array, actual: ArrayBuffer) {
    if (!Buffer.from(actual).equals(expected)) {
      await this.cleanup(r2Key)
      cloudlog({ requestId: this.requestId, message: 'files checksum checksum does not match' })
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
      const part: StoredR2Part | undefined = await this.ctx.storage.kv.get((this.parts.length + 1).toString())
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
    await this.ctx.storage.kv.put(UPLOAD_INFO_KEY, uploadInfo)
    return upload
  }

  r2ResumeMultipartUpload(r2Key: string, multipartUploadId: string): RetryMultipartUpload {
    return this.retryBucket.resumeMultipartUpload(r2Key, multipartUploadId)
  }

  async r2Put(r2Key: string, bytes: Uint8Array, checksum?: Uint8Array) {
    try {
      await this.retryBucket.put(r2Key, bytes, checksum as any)
    }
    catch (e) {
      if (isR2ChecksumError(e)) {
        cloudlogErr({ requestId: this.requestId, message: `checksum failure: ${e}` })
        await this.cleanup()
        cloudlog({ requestId: this.requestId, message: 'files put checksum failure' })
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
        // finished the transaction but failed to update the state afterwards. Either way, we should give up.
        throw new UnrecoverableError(`multipart upload does not exist ${e}`, r2Key)
      }
      throw e
    }
  }

  async r2CompleteMultipartUpload(r2Key: string, actualChecksum?: ArrayBuffer, expectedChecksum?: Uint8Array) {
    if (this.multipart == null) {
      throw new UnrecoverableError('cannot call complete multipart with no multipart upload', r2Key)
    }

    // If we were able to calculate the streaming digest, we can accept or reject now.
    if (actualChecksum != null && expectedChecksum != null) {
      await this.checkChecksum(r2Key, expectedChecksum, actualChecksum)
    }

    await this.multipart.complete(this.parts.map(storedPart => storedPart.part))

    // Otherwise we have to compute the digest from the finished upload
    if (actualChecksum == null && expectedChecksum != null) {
      await this.checkChecksum(r2Key, expectedChecksum, await this.retrieveChecksum(r2Key))
    }
  }

  tempkey(): string {
    return `temporary/${this.ctx.id.toString()}`
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
          await this.ctx.storage.kv.get(UPLOAD_OFFSET_KEY) ?? 0,
          await this.ctx.storage.kv.get(UPLOAD_INFO_KEY) ?? {},
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
    await this.ctx.storage.deleteAll()
    await this.ctx.storage.deleteAlarm()
  }

  // After this time, the upload can no longer be used
  async expirationTime(): Promise<Date> {
    const expiration = await this.ctx.storage.getAlarm()
    if (expiration == null) {
      return new Date()
    }
    return new Date(expiration)
  }
}

class UnrecoverableError extends Error {
  r2Key: string

  constructor(message: string, r2Key: string) {
    super(message)
    this.name = this.constructor.name
    this.r2Key = r2Key
  }
}
