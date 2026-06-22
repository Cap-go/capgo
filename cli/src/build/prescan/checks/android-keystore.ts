// src/build/prescan/checks/android-keystore.ts
import type { Finding, PrescanCheck, ScanContext } from '../types'
import { createHash } from 'node:crypto'
import forge from 'node-forge'
import { assertCredentialBlobSize } from './blob-limit'

const JKS_MAGIC = 0xFEEDFEED

type KeystoreKind = 'jks' | 'pkcs12' | 'unknown'

function keystoreKind(buf: Buffer): KeystoreKind {
  if (buf.length >= 4 && buf.readUInt32BE(0) === JKS_MAGIC)
    return 'jks'
  if (buf.length >= 1 && buf[0] === 0x30)
    return 'pkcs12' // ASN.1 SEQUENCE
  return 'unknown'
}

interface JksResult { passwordOk: boolean, aliases: string[], certsDer: Buffer[] }

/** Minimal read-only JKS reader: integrity hash + alias list + trusted/PrivateKey cert chains. */
function readJks(buf: Buffer, password: string): JksResult {
  const body = buf.subarray(0, buf.length - 20)
  const stored = buf.subarray(buf.length - 20)
  const pwBytes = Buffer.from(password, 'utf16le').swap16()
  const computed = createHash('sha1').update(Buffer.concat([pwBytes, Buffer.from('Mighty Aphrodite', 'utf8'), body])).digest()
  const passwordOk = computed.equals(stored)

  const aliases: string[] = []
  const certsDer: Buffer[] = []
  let off = 8
  const count = buf.readUInt32BE(off)
  off += 4
  for (let i = 0; i < count && off < body.length; i++) {
    const tag = buf.readUInt32BE(off)
    off += 4
    const aliasLen = buf.readUInt16BE(off)
    off += 2
    aliases.push(buf.subarray(off, off + aliasLen).toString('utf8'))
    off += aliasLen
    off += 8 // timestamp
    if (tag === 1) { // PrivateKeyEntry: key bytes + cert chain
      const keyLen = buf.readUInt32BE(off)
      off += 4 + keyLen
      const chainLen = buf.readUInt32BE(off)
      off += 4
      for (let c = 0; c < chainLen; c++) {
        const typeLen = buf.readUInt16BE(off)
        off += 2 + typeLen
        const certLen = buf.readUInt32BE(off)
        off += 4
        certsDer.push(buf.subarray(off, off + certLen))
        off += certLen
      }
    }
    else { // trustedCertEntry
      const typeLen = buf.readUInt16BE(off)
      off += 2 + typeLen
      const certLen = buf.readUInt32BE(off)
      off += 4
      certsDer.push(buf.subarray(off, off + certLen))
      off += certLen
    }
  }
  return { passwordOk, aliases, certsDer }
}

interface OpenedKeystore { kind: KeystoreKind, aliases: string[], notAfter: Date | null }

// A scan opens the same keystore twice (keystore-opens, keystore-expiry) and
// the PKCS12 KDF is expensive — memoize per input.
const KS_CACHE_MAX = 4
const ksCache = new Map<string, { value?: OpenedKeystore, error?: unknown }>()

function openKeystore(base64: string, storePassword: string): OpenedKeystore {
  const cacheKey = `${storePassword}\u0000${base64}`
  const cached = ksCache.get(cacheKey)
  if (cached) {
    if (cached.error !== undefined)
      throw cached.error
    return cached.value!
  }
  try {
    const value = openKeystoreUncached(base64, storePassword)
    rememberKs(cacheKey, { value })
    return value
  }
  catch (error) {
    rememberKs(cacheKey, { error })
    throw error
  }
}

function rememberKs(key: string, entry: { value?: OpenedKeystore, error?: unknown }): void {
  if (ksCache.size >= KS_CACHE_MAX)
    ksCache.delete(ksCache.keys().next().value!)
  ksCache.set(key, entry)
}

function openKeystoreUncached(base64: string, storePassword: string): OpenedKeystore {
  assertCredentialBlobSize(base64, 'keystore')
  const buf = Buffer.from(base64, 'base64')
  const kind = keystoreKind(buf)
  if (kind === 'jks') {
    const jks = readJks(buf, storePassword)
    if (!jks.passwordOk)
      throw new Error('JKS integrity check failed — wrong store password')
    let notAfter: Date | null = null
    for (const der of jks.certsDer) {
      try {
        const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary'))))
        if (!notAfter || cert.validity.notAfter < notAfter)
          notAfter = cert.validity.notAfter
      }
      catch { /* unparseable cert: skip */ }
    }
    return { kind, aliases: jks.aliases, notAfter }
  }
  if (kind === 'pkcs12') {
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(buf.toString('binary')), storePassword) // throws on wrong password
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
    const aliases = bags.map(b => (b.attributes?.friendlyName?.[0] as string | undefined) ?? '').filter(Boolean)
    let notAfter: Date | null = null
    for (const b of bags) {
      if (b.cert && (!notAfter || b.cert.validity.notAfter < notAfter))
        notAfter = b.cert.validity.notAfter
    }
    return { kind, aliases, notAfter }
  }
  throw new Error('Unrecognized keystore format (expected JKS or PKCS12)')
}

const hasKeystore = (ctx: ScanContext) => Boolean(ctx.credentials?.ANDROID_KEYSTORE_FILE)
const storePassword = (ctx: ScanContext) => ctx.credentials?.KEYSTORE_STORE_PASSWORD ?? ctx.credentials?.KEYSTORE_KEY_PASSWORD ?? ''

export const keystoreOpens: PrescanCheck = {
  id: 'android/keystore-opens',
  platforms: ['android'],
  appliesTo: hasKeystore,
  async run(ctx): Promise<Finding[]> {
    let ks: OpenedKeystore
    try {
      ks = openKeystore(ctx.credentials!.ANDROID_KEYSTORE_FILE, storePassword(ctx))
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const pw = /password|mac|integrity/i.test(msg)
      return [{
        id: 'android/keystore-opens',
        severity: 'error',
        title: pw ? 'The keystore cannot be opened with the saved store password' : 'The saved keystore is not a valid JKS/PKCS12 file',
        detail: msg,
        fix: 'Verify the keystore file and --keystore-store-password, then re-run `build credentials save`',
      }]
    }
    const alias = ctx.credentials?.KEYSTORE_KEY_ALIAS
    // JKS alias lists are plaintext and authoritative even when empty; PKCS12 files often
    // carry no friendlyName attributes, so an empty PKCS12 alias list downgrades to skip.
    const aliasListAuthoritative = ks.kind === 'jks' || ks.aliases.length > 0
    if (alias && aliasListAuthoritative && !ks.aliases.includes(alias)) {
      return [{
        id: 'android/keystore-opens',
        severity: 'error',
        title: `Key alias "${alias}" not found in the keystore`,
        detail: `available aliases: ${ks.aliases.join(', ') || '(none)'}`,
        fix: 'Use one of the existing aliases or the correct keystore file',
      }]
    }
    return []
  },
}

const PLAY_MIN_VALIDITY = new Date('2033-10-01')

export const keystoreExpiry: PrescanCheck = {
  id: 'android/keystore-expiry',
  platforms: ['android'],
  appliesTo: hasKeystore,
  async run(ctx): Promise<Finding[]> {
    let ks: OpenedKeystore
    try {
      ks = openKeystore(ctx.credentials!.ANDROID_KEYSTORE_FILE, storePassword(ctx))
    }
    catch {
      return [] // keystore-opens owns the failure
    }
    if (ks.notAfter && ks.notAfter < PLAY_MIN_VALIDITY) {
      return [{
        id: 'android/keystore-expiry',
        severity: 'warning',
        title: `Signing certificate validity ends ${ks.notAfter.toISOString().slice(0, 10)} — Play requires validity through Oct 2033 for new apps`,
        fix: 'Generate a keystore with ≥25y validity (keytool -validity 10000) for new apps',
      }]
    }
    return []
  },
}
