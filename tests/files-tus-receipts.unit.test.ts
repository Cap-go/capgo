import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyManifestSizeReceiptFacts } from '../supabase/functions/_backend/utils/manifest_size_receipt.ts'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: any
    env: any
    constructor(ctx: any, env: any) {
      this.ctx = ctx
      this.env = env
    }
  },
}))
vi.mock('hono/adapter', async importOriginal => ({
  ...await importOriginal<typeof import('hono/adapter')>(),
  getRuntimeKey: () => 'workerd',
}))
vi.mock('../supabase/functions/_backend/utils/discord.ts', () => ({
  sendDiscordAlert500: vi.fn(async () => {}),
  sendDiscordAlert: vi.fn(async () => {}),
}))

const path = 'orgs/test-org/apps/com.test.receipts/delta/hash_index.html'
const now = 1_800_000_000_000

function object(size: number, uploadedAt = now + 10_123): R2Object {
  return { key: path, size, uploaded: new Date(uploadedAt), etag: 'etag', httpEtag: '"etag"', version: 'r2-version', storageClass: 'Standard', checksums: { toJSON: () => ({}) }, customMetadata: {}, httpMetadata: {}, writeHttpMetadata: () => {} } as R2Object
}

async function setup(size?: number) {
  const { UploadHandler } = await import('../supabase/functions/_backend/files/uploadHandler.ts')
  const { UPLOAD_INFO_KEY, UPLOAD_OFFSET_KEY, TUS_VERSION } = await import('../supabase/functions/_backend/files/util.ts')
  const data = new Map<string, unknown>()
  if (size != null) {
    data.set(UPLOAD_INFO_KEY, { uploadLength: size })
    data.set(UPLOAD_OFFSET_KEY, 0)
  }
  const storage = {
    get: async (key: string) => data.get(key),
    put: async (key: string, value: unknown) => { data.set(key, value) },
    deleteAll: async () => data.clear(),
    deleteAlarm: async () => {},
    setAlarm: async () => {},
    getAlarm: async () => now + 86_400_000,
  }
  const multipart = {
    uploadId: 'multipart-id',
    uploadPart: vi.fn(async (partNumber: number) => ({ partNumber, etag: `part-${partNumber}` })),
    complete: vi.fn(async () => object(size!)),
    abort: vi.fn(async () => {}),
  }
  const bucket = {
    put: vi.fn(async () => object(size!)),
    head: vi.fn(async () => object(size!)),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => {}),
    createMultipartUpload: vi.fn(async () => multipart),
    resumeMultipartUpload: vi.fn(() => multipart),
  }
  const handler = new UploadHandler({ id: { toString: () => 'test-upload' }, storage, waitUntil: () => {} } as any, {
    ATTACHMENT_BUCKET: bucket as any,
    MANIFEST_SIZE_RECEIPT_SECRET: 'receipt-secret',
    ENV_NAME: 'capgo_files-prod',
  } as any)
  const patch = (length: number) => handler.fetch(new Request(`http://localhost/files/upload/attachments/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/offset+octet-stream', 'Tus-Resumable': TUS_VERSION, 'Upload-Length': String(size), 'Upload-Offset': '0' },
    body: new Uint8Array(length),
  }))
  return { handler, bucket, multipart, patch, TUS_VERSION }
}

afterEach(() => vi.restoreAllMocks())

describe('tus provider evidence receipts', () => {
  it('retains the metadata returned by direct R2 writes', async () => {
    const { handler } = await setup(5)
    expect(await handler.r2Put({ get: () => 'test' } as any, path, new Uint8Array(5))).toMatchObject({ key: path, size: 5, uploaded: new Date(now + 10_123), etag: 'etag', version: 'r2-version' })
  })

  it('retains the metadata returned by successful multipart completion', async () => {
    const { handler, multipart } = await setup(5)
    handler.multipart = { complete: multipart.complete } as any
    handler.parts = [{ length: 5, part: { partNumber: 1, etag: 'part-1' } }]
    expect(await handler.r2CompleteMultipartUpload({ get: () => 'test' } as any, path)).toMatchObject({ key: path, size: 5, uploaded: new Date(now + 10_123), etag: 'etag', version: 'r2-version' })
    expect(multipart.complete).toHaveBeenCalledWith([{ partNumber: 1, etag: 'part-1' }])
  })

  it('mints a direct upload receipt from returned uploaded time after success', async () => {
    let clock = now
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const { bucket, patch } = await setup(5)
    bucket.put.mockImplementation(async () => {
      clock = now + 30_000
      return object(5)
    })
    const response = await patch(5)
    expect(response.status).toBe(204)
    const receipt = response.headers.get('x-capgo-manifest-size-receipt')!
    expect(await verifyManifestSizeReceiptFacts('receipt-secret', 'capgo', [{ path, receipt }])).toEqual([
      expect.objectContaining({ size: 5, source: 'r2_upload', signedAt: now + 30_000, uploadedAt: now + 10_123, evidenceAt: now + 10_000 }),
    ])
    expect(bucket.head).not.toHaveBeenCalled()
  })

  it('mints multipart completion evidence from returned provider metadata', async () => {
    let clock = now
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const { BUFFER_SIZE } = await import('../supabase/functions/_backend/files/util.ts')
    const size = BUFFER_SIZE + 1
    const { multipart, patch, bucket } = await setup(size)
    multipart.complete.mockImplementation(async () => {
      clock = now + 30_000
      return object(size)
    })
    const response = await patch(size)
    expect(response.status).toBe(204)
    expect(await verifyManifestSizeReceiptFacts('receipt-secret', 'capgo', [{ path, receipt: response.headers.get('x-capgo-manifest-size-receipt')! }])).toEqual([
      expect.objectContaining({ size, source: 'r2_upload', signedAt: now + 30_000, uploadedAt: now + 10_123, evidenceAt: now + 10_000 }),
    ])
    expect(multipart.complete).toHaveBeenCalled()
    expect(bucket.head).not.toHaveBeenCalled()
  })

  it('does not mint completion evidence for a temporary partial upload', async () => {
    const { patch } = await setup(10)
    const response = await patch(5)
    expect(response.status).toBe(204)
    expect(response.headers.get('x-capgo-manifest-size-receipt')).toBeNull()
  })

  it('does not attest declared upload size when R2 returned a different size', async () => {
    const { patch, bucket } = await setup(5)
    bucket.put.mockResolvedValue(object(4, Date.now() - 1000))
    const response = await patch(5)
    expect(response.status).toBe(204)
    expect(response.headers.get('x-capgo-manifest-size-receipt')).toBeNull()
  })

  it('uses one exact-key read receipt only when upload clock uncertainty prevents write evidence', async () => {
    const { patch, bucket } = await setup(5)
    bucket.put.mockResolvedValue(object(5, Date.now() + 10_000))
    bucket.head.mockResolvedValue(object(5, Date.now() + 10_000))
    const response = await patch(5)
    expect(response.status).toBe(204)
    expect(await verifyManifestSizeReceiptFacts('receipt-secret', 'capgo', [{ path, receipt: response.headers.get('x-capgo-manifest-size-receipt')! }])).toEqual([expect.objectContaining({ source: 'r2_read', size: 5 })])
    expect(bucket.head).toHaveBeenCalledExactlyOnceWith(path)
  })

  it('fails clearly when an exceptional exact-key read cannot attest a completed upload', async () => {
    const { patch, bucket } = await setup(5)
    bucket.put.mockResolvedValue(object(5, Date.now() + 10_000))
    bucket.head.mockResolvedValue(null as any)
    const response = await patch(5)
    expect(response.status).toBe(503)
    expect(response.headers.get('x-capgo-manifest-size-receipt')).toBeNull()
  })

  it('confirms empty create uploads using successful put metadata', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now + 30_000)
    const { handler, bucket, TUS_VERSION } = await setup()
    bucket.put.mockResolvedValue(object(0))
    const response = await handler.fetch(new Request('http://localhost/files/upload/attachments', {
      method: 'POST',
      headers: { 'Upload-Length': '0', 'Upload-Metadata': `filename ${btoa(path)}`, 'Tus-Resumable': TUS_VERSION },
    }))
    expect(response.status).toBe(201)
    expect(await verifyManifestSizeReceiptFacts('receipt-secret', 'capgo', [{ path, receipt: response.headers.get('x-capgo-manifest-size-receipt')! }])).toEqual([
      expect.objectContaining({ size: 0, source: 'r2_upload', uploadedAt: now + 10_123 }),
    ])
  })

  it('uses new metadata read evidence for a resumed HEAD rather than stored offsets', async () => {
    let clock = now
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const { handler, bucket, TUS_VERSION } = await setup()
    bucket.head.mockImplementation(async () => {
      clock += 10_000
      return object(5, now - 60_000)
    })
    const response = await handler.fetch(new Request(`http://localhost/files/upload/attachments/${path}`, { method: 'HEAD', headers: { 'Tus-Resumable': TUS_VERSION } }))
    expect(response.status).toBe(200)
    expect(await verifyManifestSizeReceiptFacts('receipt-secret', 'capgo', [{ path, receipt: response.headers.get('x-capgo-manifest-size-receipt')! }])).toEqual([
      expect.objectContaining({ size: 5, source: 'r2_read', evidenceAt: now, signedAt: now + 10_000, uploadedAt: now - 60_000 }),
    ])
    expect(bucket.head).toHaveBeenCalledTimes(1)
  })
})
