import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseMobileprovision, parseMobileprovisionFromBase64 } from '../src/build/mobileprovision-parser.ts'

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

process.stdout.write('OK\n')
