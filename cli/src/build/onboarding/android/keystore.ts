// src/build/onboarding/android/keystore.ts
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import forge from 'node-forge'

export interface KeystoreDname {
  commonName: string
  organizationName?: string
  countryCode?: string
}

export interface KeystoreOptions {
  alias: string
  storePassword: string
  keyPassword: string
  dname: KeystoreDname
  /** Default: 27 years (~10000 days, Android Play standard) */
  validityYears?: number
  /** Default: 2048-bit RSA */
  keySize?: number
}

export interface KeystoreResult {
  p12Base64: string
  p12Bytes: Buffer
  alias: string
  notAfter: Date
}

const DEFAULT_VALIDITY_YEARS = 27
const DEFAULT_KEY_SIZE = 2048
const RANDOM_PASSWORD_BYTES = 24

/**
 * Generate a URL-safe random password suitable for Android keystore use.
 * 24 bytes → 32-char base64url string. Collision-resistant, never written in logs.
 */
export function generateRandomPassword(): string {
  return crypto.randomBytes(RANDOM_PASSWORD_BYTES).toString('base64url')
}

/**
 * Generate a PKCS#12 (.p12) keystore with a self-signed certificate.
 *
 * Key decisions:
 * - 3DES encryption for Gradle/keytool compatibility (same as iOS csr.ts).
 * - 27-year validity — Google Play requires keys to outlive all future app updates.
 * - 2048-bit RSA — standard for Android app signing.
 * - Subject/issuer identical (self-signed).
 *
 * Throws if alias or passwords are empty.
 */
export function generateKeystore(options: KeystoreOptions): KeystoreResult {
  if (!options.alias)
    throw new Error('keystore alias is required')
  if (!options.storePassword)
    throw new Error('keystore store password is required')
  if (!options.keyPassword)
    throw new Error('keystore key password is required')
  if (!options.dname.commonName)
    throw new Error('keystore common name is required')

  const keySize = options.keySize ?? DEFAULT_KEY_SIZE
  const validityYears = options.validityYears ?? DEFAULT_VALIDITY_YEARS

  const keys = forge.pki.rsa.generateKeyPair(keySize)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = crypto.randomBytes(16).toString('hex')

  const notBefore = new Date()
  const notAfter = new Date(notBefore)
  notAfter.setFullYear(notBefore.getFullYear() + validityYears)
  cert.validity.notBefore = notBefore
  cert.validity.notAfter = notAfter

  const subject: forge.pki.CertificateField[] = [
    { name: 'commonName', value: options.dname.commonName },
  ]
  if (options.dname.organizationName)
    subject.push({ name: 'organizationName', value: options.dname.organizationName })
  if (options.dname.countryCode)
    subject.push({ name: 'countryName', value: options.dname.countryCode })

  cert.setSubject(subject)
  cert.setIssuer(subject)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  // Attach the alias as a friendlyName so tools (and our own listKeystoreAliases)
  // can read it back without the user having to remember it.
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    options.storePassword,
    { algorithm: '3des', friendlyName: options.alias },
  )
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes()
  const p12Bytes = Buffer.from(p12Der, 'binary')

  return {
    p12Base64: forge.util.encode64(p12Der),
    p12Bytes,
    alias: options.alias,
    notAfter,
  }
}

/**
 * Parse a PKCS#12 keystore from base64 and verify the password + key integrity.
 * Used by tests — also useful if we ever need to validate a user-supplied keystore.
 */
export function verifyKeystore(p12Base64: string, password: string): { valid: boolean, reason?: string } {
  try {
    const p12Der = forge.util.decode64(p12Base64)
    const p12Asn1 = forge.asn1.fromDer(p12Der)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    const hasKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.length
    const hasCert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.length
    if (!hasKey)
      return { valid: false, reason: 'no private key' }
    if (!hasCert)
      return { valid: false, reason: 'no certificate' }
    return { valid: true }
  }
  catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : 'parse failed' }
  }
}

export type ListAliasesResult
  = | { ok: true, aliases: string[] }
    | { ok: false, reason: 'wrong-password' | 'unsupported-format' | 'parse-error', message: string }

/**
 * Extract key aliases (PKCS#12 `friendlyName` attributes) from a keystore file.
 *
 * Works for PKCS#12 (.p12, .pfx) keystores. JKS (Java KeyStore — common for
 * .jks / .keystore files created by `keytool`) is NOT PKCS#12 and cannot be
 * parsed by node-forge; callers should treat `unsupported-format` as "ask the
 * user for the alias manually".
 */
export function listKeystoreAliases(bytes: Uint8Array, password: string): ListAliasesResult {
  try {
    // forge.asn1.fromDer accepts a "binary" string (each char code is one byte).
    const binary = Buffer.from(bytes).toString('binary')
    const p12Asn1 = forge.asn1.fromDer(binary)
    let p12: forge.pkcs12.Pkcs12Pfx
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // node-forge uses these phrases when the integrity MAC doesn't verify.
      const looksLikeBadPassword = /PKCS#?12 MAC|Invalid password|mac could not be verified/i.test(msg)
      return {
        ok: false,
        reason: looksLikeBadPassword ? 'wrong-password' : 'parse-error',
        message: msg,
      }
    }

    const aliases = new Set<string>()
    for (const safeContents of p12.safeContents) {
      for (const bag of safeContents.safeBags) {
        const friendly = bag.attributes?.friendlyName
        if (Array.isArray(friendly)) {
          for (const entry of friendly) {
            if (typeof entry === 'string' && entry.length > 0)
              aliases.add(entry)
          }
        }
      }
    }
    return { ok: true, aliases: [...aliases] }
  }
  catch (err) {
    // ASN.1/DER parse failure usually means the file isn't PKCS#12 (often JKS).
    return {
      ok: false,
      reason: 'unsupported-format',
      message: err instanceof Error ? err.message : 'not a PKCS#12 file',
    }
  }
}
