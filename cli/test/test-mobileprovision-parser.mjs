import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash, randomBytes } from 'node:crypto'
import { parseMobileprovision, parseMobileprovisionDetailed, parseMobileprovisionFromBase64 } from '../src/build/mobileprovision-parser.ts'

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`\u2713 ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`\u2717 ${name}\n`)
    throw e
  }
}

function createFakeProfile(plistContent) {
  const prefix = Buffer.from([0x30, 0x82, 0x00, 0x00])
  const xml = Buffer.from(plistContent, 'utf-8')
  const suffix = Buffer.from([0x00, 0x00, 0x00])
  return Buffer.concat([prefix, xml, suffix])
}

const fullPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>match AdHoc com.example.app</string>
  <key>UUID</key>
  <string>A1B2C3D4-E5F6-G7H8-I9J0-K1L2M3N4O5P6</string>
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>TEAM123.com.example.app</string>
  </dict>
</dict>
</plist>`

t('extracts Name from embedded plist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mp-test-'))
  try {
    const path = join(dir, 'test.mobileprovision')
    writeFileSync(path, createFakeProfile(fullPlist))

    const result = parseMobileprovision(path)

    assert.equal(result.name, 'match AdHoc com.example.app')
    assert.equal(result.applicationIdentifier, 'TEAM123.com.example.app')
    assert.equal(result.bundleId, 'com.example.app')
    assert.equal(result.uuid, 'A1B2C3D4-E5F6-G7H8-I9J0-K1L2M3N4O5P6')
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('throws on file without embedded plist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mp-test-'))
  try {
    const path = join(dir, 'bad.mobileprovision')
    writeFileSync(path, Buffer.from('not a real profile'))

    assert.throws(() => parseMobileprovision(path), /No embedded plist found/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('throws on plist missing Name key', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>UUID</key>
  <string>some-uuid</string>
</dict>
</plist>`
  const dir = mkdtempSync(join(tmpdir(), 'mp-test-'))
  try {
    const path = join(dir, 'noname.mobileprovision')
    writeFileSync(path, createFakeProfile(plist))

    assert.throws(() => parseMobileprovision(path), /Name/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('parses base64-encoded mobileprovision', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>match AppStore com.example.app</string>
  <key>UUID</key>
  <string>test-uuid</string>
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>TEAM.com.example.app</string>
  </dict>
</dict>
</plist>`
  const prefix = Buffer.from([0x30, 0x82, 0x00])
  const profileBuffer = Buffer.concat([prefix, Buffer.from(plist)])
  const base64 = profileBuffer.toString('base64')

  const result = parseMobileprovisionFromBase64(base64)

  assert.equal(result.name, 'match AppStore com.example.app')
  assert.equal(result.bundleId, 'com.example.app')
})

// ─── parseMobileprovisionDetailed ─────────────────────────────────────

function detailedFixture({ profileType = 'app_store', includeCerts = true }) {
  // Use crypto.randomBytes (not Math.random) so each test run gets a unique
  // fake DER without tripping CodeQL's "weak RNG feeding into a hash" rule.
  // The bytes themselves carry no security weight — they're just test scaffolding.
  const fakeDer = Buffer.from(`fake-der-${profileType}-${randomBytes(8).toString('hex')}`)
  const sha1 = createHash('sha1').update(fakeDer).digest('hex').toLowerCase()
  const certBlock = includeCerts
    ? `<key>DeveloperCertificates</key>\n  <array>\n    <data>${fakeDer.toString('base64')}</data>\n  </array>`
    : ''
  let provisionsBlock = ''
  let entitlementsExtra = ''
  if (profileType === 'enterprise') {
    provisionsBlock = `<key>ProvisionsAllDevices</key>\n  <true/>`
  }
  else if (profileType === 'ad_hoc') {
    provisionsBlock = `<key>ProvisionedDevices</key>\n  <array><string>fake-device-id</string></array>`
  }
  else if (profileType === 'development') {
    provisionsBlock = `<key>ProvisionedDevices</key>\n  <array><string>fake-device-id</string></array>`
    entitlementsExtra = `<key>get-task-allow</key>\n    <true/>`
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>Test ${profileType}</string>
  <key>UUID</key>
  <string>uuid-${profileType}</string>
  <key>TeamIdentifier</key>
  <array>
    <string>TEAMABCDEF</string>
  </array>
  <key>ExpirationDate</key>
  <date>2030-06-01T12:00:00Z</date>
  ${provisionsBlock}
  ${certBlock}
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>TEAMABCDEF.com.example.app</string>
    ${entitlementsExtra}
  </dict>
</dict>
</plist>`
  return { plist, sha1 }
}

t('parseMobileprovisionDetailed extracts team id, expiry, and cert sha1s', () => {
  const { plist, sha1 } = detailedFixture({ profileType: 'app_store' })
  const dir = mkdtempSync(join(tmpdir(), 'mp-detail-'))
  try {
    const path = join(dir, 'p.mobileprovision')
    writeFileSync(path, createFakeProfile(plist))
    const detail = parseMobileprovisionDetailed(path)
    assert.equal(detail.name, 'Test app_store')
    assert.equal(detail.teamId, 'TEAMABCDEF')
    assert.equal(detail.expirationDate, '2030-06-01T12:00:00Z')
    assert.equal(detail.profileType, 'app_store')
    assert.deepEqual(detail.certificateSha1s, [sha1])
    assert.equal(detail.bundleId, 'com.example.app')
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('parseMobileprovisionDetailed classifies ad_hoc profiles', () => {
  const { plist } = detailedFixture({ profileType: 'ad_hoc' })
  const dir = mkdtempSync(join(tmpdir(), 'mp-detail-'))
  try {
    const path = join(dir, 'p.mobileprovision')
    writeFileSync(path, createFakeProfile(plist))
    const detail = parseMobileprovisionDetailed(path)
    assert.equal(detail.profileType, 'ad_hoc')
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('parseMobileprovisionDetailed classifies development profiles', () => {
  const { plist } = detailedFixture({ profileType: 'development' })
  const dir = mkdtempSync(join(tmpdir(), 'mp-detail-'))
  try {
    const path = join(dir, 'p.mobileprovision')
    writeFileSync(path, createFakeProfile(plist))
    const detail = parseMobileprovisionDetailed(path)
    assert.equal(detail.profileType, 'development')
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('parseMobileprovisionDetailed classifies enterprise profiles', () => {
  const { plist } = detailedFixture({ profileType: 'enterprise' })
  const dir = mkdtempSync(join(tmpdir(), 'mp-detail-'))
  try {
    const path = join(dir, 'p.mobileprovision')
    writeFileSync(path, createFakeProfile(plist))
    const detail = parseMobileprovisionDetailed(path)
    assert.equal(detail.profileType, 'enterprise')
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('parseMobileprovisionDetailed returns empty cert list when none embedded', () => {
  const { plist } = detailedFixture({ profileType: 'app_store', includeCerts: false })
  const dir = mkdtempSync(join(tmpdir(), 'mp-detail-'))
  try {
    const path = join(dir, 'p.mobileprovision')
    writeFileSync(path, createFakeProfile(plist))
    const detail = parseMobileprovisionDetailed(path)
    assert.deepEqual(detail.certificateSha1s, [])
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

process.stdout.write('OK\n')
