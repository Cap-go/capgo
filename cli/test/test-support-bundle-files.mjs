// cli/test/test-support-bundle-files.mjs
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderBundleWithinGzCap, writeSupportBundleFiles } from '../src/onboarding-support.ts'

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

t('renderBundleWithinGzCap trims the oldest build-output lines to fit, keeping the failure tail', () => {
  const buildLines = []
  for (let i = 0; i < 5000; i++)
    buildLines.push(`build line ${i} ${'x'.repeat(48)}`)
  buildLines.push('FATAL: the real failure is right here at the very end')
  const input = {
    kind: 'build-init',
    appId: 'com.example.app',
    error: 'boom',
    sections: [
      { title: 'Build output (full)', lines: buildLines },
      { title: 'AI analysis', lines: ['keep this small section intact'] },
    ],
    logs: ['recent activity line'],
  }
  const cap = 3000 // tiny cap to force trimming without generating 10 MB of entropy
  const { rendered, gz } = renderBundleWithinGzCap(input, cap)
  assert.ok(gz.length <= cap + 256, `gz ${gz.length} should be ~within cap ${cap}`)
  assert.equal(rendered, gunzipSync(gz).toString('utf8')) // .log and .log.gz stay in sync
  assert.ok(rendered.includes('FATAL: the real failure is right here at the very end'), 'failure tail kept')
  assert.ok(/omitted to fit the .* MB support upload limit/.test(rendered), 'truncation marker present')
  assert.ok(rendered.includes('boom'), 'error line preserved')
  assert.ok(rendered.includes('keep this small section intact'), 'small sections preserved')
  assert.ok(!rendered.includes('build line 0 '), 'oldest build line dropped')
})

t('renderBundleWithinGzCap leaves a normal bundle untouched (no marker)', () => {
  const { rendered } = renderBundleWithinGzCap({
    kind: 'build-init', appId: 'com.example.app', error: 'boom',
    sections: [{ title: 'Build output (full)', lines: ['line a', 'line b', 'line c'] }],
  })
  assert.ok(rendered.includes('line a') && rendered.includes('line c'))
  assert.ok(!/omitted to fit/.test(rendered), 'no marker when under cap')
})
