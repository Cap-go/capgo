import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as receipts from '../supabase/functions/_backend/utils/manifest_size_receipt.ts'

const bucket = 'attachments'
const path = 'orgs/org/apps/com.app/delta/hash_index.html'
const now = 1_800_000_000_999
const evidence = { size: 321, source: 'r2_read' as const, evidenceAt: now - 20_000, uploadedAt: now - 60_000, etag: 'etag', objectVersion: 'object-version' }

afterEach(() => vi.restoreAllMocks())

describe('manifest size receipts', () => {
  it('maps deployment names to the physical R2 bucket', () => {
    expect(receipts.getManifestReceiptBucket('capgo_files-prod')).toBe('capgo')
    expect(receipts.getManifestReceiptBucket('capgo_api-preprod')).toBe('capgo')
    expect(receipts.getManifestReceiptBucket('capgo_files-alpha')).toBe('capgo-alpha')
    expect(receipts.getManifestReceiptBucket('capgo_api-local')).toBe('capgo-local')
  })
  it('mints only compact v2 receipts with distinct signing and original evidence times', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const receipt = await receipts.createManifestSizeReceipt('secret', bucket, path, evidence).catch(() => null)
    expect(receipt).toMatch(/^v2\./)
    expect(receipt!.length).toBeLessThanOrEqual(128)
    expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt: receipt! }])).toEqual([
      expect.objectContaining({ version: 2, size: 321, source: 'r2_read', signedAt: now, evidenceAt: evidence.evidenceAt, uploadedAt: evidence.uploadedAt, etagHash: expect.any(String), objectIdentity: expect.any(String) }),
    ])
    expect(await receipts.verifyManifestSizeReceipts('secret', [{ path, receipt: receipt! }], bucket)).toEqual([321])
  })

  it('authenticates the bucket, exact physical path, and every encoded fact', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const receipt = await receipts.createManifestSizeReceipt('secret', bucket, path, evidence)
    expect(await receipts.verifyManifestSizeReceiptFacts('wrong-secret', bucket, [{ path, receipt }])).toBeNull()
    expect(await receipts.verifyManifestSizeReceiptFacts('secret', 'other-bucket', [{ path, receipt }])).toBeNull()
    expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path: `${path}.changed`, receipt }])).toBeNull()
    const bytes = Buffer.from(receipt.slice(3), 'base64url')
    for (const offset of [0, 1, 8, 14, 20, 26, 42, 44, 60]) {
      const modified = Buffer.from(bytes)
      modified[offset] ^= 1
      expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt: `v2.${modified.toString('base64url')}` }])).toBeNull()
    }
    for (const invalid of [`${receipt}x`, 'v2.', `v2.${'a'.repeat(129)}`, receipt.replace('v2.', 'v3.')])
      expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt: invalid }])).toBeNull()
  })

  it.each(['d41d8cd98f00b204e9800998ecf8427e', `${'a'.repeat(32)}-1`, `${'b'.repeat(32)}-10000`, '0'.repeat(32)])('losslessly retains canonical R2 ETag %s', async (etag) => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const receipt = await receipts.createManifestSizeReceipt('secret', bucket, path, { ...evidence, etag, size: Number.MAX_SAFE_INTEGER })
    expect(receipt.length).toBe(126)
    const expectedHash = Buffer.from(createHash('sha256').update(etag).digest().subarray(0, 16)).toString('base64url')
    expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt }])).toEqual([
      expect.objectContaining({ etag, etagHash: expectedHash, size: Number.MAX_SAFE_INTEGER, source: 'r2_read' }),
    ])
    const bytes = Buffer.from(receipt.slice(3), 'base64url')
    for (const offset of [0, 26, 42, 44, 60]) {
      const modified = Buffer.from(bytes)
      modified[offset] ^= 1
      expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt: `v2.${modified.toString('base64url')}` }])).toBeNull()
    }
  })

  it.each(['unusual-provider-etag', `${'a'.repeat(32)}-10001`, `${'a'.repeat(32)}-01`, 'A'.repeat(32)])('retains an authenticated digest for unusual ETag %s', async (etag) => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const receipt = await receipts.createManifestSizeReceipt('secret', bucket, path, { ...evidence, etag })
    expect(receipt.length).toBe(126)
    expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt }])).toEqual([
      expect.objectContaining({ etag: null, etagHash: Buffer.from(createHash('sha256').update(etag).digest().subarray(0, 16)).toString('base64url'), objectIdentity: expect.any(String) }),
    ])
  })

  it('uses the returned upload time conservatively, independently from local signing time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const uploadedAt = now - 30_123
    const receipt = await receipts.createManifestSizeReceipt('secret', bucket, path, { ...evidence, source: 'r2_upload', uploadedAt, evidenceAt: Math.floor(uploadedAt / 1000) * 1000 })
    expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt }])).toEqual([
      expect.objectContaining({ source: 'r2_upload', evidenceAt: Math.floor(uploadedAt / 1000) * 1000, uploadedAt, signedAt: now }),
    ])
  })

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid confirmed size %s', async (size) => {
    await expect(receipts.createManifestSizeReceipt('secret', bucket, path, { ...evidence, size })).rejects.toThrow()
  })

  it.each([0, Number.MAX_SAFE_INTEGER])('supports the safe integer size bound %s', async (size) => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const receipt = await receipts.createManifestSizeReceipt('secret', bucket, path, { ...evidence, size, etag: 'a'.repeat(32) })
    expect(receipt.length).toBeLessThanOrEqual(128)
    expect(await receipts.verifyManifestSizeReceipts('secret', [{ path, receipt }], bucket)).toEqual([size])
  })

  it('rejects contradictory or future evidence instead of promoting it', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    for (const invalid of [
      { ...evidence, evidenceAt: now + 1 },
      { ...evidence, source: 'r2_upload' as const, uploadedAt: now + 5001, evidenceAt: Math.floor((now + 5001) / 1000) * 1000 },
      { ...evidence, source: 'r2_upload' as const, uploadedAt: undefined },
      { ...evidence, source: 'r2_upload' as const },
      { ...evidence, evidenceAt: 1.5 },
    ])
      await expect(receipts.createManifestSizeReceipt('secret', bucket, path, invalid)).rejects.toThrow()
  })

  it('verifies a published v1 fixture without inventing inventory evidence', async () => {
    const receipt = 'v1.321.wfTnhej8G_bggiavsZgmiJUqvvPtJzzd7gQHwBeBzNU'
    expect(await receipts.verifyManifestSizeReceipts('secret', [{ path, receipt }])).toEqual([321])
    expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt }])).toEqual([
      { version: 1, size: 321, signedAt: null, evidenceAt: null, source: null, uploadedAt: null, etag: null, etagHash: null, objectVersionHash: null, objectIdentity: null },
    ])
  })

  it('verifies a 10k-entry manifest with bounded cryptographic concurrency and stable order', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const receipt = await receipts.createManifestSizeReceipt('secret', bucket, path, evidence)
    const originalVerify = crypto.subtle.verify.bind(crypto.subtle)
    let active = 0
    let maximum = 0
    vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
      maximum = Math.max(maximum, ++active)
      try {
        return await originalVerify(...args)
      }
      finally {
        active--
      }
    })
    const facts = await receipts.verifyManifestSizeReceiptFacts('secret', bucket, Array.from({ length: 10_000 }, () => ({ path, receipt })))
    expect(facts).toHaveLength(10_000)
    expect(facts?.every(fact => fact.size === 321)).toBe(true)
    expect(maximum).toBeLessThanOrEqual(32)
    expect(await receipts.verifyManifestSizeReceiptFacts('secret', bucket, [{ path, receipt }, { path, receipt: `${receipt}x` }])).toBeNull()
  })
})
