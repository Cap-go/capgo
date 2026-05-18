// src/build/onboarding/csr.ts
import forge from 'node-forge'

export interface CsrResult {
  csrPem: string
  privateKeyPem: string
}

export interface P12Result {
  p12Base64: string
}

/**
 * Generate a 2048-bit RSA key pair and a Certificate Signing Request.
 * The CSR is what Apple needs to create a distribution certificate.
 * The private key must be kept to later create the .p12 file.
 */
export function generateCsr(): CsrResult {
  const keys = forge.pki.rsa.generateKeyPair(2048)

  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey
  csr.setSubject([
    { name: 'commonName', value: 'Capgo Build' },
    { name: 'organizationName', value: 'Capgo' },
  ])
  csr.sign(keys.privateKey)

  return {
    csrPem: forge.pki.certificationRequestToPem(csr),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  }
}

/**
 * Default P12 password. node-forge P12 with empty password is incompatible
 * with macOS `security import` (MAC verification fails). Using a known
 * non-empty password avoids this issue.
 */
export const DEFAULT_P12_PASSWORD = 'capgo'

/**
 * Extract the Apple team ID from a certificate's subject OU field.
 * More reliable than parsing the certificate name string.
 */
export function extractTeamIdFromCert(certificateContentBase64: string): string {
  try {
    const certDer = forge.util.decode64(certificateContentBase64)
    const certAsn1 = forge.asn1.fromDer(certDer)
    const cert = forge.pki.certificateFromAsn1(certAsn1)
    const ou = cert.subject.getField('OU')
    return (ou?.value as string) || ''
  }
  catch {
    return ''
  }
}

/**
 * Parse a base64-encoded PKCS#12 (.p12) with password fallbacks and return its
 * embedded X.509 certificate. Tries the provided password, then empty string,
 * then DEFAULT_P12_PASSWORD. Throws if none work.
 */
function parseP12Certificate(p12Base64: string, password?: string): forge.pki.Certificate {
  let p12Asn1: forge.asn1.Asn1
  try {
    const p12Der = forge.util.decode64(p12Base64)
    p12Asn1 = forge.asn1.fromDer(p12Der)
  }
  catch (err) {
    throw new Error(
      `Could not parse saved P12 certificate: input is not valid base64-encoded DER (${
        err instanceof Error ? err.message : String(err)
      })`,
    )
  }

  const candidates = [password ?? '', '', DEFAULT_P12_PASSWORD]
  const tried = new Set<string>()
  let lastError: unknown

  for (const pw of candidates) {
    if (tried.has(pw))
      continue
    tried.add(pw)
    try {
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pw)
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
      const bagList = certBags[forge.pki.oids.certBag] ?? []
      const certBag = bagList.find(bag => bag.cert)
      if (certBag?.cert)
        return certBag.cert
      lastError = new Error('PKCS#12 parsed but no certificate bag was found')
    }
    catch (err) {
      lastError = err
    }
  }

  throw new Error(
    `Could not parse saved P12 certificate. Tried provided password, empty, and default. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

/**
 * Extract the X.509 certificate's notAfter date from a base64-encoded P12.
 * Used by the renew flow to detect cert expiry against the configured threshold.
 */
export function extractCertExpiry(p12Base64: string, password?: string): Date {
  const cert = parseP12Certificate(p12Base64, password)
  return cert.validity.notAfter
}

/**
 * Extract the X.509 certificate's serial number (hex, upper-case, no leading
 * zeros stripping beyond what forge does) from a base64-encoded P12. Used by
 * the renew flow to match the saved cert against Apple's listDistributionCerts
 * response so we know which cert to suggest for revocation.
 */
export function extractCertSerial(p12Base64: string, password?: string): string {
  const cert = parseP12Certificate(p12Base64, password)
  return (cert.serialNumber || '').toUpperCase()
}

/**
 * Create a PKCS#12 (.p12) file from Apple's certificate response and the private key.
 *
 * @param certificateContentBase64 - The `certificateContent` field from Apple's
 *   POST /v1/certificates response (base64-encoded DER certificate)
 * @param privateKeyPem - The PEM-encoded private key from generateCsr()
 * @param password - Optional password for the .p12 file (defaults to DEFAULT_P12_PASSWORD)
 */
export function createP12(
  certificateContentBase64: string,
  privateKeyPem: string,
  password = DEFAULT_P12_PASSWORD,
): P12Result {
  // Decode the base64 DER certificate from Apple
  const certDer = forge.util.decode64(certificateContentBase64)
  const certAsn1 = forge.asn1.fromDer(certDer)
  const cert = forge.pki.certificateFromAsn1(certAsn1)

  // Load the private key
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem)

  // Create PKCS#12 with legacy 3DES algorithm.
  // macOS `security import` doesn't support the default PBES2/AES format.
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], password, { algorithm: '3des' })
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes()

  return {
    p12Base64: forge.util.encode64(p12Der),
  }
}
