import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateP12Passphrase,
  isMacOS,
  matchIdentitiesToProfiles,
  parseFindIdentityOutput,
  scanProvisioningProfiles,
} from '../src/build/onboarding/macos-signing.ts'

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`✗ ${name}\n`)
    throw e
  }
}

async function tAsync(name, fn) {
  try {
    await fn()
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`✗ ${name}\n`)
    throw e
  }
}

// ─── parseFindIdentityOutput ──────────────────────────────────────────

t('parses single distribution identity', () => {
  const stdout = '  1) A13C04C2A4D4B3AE8E66E97FDD36CF3756456EE4 "Apple Distribution: digital shift oü (UVTJ336J2D)"\n     1 valid identities found\n'
  const identities = parseFindIdentityOutput(stdout)
  assert.equal(identities.length, 1)
  assert.equal(identities[0].sha1, 'a13c04c2a4d4b3ae8e66e97fdd36cf3756456ee4')
  assert.equal(identities[0].type, 'distribution')
  assert.equal(identities[0].teamId, 'UVTJ336J2D')
  assert.equal(identities[0].teamName, 'digital shift oü')
})

t('parses mixed distribution and development identities', () => {
  const stdout = [
    '  1) A13C04C2A4D4B3AE8E66E97FDD36CF3756456EE4 "Apple Development: Michal Tremblay (4N8W86526P)"',
    '  2) 1DB0C9704E3139809BF80B16317E804E17041670 "Apple Distribution: Acme Corp (XYZ123ABCD)"',
    '  3) 86B1746A1486D7305F0897A0E5376D956D03379D "iPhone Developer: someone@example.com (S852V374V6)"',
    '     3 valid identities found',
    '',
  ].join('\n')
  const identities = parseFindIdentityOutput(stdout)
  assert.equal(identities.length, 3)
  assert.equal(identities[0].type, 'development')
  assert.equal(identities[1].type, 'distribution')
  assert.equal(identities[2].type, 'development')
})

t('parses an unknown identity type without crashing', () => {
  const stdout = '  1) 0000000000000000000000000000000000000000 "Some Other Cert: weird name (AAAAAAAAAA)"\n'
  const identities = parseFindIdentityOutput(stdout)
  assert.equal(identities.length, 1)
  assert.equal(identities[0].type, 'unknown')
  assert.equal(identities[0].teamId, 'AAAAAAAAAA')
})

t('returns empty array for empty/malformed output', () => {
  assert.deepEqual(parseFindIdentityOutput(''), [])
  assert.deepEqual(parseFindIdentityOutput('     0 valid identities found\n'), [])
  assert.deepEqual(parseFindIdentityOutput('garbage that does not match the line format\n'), [])
})

t('handles missing team-id suffix', () => {
  const stdout = '  1) A13C04C2A4D4B3AE8E66E97FDD36CF3756456EE4 "Apple Distribution: Whatever"\n'
  const identities = parseFindIdentityOutput(stdout)
  assert.equal(identities.length, 1)
  assert.equal(identities[0].teamId, '')
  assert.equal(identities[0].teamName, 'Whatever')
})

// ─── matchIdentitiesToProfiles ────────────────────────────────────────

t('matches profiles to identities by SHA1', () => {
  const sha1A = 'a'.repeat(40)
  const sha1B = 'b'.repeat(40)
  const identities = [
    { sha1: sha1A, name: 'A', type: 'distribution', teamName: 'A', teamId: 'AAAAAAAAAA' },
    { sha1: sha1B, name: 'B', type: 'distribution', teamName: 'B', teamId: 'BBBBBBBBBB' },
  ]
  const profiles = [
    { path: '/p/1', uuid: '1', name: 'p1', applicationIdentifier: '', bundleId: 'com.a', teamId: '', expirationDate: '', profileType: 'app_store', certificateSha1s: [sha1A] },
    { path: '/p/2', uuid: '2', name: 'p2', applicationIdentifier: '', bundleId: 'com.b', teamId: '', expirationDate: '', profileType: 'app_store', certificateSha1s: [sha1B] },
    { path: '/p/3', uuid: '3', name: 'p3', applicationIdentifier: '', bundleId: 'com.ab', teamId: '', expirationDate: '', profileType: 'app_store', certificateSha1s: [sha1A, sha1B] },
  ]
  const matches = matchIdentitiesToProfiles(identities, profiles)
  assert.equal(matches.length, 2)
  assert.equal(matches[0].profiles.length, 2) // p1 and p3
  assert.equal(matches[1].profiles.length, 2) // p2 and p3
})

t('identity with no matching profiles returns empty list', () => {
  const sha1 = 'c'.repeat(40)
  const identities = [{ sha1, name: 'C', type: 'distribution', teamName: 'C', teamId: 'CCCCCCCCCC' }]
  const profiles = [{ path: '/p/x', uuid: 'x', name: 'px', applicationIdentifier: '', bundleId: 'com.x', teamId: '', expirationDate: '', profileType: 'app_store', certificateSha1s: ['d'.repeat(40)] }]
  const matches = matchIdentitiesToProfiles(identities, profiles)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].profiles.length, 0)
})

// ─── generateP12Passphrase ────────────────────────────────────────────

t('generates a 64-char hex passphrase', () => {
  const p1 = generateP12Passphrase()
  const p2 = generateP12Passphrase()
  assert.equal(p1.length, 64)
  assert.match(p1, /^[0-9a-f]{64}$/)
  assert.notEqual(p1, p2, 'expected two passphrases to differ')
})

// ─── isMacOS ──────────────────────────────────────────────────────────

t('isMacOS returns a boolean reflecting process.platform', () => {
  const result = isMacOS()
  assert.equal(typeof result, 'boolean')
  assert.equal(result, process.platform === 'darwin')
})

// ─── scanProvisioningProfiles (fixture-based) ─────────────────────────

await tAsync('scans both legacy and Xcode 16+ provisioning profile dirs', async () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'capgo-mac-signing-test-'))
  try {
    const legacy = join(fakeHome, 'Library/MobileDevice/Provisioning Profiles')
    const modern = join(fakeHome, 'Library/Developer/Xcode/UserData/Provisioning Profiles')
    require('node:fs').mkdirSync(legacy, { recursive: true })
    require('node:fs').mkdirSync(modern, { recursive: true })

    // Generate a fake DER cert and compute its SHA1
    const fakeDer = Buffer.from('hello-world-fake-cert')
    const expectedSha1 = createHash('sha1').update(fakeDer).digest('hex').toLowerCase()
    const fakeCertB64 = fakeDer.toString('base64')

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>Test Profile</string>
  <key>UUID</key>
  <string>00000000-0000-0000-0000-000000000000</string>
  <key>TeamIdentifier</key>
  <array>
    <string>ABCDEF1234</string>
  </array>
  <key>ExpirationDate</key>
  <date>2030-01-01T00:00:00Z</date>
  <key>DeveloperCertificates</key>
  <array>
    <data>${fakeCertB64}</data>
  </array>
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>ABCDEF1234.com.example.app</string>
  </dict>
</dict>
</plist>`
    // Mobileprovision is a binary CMS envelope wrapping the plist; the parser
    // looks for the <?xml ... </plist> markers, so a minimal wrapper works.
    const prefix = Buffer.from([0x30, 0x82, 0x00, 0x00])
    const suffix = Buffer.from([0x00, 0x00, 0x00])
    const fakeProfile = Buffer.concat([prefix, Buffer.from(plist, 'utf-8'), suffix])

    writeFileSync(join(legacy, 'legacy.mobileprovision'), fakeProfile)
    writeFileSync(join(modern, 'modern.mobileprovision'), fakeProfile)
    writeFileSync(join(modern, 'not-a-profile.txt'), 'ignored')

    const discovered = await scanProvisioningProfiles(fakeHome)
    assert.equal(discovered.length, 2, 'should find two profiles')
    assert.ok(discovered.every(p => p.name === 'Test Profile'))
    assert.ok(discovered.every(p => p.teamId === 'ABCDEF1234'))
    assert.ok(discovered.every(p => p.bundleId === 'com.example.app'))
    assert.ok(discovered.every(p => p.certificateSha1s.includes(expectedSha1)),
      `expected each profile to contain SHA1 ${expectedSha1}, got ${JSON.stringify(discovered.map(p => p.certificateSha1s))}`)
    assert.ok(discovered.every(p => p.profileType === 'app_store'))
  }
  finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

await tAsync('scan returns empty list when no profile dirs exist', async () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'capgo-mac-signing-empty-'))
  try {
    const discovered = await scanProvisioningProfiles(fakeHome)
    assert.equal(discovered.length, 0)
  }
  finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

process.stdout.write('OK\n')
