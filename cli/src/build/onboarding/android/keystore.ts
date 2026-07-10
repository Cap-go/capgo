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
const DEFAULT_SAFE_ALIAS = 'keystore'

/**
 * Sanitize a keystore alias for use as an on-disk filename component.
 *
 * The alias originates from user input (e.g. `keystoreNewAlias`). It is used
 * verbatim for the keystore crypto and the saved `KEYSTORE_KEY_ALIAS`, but the
 * value used to build the `<alias>.p12` filename must be sanitized so a value
 * like `../../evil` or `/etc/x` cannot escape the target directory.
 *
 * Rules:
 * - strip any directory components (keep only the basename),
 * - allow only `[A-Za-z0-9._-]`, replacing any other char with `_`,
 * - normalize empty or dot-only results (``, `.`, `..`) to a safe default,
 * - the return value never contains `/`, `\`, or `..`.
 *
 * IMPORTANT: this is ONLY for the filename. Do NOT use it for the crypto alias
 * or the saved key alias — those must stay exactly what the user chose.
 */
export function sanitizeKeystoreAlias(alias: string): string {
  // Take the basename: split on both POSIX and Windows separators and keep the
  // last non-empty segment so `a/b`, `a\b\c`, `../../etc/passwd` all reduce to
  // just the final name.
  const segments = String(alias ?? '').split(/[/\\]+/)
  const basename = segments.filter(Boolean).pop() ?? ''

  // Replace any char outside the allowlist with `_`.
  const cleaned = basename.replace(/[^A-Za-z0-9._-]/g, '_')

  // Reject empty or dot-only results (``, `.`, `..`, etc.) → safe default.
  if (cleaned.length === 0 || /^\.+$/.test(cleaned))
    return DEFAULT_SAFE_ALIAS

  return cleaned
}

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

export type ProbeKeyPasswordResult
  = | { ok: true }
    | { ok: false, reason: 'wrong-password' | 'unsupported-format' | 'parse-error' | 'no-private-key', message: string }

/**
 * Check whether the given password can both unlock a PKCS#12 keystore AND
 * decrypt the private key inside it.
 *
 * Useful for the "skip the key-password prompt if it's the same as the store
 * password" UX path: in practice most PKCS#12 keystores use a single password
 * for both the integrity MAC and the encrypted private-key bag. If this
 * returns `ok: true`, the CLI can use the store password as the key password
 * without asking the user.
 *
 * Returns `unsupported-format` for JKS (node-forge can't parse it) — caller
 * should fall back to prompting.
 */
export function tryUnlockPrivateKey(bytes: Uint8Array, password: string): ProbeKeyPasswordResult {
  try {
    const binary = Buffer.from(bytes).toString('binary')
    const p12Asn1 = forge.asn1.fromDer(binary)
    let p12: forge.pkcs12.Pkcs12Pfx
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const looksLikeBadPassword = /PKCS#?12 MAC|Invalid password|mac could not be verified/i.test(msg)
      return {
        ok: false,
        reason: looksLikeBadPassword ? 'wrong-password' : 'parse-error',
        message: msg,
      }
    }
    // pkcs12FromAsn1 succeeded → store password verified the MAC. Now check
    // the private-key bag actually decrypted with the same password.
    // node-forge sets `.key` on the bag when decryption succeeds.
    const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
    const keyBag = bags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    if (keyBag?.key)
      return { ok: true }
    return {
      ok: false,
      reason: 'no-private-key',
      message: 'PKCS#12 unlocked but did not contain a decryptable private key bag',
    }
  }
  catch (err) {
    return {
      ok: false,
      reason: 'unsupported-format',
      message: err instanceof Error ? err.message : 'not a PKCS#12 file',
    }
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
