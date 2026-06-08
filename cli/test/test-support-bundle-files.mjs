// cli/test/test-support-bundle-files.mjs
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderBundleWithinGzCap, writeSupportBundleFiles } from '../src/onboarding-support.ts'
import { t } from './support-harness.mjs'

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
  const cap = 6000 // tiny cap to force trimming without generating 10 MB of entropy
  const { rendered, gz } = renderBundleWithinGzCap(input, cap)
  assert.ok(gz.length <= cap, `gz ${gz.length} must be at or under cap ${cap} (marker included)`)
  assert.equal(rendered, gunzipSync(gz).toString('utf8')) // .log and .log.gz stay in sync
  assert.ok(rendered.includes('FATAL: the real failure is right here at the very end'), 'failure tail kept')
  assert.ok(/omitted to fit the .* MB support upload limit/.test(rendered), 'truncation marker present')
  assert.ok(rendered.includes('boom'), 'error line preserved')
  assert.ok(rendered.includes('keep this small section intact'), 'small sections preserved')
  assert.ok(!rendered.includes('build line 0 '), 'oldest build line dropped')
})

t('renderBundleWithinGzCap fits via binary search — few gzip passes, not linear', () => {
  const buildLines = []
  for (let i = 0; i < 20000; i++)
    buildLines.push(`build line ${i} step=${i * 7} ${'x'.repeat(20)}`)
  buildLines.push('FATAL tail line')
  let passes = 0
  const { gz, rendered } = renderBundleWithinGzCap({
    kind: 'build-init', appId: 'a', error: 'boom',
    sections: [{ title: 'Build output (full)', lines: buildLines }],
  }, 6000, () => { passes++ })
  assert.ok(gz.length <= 6000, `gz ${gz.length} within cap (marker included)`)
  assert.ok(rendered.includes('FATAL tail line'), 'failure tail kept')
  // Binary search ≈ log2(n) probes; a linear 100-or-500-per-pass walk would be
  // hundreds-to-thousands. Pin that we stay tiny.
  assert.ok(passes <= 60, `expected few gzip passes, got ${passes}`)
})

t('renderBundleWithinGzCap leaves a normal bundle untouched (no marker)', () => {
  const { rendered } = renderBundleWithinGzCap({
    kind: 'build-init', appId: 'com.example.app', error: 'boom',
    sections: [{ title: 'Build output (full)', lines: ['line a', 'line b', 'line c'] }],
  })
  assert.ok(rendered.includes('line a') && rendered.includes('line c'))
  assert.ok(!/omitted to fit/.test(rendered), 'no marker when under cap')
})

t('renderBundleWithinGzCap terminates + degrades when non-trimmable content alone exceeds the cap', () => {
  // A giant AI-analysis section (never trimmed) bigger than a tiny cap: the trimmer
  // empties the build output, can't get under, and returns WITHOUT looping forever.
  const ai = Array.from({ length: 4000 }, (_, i) => `ai reasoning line ${i} step=${i * 13}`)
  let passes = 0
  const { gz } = renderBundleWithinGzCap({
    kind: 'build-init', appId: 'a', error: 'boom',
    sections: [
      { title: 'Build output (full)', lines: ['only', 'a', 'few', 'build', 'lines'] },
      { title: 'AI analysis', lines: ai },
    ],
  }, 1000, () => { passes++ }) // cap below the AI section's own size → unfittable
  // It returns (no hang); the result is simply still over cap → caller's upload
  // falls back to attach. Pin termination with a tiny, bounded pass count.
  assert.ok(gz.length > 1000, 'cannot fit when the untrimmable section alone exceeds the cap')
  assert.ok(passes <= 60, `must still terminate in few passes, got ${passes}`)
})
