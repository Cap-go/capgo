import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  bundleIdMatches,
  exportP12FromKeychain,
  filterProfilesForApp,
  generateP12Passphrase,
  helperPackageName,
  helperSignatureRequirement,
  isMacOS,
  matchIdentitiesToProfiles,
  parseFindIdentityOutput,
  parseHelperJson,
  resolveHelperBinary,
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

// ─── parseHelperJson ─────────────────────────────────────────────────

t('parseHelperJson parses success output', () => {
  const stdout = '{"ok":true,"p12Path":"/tmp/x.p12","p12SizeBytes":4096,"identityName":"Apple Distribution: Acme"}\n'
  const parsed = parseHelperJson(stdout, '', 0)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.p12Path, '/tmp/x.p12')
  assert.equal(parsed.p12SizeBytes, 4096)
  assert.equal(parsed.identityName, 'Apple Distribution: Acme')
})

t('parseHelperJson parses failure with error code + osStatus', () => {
  const stdout = '{"ok":false,"errorCode":"USER_DENIED","message":"denied","osStatus":-128}\n'
  const parsed = parseHelperJson(stdout, '', 4)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.errorCode, 'USER_DENIED')
  assert.equal(parsed.message, 'denied')
  assert.equal(parsed.osStatus, -128)
})

t('parseHelperJson tolerates trailing whitespace + newlines', () => {
  const stdout = '\n\n  {"ok":true,"p12Path":"/x"}  \n\n'
  const parsed = parseHelperJson(stdout, '', 0)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.p12Path, '/x')
})

t('parseHelperJson uses the LAST line when multiple lines present', () => {
  const stdout = 'incidental log line\n{"ok":true,"p12Path":"/x"}\n'
  const parsed = parseHelperJson(stdout, '', 0)
  assert.equal(parsed.ok, true)
})

t('parseHelperJson throws clearly when stdout is empty', () => {
  assert.throws(() => parseHelperJson('', 'helper segfaulted', 139), /no JSON output.*helper segfaulted/)
})

t('parseHelperJson throws clearly when stdout is unparsable', () => {
  assert.throws(() => parseHelperJson('not json at all', '', 1), /unparsable JSON/)
})

t('parseHelperJson throws clearly when JSON is not an object', () => {
  assert.throws(() => parseHelperJson('"a string, not object"', '', 1), /not an object/)
})

// ─── filterProfilesForApp ────────────────────────────────────────────

function mockProfile({ bundleId, profileType }) {
  return {
    path: `/Mobile/${bundleId}-${profileType}.mobileprovision`,
    uuid: `uuid-${bundleId}-${profileType}`,
    name: `${bundleId} ${profileType}`,
    applicationIdentifier: `TEAM.${bundleId}`,
    bundleId,
    teamId: 'TEAM',
    expirationDate: '2099-01-01T00:00:00Z',
    profileType,
    certificateSha1s: ['abcd'],
    creationDate: '2024-01-01T00:00:00Z',
  }
}

t('filterProfilesForApp returns only profiles matching bundleId + distribution', () => {
  const profiles = [
    mockProfile({ bundleId: 'com.example.app', profileType: 'app_store' }),
    mockProfile({ bundleId: 'com.example.app', profileType: 'ad_hoc' }),
    mockProfile({ bundleId: 'com.other.app', profileType: 'app_store' }),
  ]
  const filtered = filterProfilesForApp(profiles, 'com.example.app', 'app_store')
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].bundleId, 'com.example.app')
  assert.equal(filtered[0].profileType, 'app_store')
})

t('filterProfilesForApp returns empty when bundleId never matches', () => {
  const profiles = [
    mockProfile({ bundleId: 'com.other.app', profileType: 'app_store' }),
    mockProfile({ bundleId: 'com.another.app', profileType: 'app_store' }),
  ]
  const filtered = filterProfilesForApp(profiles, 'com.example.app', 'app_store')
  assert.equal(filtered.length, 0)
})

t('filterProfilesForApp returns empty when bundleId matches but distribution does not', () => {
  const profiles = [mockProfile({ bundleId: 'com.example.app', profileType: 'ad_hoc' })]
  const filtered = filterProfilesForApp(profiles, 'com.example.app', 'app_store')
  assert.equal(filtered.length, 0)
})

t('filterProfilesForApp returns all bundleId matches when distribution is null/undefined', () => {
  const profiles = [
    mockProfile({ bundleId: 'com.example.app', profileType: 'app_store' }),
    mockProfile({ bundleId: 'com.example.app', profileType: 'ad_hoc' }),
    mockProfile({ bundleId: 'com.other.app', profileType: 'app_store' }),
  ]
  assert.equal(filterProfilesForApp(profiles, 'com.example.app', null).length, 2)
  assert.equal(filterProfilesForApp(profiles, 'com.example.app', undefined).length, 2)
})

t('filterProfilesForApp returns empty for empty input', () => {
  assert.equal(filterProfilesForApp([], 'com.example.app', 'app_store').length, 0)
})

// ─── mapIosOnboardingError: import-provide-profile-path → profile_read_failed ──
//
// Regression coverage for ultrareview issue #3 — the PR removed the
// 'import-fetching-profile' → 'profile_read_failed' branch but didn't add
// one for the replacement step 'import-provide-profile-path', so the five
// file-picker validation failure modes (parse + 3 invariant checks +
// generic catch) all fell through to 'unknown' in PostHog telemetry.
import { mapIosOnboardingError } from '../src/build/onboarding/error-categories.ts'

t('mapIosOnboardingError: import-provide-profile-path maps to profile_read_failed', () => {
  assert.equal(
    mapIosOnboardingError(new Error('parseMobileprovisionDetailed failed'), 'import-provide-profile-path'),
    'profile_read_failed',
  )
})

t('mapIosOnboardingError: import-pick-profile still maps to profile_no_match', () => {
  assert.equal(
    mapIosOnboardingError(new Error('no match'), 'import-pick-profile'),
    'profile_no_match',
  )
})

t('mapIosOnboardingError: import-no-match-recovery still maps to profile_no_match', () => {
  assert.equal(
    mapIosOnboardingError(new Error('still no match'), 'import-no-match-recovery'),
    'profile_no_match',
  )
})

t('mapIosOnboardingError: import-scanning still maps to keychain_no_identities', () => {
  assert.equal(
    mapIosOnboardingError(new Error('no identities'), 'import-scanning'),
    'keychain_no_identities',
  )
})

t('mapIosOnboardingError: import-exporting still maps to keychain_export_failed', () => {
  assert.equal(
    mapIosOnboardingError(new Error('export failed'), 'import-exporting'),
    'keychain_export_failed',
  )
})

t('mapIosOnboardingError: unmapped step falls through to unknown', () => {
  assert.equal(
    mapIosOnboardingError(new Error('something else'), 'welcome'),
    'unknown',
  )
})

// ─── bundleIdMatches + wildcard filtering ────────────────────────────
// Verifies the fix for ultrareview issue #2: parseMobileprovisionDetailed
// leaves the asterisk in place when stripping the team prefix, so
// wildcard profiles arrive here as either bare `*` or suffix `.*` forms.
// The old strict-equality check in filterProfilesForApp + the inline
// filter in import-pick-profile + the file-picker validation all
// rejected them — a user whose only installed profile was a wildcard
// (typical for ad_hoc / enterprise teams) would land in no-match
// recovery despite having a usable profile on disk.

t('bundleIdMatches accepts exact equality', () => {
  assert.equal(bundleIdMatches('com.example.app', 'com.example.app'), true)
})

t('bundleIdMatches rejects unrelated bundle ids', () => {
  assert.equal(bundleIdMatches('com.example.app', 'com.other.app'), false)
})

t('bundleIdMatches accepts a suffix wildcard against a concrete app id', () => {
  assert.equal(bundleIdMatches('com.example.*', 'com.example.myapp'), true)
  assert.equal(bundleIdMatches('com.example.*', 'com.example.myapp.extension'), true)
})

t('bundleIdMatches rejects a suffix wildcard whose prefix does not match', () => {
  assert.equal(bundleIdMatches('com.example.*', 'com.different.app'), false)
})

t('bundleIdMatches accepts the bare "*" wildcard for any app id', () => {
  assert.equal(bundleIdMatches('*', 'com.example.app'), true)
  assert.equal(bundleIdMatches('*', 'literally.anything'), true)
})

t('filterProfilesForApp accepts a wildcard profile against a concrete appId', () => {
  const profiles = [
    mockProfile({ bundleId: 'com.example.*', profileType: 'ad_hoc' }),
    mockProfile({ bundleId: 'com.other.*', profileType: 'ad_hoc' }),
  ]
  const filtered = filterProfilesForApp(profiles, 'com.example.myapp', 'ad_hoc')
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].bundleId, 'com.example.*')
})

t('filterProfilesForApp drops a wildcard profile when distribution does not match', () => {
  const profiles = [
    mockProfile({ bundleId: 'com.example.*', profileType: 'ad_hoc' }),
  ]
  // Caller is asking for an app_store profile — wildcard ad_hoc must be filtered out
  // by the distribution conjunction, even though the bundle id wildcard would match.
  const filtered = filterProfilesForApp(profiles, 'com.example.myapp', 'app_store')
  assert.equal(filtered.length, 0)
})

t('filterProfilesForApp accepts the bare "*" wildcard against any concrete appId', () => {
  const profiles = [
    mockProfile({ bundleId: '*', profileType: 'ad_hoc' }),
  ]
  const filtered = filterProfilesForApp(profiles, 'com.anything.here', 'ad_hoc')
  assert.equal(filtered.length, 1)
})

// ─── helperPackageName ────────────────────────────────────────────────

t('helperPackageName maps arm64 and x64 to scoped packages', () => {
  assert.equal(helperPackageName('arm64'), '@capgo/cli-keychain-darwin-arm64')
  assert.equal(helperPackageName('x64'), '@capgo/cli-keychain-darwin-x64')
})

t('helperPackageName returns null for unsupported architectures', () => {
  assert.equal(helperPackageName('ia32'), null)
  assert.equal(helperPackageName('ppc64'), null)
  assert.equal(helperPackageName(''), null)
})

// ─── helperSignatureRequirement ───────────────────────────────────────

t('helperSignatureRequirement pins identifier + Developer ID + team', () => {
  const req = helperSignatureRequirement('ABCDE12345')
  assert.ok(req.startsWith('=identifier "app.capgo.cli.helper" and anchor apple generic'), `got: ${req}`)
  assert.ok(req.includes('certificate leaf[field.1.2.840.113635.100.6.1.13]'))
  assert.ok(req.includes('certificate leaf[subject.OU] = "ABCDE12345"'))
})

// ─── resolveHelperBinary ──────────────────────────────────────────────

// Builds a fake package dir containing a Capgo.app/Contents/MacOS/capgo bundle.
// `bin` is the inner executable path resolveHelperBinary returns.
function makeFakeHelper() {
  const dir = mkdtempSync(join(tmpdir(), 'capgo-helper-test-'))
  const macosDir = join(dir, 'Capgo.app', 'Contents', 'MacOS')
  mkdirSync(macosDir, { recursive: true })
  const bin = join(macosDir, 'capgo')
  writeFileSync(bin, '#!/bin/sh\nexit 0\n')
  chmodSync(bin, 0o755)
  return { dir, bin }
}

const okCodesign = async () => ({ stdout: '', stderr: '', code: 0 })
const failCodesign = async () => ({ stdout: '', stderr: 'test requirement failed', code: 3 })

await tAsync('resolveHelperBinary rejects unsupported architectures', async () => {
  await assert.rejects(
    resolveHelperBinary({ arch: 'ia32', resolve: () => { throw new Error('unreachable') } }),
    /No precompiled Capgo keychain helper exists for .*ia32/,
  )
})

await tAsync('resolveHelperBinary names the missing package in its error', async () => {
  await assert.rejects(
    resolveHelperBinary({ arch: 'arm64', resolve: () => { throw new Error('not found') } }),
    /@capgo\/cli-keychain-darwin-arm64.*not installed/s,
  )
})

await tAsync('resolveHelperBinary returns the binary when signature verifies', async () => {
  const { dir, bin } = makeFakeHelper()
  try {
    const resolved = await resolveHelperBinary({
      arch: 'arm64',
      resolve: () => join(dir, 'package.json'),
      codesignRunner: okCodesign,
    })
    assert.equal(resolved, bin)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await tAsync('resolveHelperBinary hard-errors when signature verification fails', async () => {
  const { dir } = makeFakeHelper()
  try {
    await assert.rejects(
      resolveHelperBinary({
        arch: 'arm64',
        resolve: () => join(dir, 'package.json'),
        codesignRunner: failCodesign,
      }),
      /Refusing to run the keychain helper.*did not verify/s,
    )
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await tAsync('resolveHelperBinary errors when resolved binary file is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'capgo-helper-test-'))
  try {
    await assert.rejects(
      resolveHelperBinary({
        arch: 'arm64',
        resolve: () => join(dir, 'package.json'),
        codesignRunner: okCodesign,
      }),
      /not installed|bundle is missing or not executable/s,
    )
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await tAsync('env override wins when explicitly allowed (dev builds)', async () => {
  const { dir, bin } = makeFakeHelper()
  process.env.CAPGO_KEYCHAIN_HELPER_PATH = bin
  try {
    const resolved = await resolveHelperBinary({
      allowEnvOverride: true,
      arch: 'arm64',
      resolve: () => { throw new Error('should not be consulted') },
      codesignRunner: failCodesign, // override path skips signature check too
    })
    assert.equal(resolved, bin)
  }
  finally {
    delete process.env.CAPGO_KEYCHAIN_HELPER_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})

// NOTE: this runs against UNBUNDLED source, where __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__
// is `undefined`, so `allowEnvOverride` defaults to false and the override is
// fail-closed. It does NOT prove the release BUNDLE drops the override branch via
// dead-code elimination — that is a separate property asserted on the built
// dist/index.js by the `test:helper-dce` script (run in CI), not here.
await tAsync('env override is fail-closed by default in unbundled source', async () => {
  const { dir, bin } = makeFakeHelper()
  process.env.CAPGO_KEYCHAIN_HELPER_PATH = '/nonexistent/evil-binary'
  try {
    const resolved = await resolveHelperBinary({
      arch: 'arm64',
      resolve: () => join(dir, 'package.json'),
      codesignRunner: okCodesign,
    })
    assert.equal(resolved, bin)
  }
  finally {
    delete process.env.CAPGO_KEYCHAIN_HELPER_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── exportP12FromKeychain: stdin passphrase + artifact validation ────
// exportP12FromKeychain gates on isMacOS(), so these only run on darwin (the
// cli unit suite also runs on Linux CI, where the export path is unreachable).
// They drive a fake helper that reads the passphrase from STDIN — proving it is
// not passed on argv — and exercise the post-export artifact validation.
if (isMacOS()) {
  // Fake helper: read one line of stdin (the passphrase) -> write it to passFile,
  // write `bodyBytes` bytes to --output, emit success JSON reporting `reportSize`.
  function makeExportHelper({ bodyBytes, reportSize, passFile }) {
    const dir = mkdtempSync(join(tmpdir(), 'capgo-export-helper-'))
    const bin = join(dir, 'fake-export.sh')
    const body = 'x'.repeat(bodyBytes)
    const script = [
      '#!/bin/sh',
      'read PASS',
      'OUT=""',
      'while [ $# -gt 0 ]; do',
      '  case "$1" in --output) OUT="$2"; shift 2 ;; --sha1|--invoked-by) shift 2 ;; *) shift ;; esac',
      'done',
      `printf '%s' "$PASS" > "${passFile}"`,
      `printf '%s' '${body}' > "$OUT"`,
      `echo '{"ok":true,"p12Path":"'"$OUT"'","p12SizeBytes":${reportSize},"identityName":"Fake Dist"}'`,
      '',
    ].join('\n')
    writeFileSync(bin, script)
    chmodSync(bin, 0o755)
    return { dir, bin }
  }

  const exportSha1 = 'a'.repeat(40)
  const readFileSyncFn = require('node:fs').readFileSync

  await tAsync('exportP12FromKeychain feeds the passphrase via stdin (not argv) and returns base64', async () => {
    const passDir = mkdtempSync(join(tmpdir(), 'capgo-pass-'))
    const passFile = join(passDir, 'pass.txt')
    const { dir, bin } = makeExportHelper({ bodyBytes: 16, reportSize: 16, passFile })
    try {
      const result = await exportP12FromKeychain(exportSha1, { helperPathOverride: bin })
      assert.equal(result.base64, Buffer.from('x'.repeat(16)).toString('base64'))
      assert.match(result.passphrase, /^[0-9a-f]{64}$/)
      assert.equal(readFileSyncFn(passFile, 'utf8'), result.passphrase, 'helper received the passphrase over stdin')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(passDir, { recursive: true, force: true })
    }
  })

  await tAsync('exportP12FromKeychain rejects an empty exported p12', async () => {
    const passDir = mkdtempSync(join(tmpdir(), 'capgo-pass-'))
    const { dir, bin } = makeExportHelper({ bodyBytes: 0, reportSize: 0, passFile: join(passDir, 'pass.txt') })
    try {
      await assert.rejects(exportP12FromKeychain(exportSha1, { helperPathOverride: bin }), /exported \.p12 is empty/)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(passDir, { recursive: true, force: true })
    }
  })

  await tAsync('exportP12FromKeychain rejects a reported/actual size mismatch', async () => {
    const passDir = mkdtempSync(join(tmpdir(), 'capgo-pass-'))
    const { dir, bin } = makeExportHelper({ bodyBytes: 8, reportSize: 9999, passFile: join(passDir, 'pass.txt') })
    try {
      await assert.rejects(exportP12FromKeychain(exportSha1, { helperPathOverride: bin }), /size mismatch/)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(passDir, { recursive: true, force: true })
    }
  })
}

process.stdout.write('OK\n')
