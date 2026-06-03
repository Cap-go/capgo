// cli/test/test-support-bundle-files.mjs
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSupportBundleFiles } from '../src/onboarding-support.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

t('writes both .log and .log.gz with identical decoded content', () => {
  const dir = join(tmpdir(), `capgo-bundle-${Date.now()}`)
  const res = writeSupportBundleFiles({ kind: 'build-init', appId: 'com.example.app', error: 'boom', logs: ['l1', 'l2'] }, dir)
  assert.ok(res)
  assert.ok(res.logPath.endsWith('.log'))
  assert.ok(res.gzPath.endsWith('.log.gz'))
  const plain = readFileSync(res.logPath, 'utf8')
  const fromGz = gunzipSync(readFileSync(res.gzPath)).toString('utf8')
  assert.equal(plain, fromGz)
  assert.ok(plain.includes('boom'))
  rmSync(dir, { recursive: true, force: true })
})
