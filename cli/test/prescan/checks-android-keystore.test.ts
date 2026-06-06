// test/prescan/checks-android-keystore.test.ts
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'bun:test'
import { keystoreExpiry, keystoreOpens } from '../../src/build/prescan/checks/android-keystore'
import { makeCtx, makeP12 } from './helpers'

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
  it('verifies JKS integrity hash (right password passes)', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeEmptyJks('secret'),
      KEYSTORE_STORE_PASSWORD: 'secret',
      KEYSTORE_KEY_ALIAS: 'k',
    }))
    // empty JKS: integrity ok, alias missing → error mentions the alias
    expect(f[0]?.detail ?? f[0]?.title ?? '').toContain('alias')
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
