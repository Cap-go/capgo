import { describe, expect, it } from 'bun:test'
import { Buffer } from 'node:buffer'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createRSA,
  encryptChecksum,
  encryptChecksumV3,
  encryptSource,
  generateSessionKey,
  sha256DigestMatchesComputed,
  verifyDecryptedBundleChecksum,
} from '../../src/api/crypto'
import { decryptZipInternal } from '../../src/bundle/decrypt'
import { getChecksum } from '../../src/checksum'

describe('sha256DigestMatchesComputed', () => {
  const computedHex = 'c5da7c794a1902f24ecc7399dc850f65d334421c8d80715505098cbc3ab97f4f'
  const v2Base64 = 'xdp8eUoZAvJOzHOZ3IUPZdM0QhyNgHFVBQmMvDq5f08='

  it('treats hex and base64 encodings of the same digest as equal', () => {
    expect(sha256DigestMatchesComputed(computedHex, computedHex)).toBe(true)
    expect(sha256DigestMatchesComputed(computedHex, v2Base64)).toBe(true)
    expect(sha256DigestMatchesComputed(computedHex, computedHex.toUpperCase())).toBe(true)
  })

  it('rejects a genuinely different digest', () => {
    const otherHex = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    expect(sha256DigestMatchesComputed(computedHex, otherHex)).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, Buffer.alloc(32, 0).toString('base64'))).toBe(false)
  })

  it('rejects empty, short, and malformed hex plaintext', () => {
    expect(sha256DigestMatchesComputed(computedHex, '')).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, computedHex.slice(0, 32))).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, `${computedHex}zz`)).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, 'not-a-hex-digest')).toBe(false)
  })

  it('rejects non-canonical base64 plaintext (base64url, unpadded, whitespace, junk)', () => {
    const unpadded = v2Base64.replace(/=+$/, '')
    const base64url = unpadded.replace(/\+/g, '-').replace(/\//g, '_')
    expect(sha256DigestMatchesComputed(computedHex, unpadded)).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, base64url)).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, ` ${v2Base64}`)).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, `${v2Base64}\n`)).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, `\0${v2Base64}`)).toBe(false)
    expect(sha256DigestMatchesComputed(computedHex, `${v2Base64}extra`)).toBe(false)
  })
})

describe('bundle decrypt --checksum', () => {
  async function prepareEncryptedBundle(encryptChecksumFn: (hex: string, privateKey: string) => string) {
    const { publicKey, privateKey } = createRSA()
    const zipContent = Buffer.from('capgo decrypt checksum regression payload')
    const checksumHex = await getChecksum(zipContent, 'sha256')
    const { sessionKey, ivSessionKey } = generateSessionKey(privateKey)
    const encryptedZip = encryptSource(zipContent, sessionKey, ivSessionKey)
    const encryptedChecksum = encryptChecksumFn(checksumHex, privateKey)

    const tempDir = mkdtempSync(join(tmpdir(), 'capgo-decrypt-checksum-'))
    const zipPath = join(tempDir, 'bundle.zip')
    const keyPath = join(tempDir, 'public.pem')
    writeFileSync(zipPath, encryptedZip)
    writeFileSync(keyPath, publicKey)

    return {
      tempDir,
      zipPath,
      keyPath,
      ivSessionKey,
      checksumHex,
      encryptedChecksum,
      publicKey,
      privateKey,
    }
  }

  it('verifies V3 checksum when updater version is unknown', async () => {
    const fixture = await prepareEncryptedBundle(encryptChecksumV3)
    try {
      const result = await decryptZipInternal(
        fixture.zipPath,
        fixture.ivSessionKey,
        { key: fixture.keyPath, checksum: fixture.encryptedChecksum },
        true,
      )
      expect(result.checksumMatches).toBe(true)
      const decryptedBytes = readFileSync(result.outputPath)
      expect(decryptedBytes.toString()).toBe('capgo decrypt checksum regression payload')
    }
    finally {
      rmSync(fixture.tempDir, { recursive: true, force: true })
    }
  })

  it('verifies V3 checksum when updater version is V3-capable', async () => {
    const fixture = await prepareEncryptedBundle(encryptChecksumV3)
    const packageJsonPath = join(fixture.tempDir, 'package.json')
    writeFileSync(packageJsonPath, JSON.stringify({
      dependencies: {
        '@capgo/capacitor-updater': '7.30.0',
      },
    }))
    try {
      const result = await decryptZipInternal(
        fixture.zipPath,
        fixture.ivSessionKey,
        {
          key: fixture.keyPath,
          checksum: fixture.encryptedChecksum,
          packageJson: packageJsonPath,
        },
        true,
      )
      expect(result.checksumMatches).toBe(true)
    }
    finally {
      rmSync(fixture.tempDir, { recursive: true, force: true })
    }
  })

  it('verifies V2 checksum plaintext encoding when ciphertext was produced with V2', async () => {
    const fixture = await prepareEncryptedBundle(encryptChecksum)
    try {
      const { matches } = verifyDecryptedBundleChecksum(
        fixture.checksumHex,
        fixture.encryptedChecksum,
        fixture.publicKey,
      )
      expect(matches).toBe(true)

      const result = await decryptZipInternal(
        fixture.zipPath,
        fixture.ivSessionKey,
        { key: fixture.keyPath, checksum: fixture.encryptedChecksum },
        true,
      )
      expect(result.checksumMatches).toBe(true)
    }
    finally {
      rmSync(fixture.tempDir, { recursive: true, force: true })
    }
  })

  it('fails when the decrypted checksum digest does not match the zip', async () => {
    const fixture = await prepareEncryptedBundle(encryptChecksumV3)
    const wrongHex = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    const wrongEncrypted = encryptChecksumV3(wrongHex, fixture.privateKey)
    try {
      await expect(decryptZipInternal(
        fixture.zipPath,
        fixture.ivSessionKey,
        { key: fixture.keyPath, checksum: wrongEncrypted },
        true,
      )).rejects.toThrow(/Checksum does not match/)
    }
    finally {
      rmSync(fixture.tempDir, { recursive: true, force: true })
    }
  })

  it('verifies checksum when the encrypted checksum ciphertext is base64 instead of hex', async () => {
    const fixture = await prepareEncryptedBundle(encryptChecksumV3)
    const base64Ciphertext = Buffer.from(fixture.encryptedChecksum, 'hex').toString('base64')
    try {
      const result = await decryptZipInternal(
        fixture.zipPath,
        fixture.ivSessionKey,
        { key: fixture.keyPath, checksum: base64Ciphertext },
        true,
      )
      expect(result.checksumMatches).toBe(true)
    }
    finally {
      rmSync(fixture.tempDir, { recursive: true, force: true })
    }
  })

  it('reproduces the production false mismatch scenario (hex vs base64 plaintext)', () => {
    const computedHex = 'c5da7c794a1902f24ecc7399dc850f65d334421c8d80715505098cbc3ab97f4f'
    const v2Plaintext = 'xdp8eUoZAvJOzHOZ3IUPZdM0QhyNgHFVBQmMvDq5f08='
    expect(sha256DigestMatchesComputed(computedHex, v2Plaintext)).toBe(true)
    expect(computedHex === v2Plaintext).toBe(false)
  })
})
