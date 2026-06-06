// test/prescan/helpers.ts
import type { ScanContext } from '../../src/build/prescan/types'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import forge from 'node-forge'

/** Create a temp project dir from a {relativePath: content} map. */
export function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'prescan-'))
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  return dir
}

export function makeCtx(partial: Partial<ScanContext> & { projectDir: string }): ScanContext {
  return { appId: 'com.demo.app', platform: 'ios', ...partial }
}

export interface MadeP12 {
  base64: string
  password: string
  sha1: string // lowercase hex of the cert
  notAfter: Date
}

/** Self-signed cert + key wrapped in a password-protected P12 (pure node-forge, no binaries). */
export function makeP12(opts: { password?: string, notAfter?: Date, cn?: string } = {}): MadeP12 {
  const password = opts.password ?? 'test-pass'
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86_400_000)
  cert.validity.notAfter = opts.notAfter ?? new Date(Date.now() + 365 * 86_400_000)
  const attrs = [{ name: 'commonName', value: opts.cn ?? 'Apple Distribution: Test' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' })
  const der = forge.asn1.toDer(p12Asn1).getBytes()
  const base64 = forge.util.encode64(der)

  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const md = forge.md.sha1.create()
  md.update(certDer)
  const sha1 = md.digest().toHex().toLowerCase()

  return { base64, password, sha1, notAfter: cert.validity.notAfter }
}

/** Provisioning-profile XML the existing mobileprovision parser accepts (it scans for <?xml..</plist>). */
export function makeProfileXml(opts: {
  bundleId?: string
  teamId?: string
  expiration?: Date
  type?: 'app_store' | 'ad_hoc' | 'development'
  certSha1s?: string[]
} = {}): string {
  const teamId = opts.teamId ?? 'TEAM123456'
  const bundleId = opts.bundleId ?? 'com.demo.app'
  const expiration = (opts.expiration ?? new Date(Date.now() + 30 * 86_400_000)).toISOString().replace(/\.\d{3}Z$/, 'Z')
  // profile type markers used by parseMobileprovisionDetailed (deriveProfileType):
  //   app_store: no ProvisionedDevices + no ProvisionsAllDevices
  //   ad_hoc: ProvisionedDevices present (no get-task-allow=true)
  //   development: ProvisionedDevices present + <key>get-task-allow</key><true/>
  const typeBlock = opts.type === 'ad_hoc'
    ? '<key>ProvisionedDevices</key><array><string>0000000000000000000000000000000000000000</string></array>'
    : opts.type === 'development'
      ? '<key>ProvisionedDevices</key><array><string>0000000000000000000000000000000000000000</string></array><key>Entitlements</key><dict><key>get-task-allow</key><true/></dict>'
      : ''
  const certs = (opts.certSha1s ?? []).map(() => '<data>AAAA</data>').join('')
  // DeveloperCertificates carry DER certs; the parser SHA1-hashes them. For tests we instead
  // build the data blocks from real DER when pairing matters — see makeProfileXmlWithCert.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Name</key><string>Test Profile</string>
<key>UUID</key><string>11111111-2222-3333-4444-555555555555</string>
<key>TeamIdentifier</key><array><string>${teamId}</string></array>
<key>ExpirationDate</key><date>${expiration}</date>
<key>Entitlements</key><dict>
  <key>application-identifier</key><string>${teamId}.${bundleId}</string>
</dict>
${typeBlock}
<key>DeveloperCertificates</key><array>${certs}</array>
</dict></plist>`
}

/** Profile XML whose DeveloperCertificates contain the actual DER of a makeP12 cert (for pairing tests). */
export function makeProfileXmlWithCert(p12: MadeP12, opts: Parameters<typeof makeProfileXml>[0] = {}): string {
  const p12Obj = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(p12.base64)), p12.password)
  const certBag = p12Obj.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0]!
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert!)).getBytes()
  const b64 = forge.util.encode64(certDer)
  const xml = makeProfileXml(opts)
  return xml.replace('<key>DeveloperCertificates</key><array></array>', `<key>DeveloperCertificates</key><array><data>${b64}</data></array>`)
}
