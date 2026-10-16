export const MANIFEST_SIZE_RECEIPT_HEADER = 'X-Capgo-Manifest-Size-Receipt'
export const MANIFEST_RECEIPT_CLOCK_SKEW_MS = 5000

export function getManifestReceiptBucket(envName?: string): string {
  if (envName?.endsWith('-alpha'))
    return 'capgo-alpha'
  if (envName?.endsWith('-local'))
    return 'capgo-local'
  return 'capgo'
}

export interface ManifestSizeReceiptEvidence {
  size: number
  source: 'r2_read' | 'r2_upload'
  evidenceAt: number
  uploadedAt?: number
  etag?: string
  objectVersion?: string
}

export interface ManifestSizeReceiptFacts {
  version: 1 | 2
  size: number
  signedAt: number | null
  evidenceAt: number | null
  source: ManifestSizeReceiptEvidence['source'] | null
  uploadedAt: number | null
  etag: string | null
  // These are authenticated metadata digests, not raw inventory ETags or R2 versions.
  etagHash: string | null
  objectVersionHash: string | null
  objectIdentity: string | null
}

const encoder = new TextEncoder()
const algorithm = { name: 'HMAC', hash: 'SHA-256' } as const
// 60 fact bytes + 32 HMAC bytes encode to a 126-character v2 token. The
// bucket and exact key are part of the HMAC payload without inflating the token.
const FACT_BYTES = 60
const RAW_ETAG_FLAG = 0x80
const MAX_MULTIPART_PARTS = 10_000
const SIGNATURE_BYTES = 32
const VERIFY_CONCURRENCY = 32
const MAX_TIME = 2 ** 48 - 1
const key = (secret: string, usage: 'sign' | 'verify') => crypto.subtle.importKey('raw', encoder.encode(secret), algorithm, false, [usage])

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), char => char.charCodeAt(0))
}

function payload(bucket: string, path: string, facts: Uint8Array): Uint8Array<ArrayBuffer> {
  const identity = encoder.encode(`capgo-manifest-size:v2\n${JSON.stringify([bucket, path])}\n`)
  const bytes = new Uint8Array(identity.length + facts.length)
  bytes.set(identity)
  bytes.set(facts, identity.length)
  return bytes
}

function writeInteger(bytes: Uint8Array, offset: number, length: number, value: number) {
  for (let i = offset + length - 1; i >= offset; i--) {
    bytes[i] = value % 256
    value = Math.floor(value / 256)
  }
}

function readInteger(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0
  for (let i = offset; i < offset + length; i++)
    value = value * 256 + bytes[i]
  return value
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_TIME
}

function validFacts(facts: ManifestSizeReceiptFacts, now: number): boolean {
  if (!Number.isSafeInteger(facts.size) || facts.size < 0 || !validTime(facts.signedAt!) || !validTime(facts.evidenceAt!))
    return false
  if (facts.signedAt! > now + MANIFEST_RECEIPT_CLOCK_SKEW_MS)
    return false
  if (facts.uploadedAt != null && !validTime(facts.uploadedAt))
    return false
  if (facts.source === 'r2_read')
    return facts.evidenceAt! <= facts.signedAt!
  if (facts.source === 'r2_upload')
    return facts.uploadedAt != null && facts.uploadedAt <= facts.signedAt! + MANIFEST_RECEIPT_CLOCK_SKEW_MS && facts.evidenceAt === Math.floor(facts.uploadedAt / 1000) * 1000
  return false
}

async function metadataHash(value: string | undefined): Promise<Uint8Array> {
  if (!value)
    return new Uint8Array(16)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))).slice(0, 16)
}

function decodedHash(bytes: Uint8Array): string | null {
  return bytes.some(byte => byte !== 0) ? toBase64Url(bytes) : null
}

function canonicalEtag(etag: string | undefined): { bytes: Uint8Array, parts: number } | null {
  const match = /^([a-f\d]{32})(?:-([1-9]\d{0,4}))?$/.exec(etag ?? '')
  const parts = Number(match?.[2] ?? 0)
  if (!match || parts > MAX_MULTIPART_PARTS)
    return null
  return { bytes: Uint8Array.from(match[1].match(/../g)!, hex => Number.parseInt(hex, 16)), parts }
}

async function decodeFacts(bytes: Uint8Array): Promise<ManifestSizeReceiptFacts | null> {
  const source = bytes[0] & ~RAW_ETAG_FLAG
  const rawEtag = (bytes[0] & RAW_ETAG_FLAG) !== 0
  const parts = readInteger(bytes, 42, 2)
  if ((source !== 1 && source !== 2) || parts > MAX_MULTIPART_PARTS || (!rawEtag && parts !== 0))
    return null
  const hexEtag = rawEtag ? Array.from(bytes.slice(26, 42), byte => byte.toString(16).padStart(2, '0')).join('') : null
  const etag = hexEtag == null ? null : `${hexEtag}${parts ? `-${parts}` : ''}`
  const etagHash = etag == null ? decodedHash(bytes.slice(26, 42)) : decodedHash(await metadataHash(etag))
  const objectVersionHash = decodedHash(bytes.slice(44, 60))
  return {
    version: 2,
    size: readInteger(bytes, 1, 7),
    signedAt: readInteger(bytes, 8, 6),
    evidenceAt: readInteger(bytes, 14, 6),
    source: source === 1 ? 'r2_read' : 'r2_upload',
    uploadedAt: readInteger(bytes, 20, 6) || null,
    etag,
    etagHash,
    objectVersionHash,
    objectIdentity: etagHash || objectVersionHash ? `${etagHash ?? ''}.${objectVersionHash ?? ''}` : null,
  }
}

// R2 upload time can have coarser precision than the local clock. Rounding evidence
// down preserves that uncertainty; inventory admission also applies a clock margin.
export function manifestSizeReceiptEvidenceFromR2(object: R2Object, source: ManifestSizeReceiptEvidence['source'], readStartedAt?: number): ManifestSizeReceiptEvidence {
  const uploadedAt = object.uploaded.getTime()
  return {
    size: object.size,
    source,
    evidenceAt: source === 'r2_upload' ? Math.floor(uploadedAt / 1000) * 1000 : readStartedAt!,
    uploadedAt,
    etag: object.etag,
    objectVersion: object.version,
  }
}

export async function createManifestSizeReceipt(secret: string, bucket: string, path: string, evidence: ManifestSizeReceiptEvidence): Promise<string> {
  const signedAt = Date.now()
  const facts: ManifestSizeReceiptFacts = { ...evidence, version: 2, signedAt, uploadedAt: evidence.uploadedAt ?? null, etag: null, etagHash: null, objectVersionHash: null, objectIdentity: null }
  if (!secret || !bucket || !path || !validFacts(facts, signedAt))
    throw new Error('Cannot sign invalid manifest size receipt')
  const bytes = new Uint8Array(FACT_BYTES + SIGNATURE_BYTES)
  bytes[0] = evidence.source === 'r2_read' ? 1 : 2
  writeInteger(bytes, 1, 7, evidence.size)
  writeInteger(bytes, 8, 6, signedAt)
  writeInteger(bytes, 14, 6, evidence.evidenceAt)
  writeInteger(bytes, 20, 6, evidence.uploadedAt ?? 0)
  const etag = canonicalEtag(evidence.etag)
  if (etag) {
    bytes[0] |= RAW_ETAG_FLAG
    bytes.set(etag.bytes, 26)
    writeInteger(bytes, 42, 2, etag.parts)
  }
  else {
    bytes.set(await metadataHash(evidence.etag), 26)
  }
  bytes.set(await metadataHash(evidence.objectVersion), 44)
  bytes.set(new Uint8Array(await crypto.subtle.sign(algorithm, await key(secret, 'sign'), payload(bucket, path, bytes.slice(0, FACT_BYTES)))), FACT_BYTES)
  return `v2.${toBase64Url(bytes)}`
}

async function verify(verifyKey: CryptoKey, bucket: string, path: string, receipt: string): Promise<ManifestSizeReceiptFacts | null> {
  if (typeof receipt !== 'string' || receipt.length > 128 || !path)
    return null
  if (receipt.startsWith('v1.')) {
    const [version, rawSize, signature, extra] = receipt.split('.')
    const size = Number(rawSize)
    if (version !== 'v1' || extra !== undefined || !signature || !/^[\w-]{43}$/.test(signature) || String(size) !== rawSize || !Number.isSafeInteger(size) || size < 0)
      return null
    const legacyPayload = encoder.encode(`capgo-manifest-size:v1\n${path}\n${size}`)
    if (!await crypto.subtle.verify(algorithm, verifyKey, fromBase64Url(signature), legacyPayload))
      return null
    return { version: 1, size, signedAt: null, evidenceAt: null, source: null, uploadedAt: null, etag: null, etagHash: null, objectVersionHash: null, objectIdentity: null }
  }
  if (!bucket || !/^v2\.[\w-]{123}$/.test(receipt))
    return null
  const bytes = fromBase64Url(receipt.slice(3))
  if (toBase64Url(bytes) !== receipt.slice(3))
    return null
  if (!await crypto.subtle.verify(algorithm, verifyKey, bytes.slice(FACT_BYTES), payload(bucket, path, bytes.slice(0, FACT_BYTES))))
    return null
  const facts = await decodeFacts(bytes)
  return facts && validFacts(facts, Date.now()) ? facts : null
}

export async function verifyManifestSizeReceiptFacts(secret: string, bucket: string, entries: Array<{ path: string, receipt: string }>): Promise<ManifestSizeReceiptFacts[] | null> {
  if (!secret)
    return null
  const verifyKey = await key(secret, 'verify')
  const facts: ManifestSizeReceiptFacts[] = []
  // Avoid 10k simultaneous WebCrypto jobs for a normal full manifest.
  for (let offset = 0; offset < entries.length; offset += VERIFY_CONCURRENCY) {
    const batch = await Promise.all(entries.slice(offset, offset + VERIFY_CONCURRENCY).map(entry => verify(verifyKey, bucket, entry.path, entry.receipt)))
    if (batch.some(fact => fact == null))
      return null
    facts.push(...batch as ManifestSizeReceiptFacts[])
  }
  return facts
}

export async function verifyManifestSizeReceipts(secret: string, entries: Array<{ path: string, receipt: string }>, bucket = 'capgo'): Promise<number[] | null> {
  const facts = await verifyManifestSizeReceiptFacts(secret, bucket, entries)
  return facts?.map(fact => fact.size) ?? null
}
