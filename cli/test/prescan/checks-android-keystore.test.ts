// test/prescan/checks-android-keystore.test.ts
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'bun:test'
import { keystoreExpiry, keystoreOpens } from '../../src/build/prescan/checks/android-keystore'
import { MAX_CREDENTIAL_B64_CHARS } from '../../src/build/prescan/checks/blob-limit'
import { certDerFromP12, makeCtx, makeP12 } from './helpers'

function ctxWith(creds: Record<string, string>) {
  return makeCtx({ projectDir: '/tmp', platform: 'android', credentials: creds })
}

/** Minimal JKS with zero entries but a valid integrity hash for `password`. */
function makeEmptyJks(password: string): string {
  const head = Buffer.alloc(12)
  head.writeUInt32BE(0xFEEDFEED, 0) // magic
  head.writeUInt32BE(2, 4) // version
  head.writeUInt32BE(0, 8) // entry count
  const pwBytes = Buffer.from(password, 'utf16le').swap16() // utf-16BE
  const digest = createHash('sha1')
    .update(Buffer.concat([pwBytes, Buffer.from('Mighty Aphrodite', 'utf8'), head]))
    .digest()
  return Buffer.concat([head, digest]).toString('base64')
}

describe('android/keystore-opens', () => {
  it('opens a PKCS12 keystore with right password + alias', async () => {
    const p12 = makeP12({ password: 'store-pass' })
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: p12.base64,
      KEYSTORE_STORE_PASSWORD: 'store-pass',
      KEYSTORE_KEY_ALIAS: 'any',
    }))
    // forge p12s from makeP12 have no friendlyName aliases — alias check downgrades to skip
    expect(f.filter(x => x.severity === 'error')).toEqual([])
  })
  it('errors on wrong PKCS12 password', async () => {
    const p12 = makeP12({ password: 'store-pass' })
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: p12.base64,
      KEYSTORE_STORE_PASSWORD: 'nope',
      KEYSTORE_KEY_ALIAS: 'any',
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('password')
  })
  it('JKS integrity ok but alias missing (empty JKS) → alias error, not a password error', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeEmptyJks('secret'),
      KEYSTORE_STORE_PASSWORD: 'secret',
      KEYSTORE_KEY_ALIAS: 'k',
    }))
    // reaching the alias error proves the integrity hash matched the password
    expect(f[0]?.title).toContain('alias')
    expect(f[0]?.title).not.toContain('password')
  })
  it('errors on wrong JKS password', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeEmptyJks('secret'),
      KEYSTORE_STORE_PASSWORD: 'wrong',
      KEYSTORE_KEY_ALIAS: 'k',
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('password')
  })
  it('errors on garbage data', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: Buffer.from('garbage').toString('base64'),
      KEYSTORE_STORE_PASSWORD: 'x',
      KEYSTORE_KEY_ALIAS: 'k',
    }))
    expect(f[0]?.severity).toBe('error')
  })
})

describe('android/keystore-expiry', () => {
  it('warns when the PKCS12 signing cert expires before 2033-10-01', async () => {
    const p12 = makeP12({ password: 'p', notAfter: new Date('2030-01-01') })
    const f = await keystoreExpiry.run(ctxWith({ ANDROID_KEYSTORE_FILE: p12.base64, KEYSTORE_STORE_PASSWORD: 'p' }))
    expect(f[0]?.severity).toBe('warning')
  })
  it('passes long-validity certs', async () => {
    const p12 = makeP12({ password: 'p', notAfter: new Date('2055-01-01') })
    expect(await keystoreExpiry.run(ctxWith({ ANDROID_KEYSTORE_FILE: p12.base64, KEYSTORE_STORE_PASSWORD: 'p' }))).toEqual([])
  })
})

/**
 * JKS with ONE PrivateKeyEntry whose cert chain carries a real DER cert.
 * The parser never decrypts the protected key bytes (it skips them), so fake
 * key bytes keep this fixture pure-JS while still exercising the entry loop:
 * tag dispatch, alias extraction, and the key/cert-chain offset math.
 */
function makeJksWithEntry(password: string, alias: string, certDer: Buffer): string {
  const parts: Buffer[] = []
  const head = Buffer.alloc(12)
  head.writeUInt32BE(0xFEEDFEED, 0) // magic
  head.writeUInt32BE(2, 4) // version
  head.writeUInt32BE(1, 8) // entry count
  parts.push(head)
  const tag = Buffer.alloc(4)
  tag.writeUInt32BE(1, 0) // PrivateKeyEntry
  parts.push(tag)
  const aliasBuf = Buffer.from(alias, 'utf8')
  const aliasLen = Buffer.alloc(2)
  aliasLen.writeUInt16BE(aliasBuf.length, 0)
  parts.push(aliasLen, aliasBuf)
  parts.push(Buffer.alloc(8)) // timestamp
  const keyBytes = Buffer.from('opaque-protected-key-blob')
  const keyLen = Buffer.alloc(4)
  keyLen.writeUInt32BE(keyBytes.length, 0)
  parts.push(keyLen, keyBytes)
  const chainLen = Buffer.alloc(4)
  chainLen.writeUInt32BE(1, 0)
  parts.push(chainLen)
  const certType = Buffer.from('X.509', 'utf8')
  const certTypeLen = Buffer.alloc(2)
  certTypeLen.writeUInt16BE(certType.length, 0)
  parts.push(certTypeLen, certType)
  const certLen = Buffer.alloc(4)
  certLen.writeUInt32BE(certDer.length, 0)
  parts.push(certLen, certDer)
  const body = Buffer.concat(parts)
  const pwBytes = Buffer.from(password, 'utf16le').swap16() // utf-16BE
  const digest = createHash('sha1')
    // lgtm[js/weak-cryptographic-algorithm] JKS integrity digest is defined as SHA1 by the keystore format (test fixture reproducing it), not a security choice.
    .update(Buffer.concat([pwBytes, Buffer.from('Mighty Aphrodite', 'utf8'), body]))
    .digest()
  return Buffer.concat([body, digest]).toString('base64')
}

describe('android/keystore-opens — JKS entry parsing', () => {
  const certDer = certDerFromP12(makeP12({ notAfter: new Date('2030-06-01') }))
  it('passes when the requested alias exists in the JKS', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeJksWithEntry('secret', 'upload-key', certDer),
      KEYSTORE_STORE_PASSWORD: 'secret',
      KEYSTORE_KEY_ALIAS: 'upload-key',
    }))
    expect(f).toEqual([])
  })
  it('errors on a wrong alias, listing the available aliases', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeJksWithEntry('secret', 'upload-key', certDer),
      KEYSTORE_STORE_PASSWORD: 'secret',
      KEYSTORE_KEY_ALIAS: 'release-key',
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('release-key')
    expect(f[0]?.detail).toContain('upload-key')
  })
  it('errors on a wrong store password for an entry-bearing JKS', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeJksWithEntry('secret', 'upload-key', certDer),
      KEYSTORE_STORE_PASSWORD: 'wrong',
      KEYSTORE_KEY_ALIAS: 'upload-key',
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('password')
  })
})

describe('android/keystore-expiry — JKS cert validity', () => {
  it('warns when the JKS signing cert expires before Play\'s 2033-10-01 floor', async () => {
    const certDer = certDerFromP12(makeP12({ notAfter: new Date('2030-06-01') }))
    const f = await keystoreExpiry.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeJksWithEntry('secret', 'upload-key', certDer),
      KEYSTORE_STORE_PASSWORD: 'secret',
    }))
    expect(f[0]?.severity).toBe('warning')
    expect(f[0]?.title).toContain('2030-06-01')
  })
  it('passes a long-validity JKS cert', async () => {
    const certDer = certDerFromP12(makeP12({ notAfter: new Date('2055-01-01') }))
    const f = await keystoreExpiry.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeJksWithEntry('secret', 'upload-key', certDer),
      KEYSTORE_STORE_PASSWORD: 'secret',
    }))
    expect(f).toEqual([])
  })
})

describe('credential blob size cap (keystore)', () => {
  it('refuses an absurdly large keystore blob with a clear error', async () => {
    const huge = 'A'.repeat(MAX_CREDENTIAL_B64_CHARS + 1)
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: huge,
      KEYSTORE_STORE_PASSWORD: 'x',
      KEYSTORE_KEY_ALIAS: 'k',
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail).toContain('limit 10 MB')
  })
})
