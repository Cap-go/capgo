// cli/test/test-support-contact.mjs
import assert from 'node:assert/strict'
import { contactSupport, resetSupportUploadCacheForTests } from '../src/support/contact-support.ts'
import { ta } from './support-harness.mjs'

function makeDeps(overrides = {}) {
  resetSupportUploadCacheForTests() // each test starts with a clean per-run upload cache
  const calls = { copied: [], opened: [], revealed: [], printed: [], confirmedWith: [] }
  const deps = {
    subject: 'Capgo Builder support',
    body: 'hello',
    confirm: async (_msg, logPath) => { calls.confirmedWith.push(logPath); return true },
    buildFiles: () => ({ logPath: '/x/b.log', gzPath: '/x/b.log.gz' }),
    copyPath: (p) => { calls.copied.push(p); return true },
    reveal: (p) => { calls.revealed.push(p) },
    openUrl: async (u) => { calls.opened.push(u) },
    print: (m) => { calls.printed.push(m) },
    ...overrides,
  }
  return { deps, calls }
}

await ta('cancels without writing/opening when confirm is false', async () => {
  const { deps, calls } = makeDeps({ confirm: async () => false })
  const result = await contactSupport(deps)
  assert.equal(result, 'cancelled')
  assert.equal(calls.opened.length, 0)
  assert.equal(calls.copied.length, 0)
})

await ta('copies the GZIPPED path (not the plain .log)', async () => {
  const { deps, calls } = makeDeps()
  await contactSupport(deps)
  assert.deepEqual(calls.copied, ['/x/b.log.gz'])
})

await ta('opens a mailto: to support@capgo.app and prints instructions', async () => {
  const { deps, calls } = makeDeps()
  const result = await contactSupport(deps)
  assert.equal(result, 'opened')
  assert.ok(calls.opened[0].startsWith('mailto:support@capgo.app?'))
  assert.ok(decodeURIComponent(calls.opened[0]).includes('/x/b.log.gz')) // path is in the email body
  assert.ok(calls.printed.some(m => m.includes('support@capgo.app')))
})

await ta('returns failed when files cannot be written', async () => {
  const { deps } = makeDeps({ buildFiles: () => null })
  assert.equal(await contactSupport(deps), 'failed')
})

await ta('builds the bundle BEFORE confirm and passes the .log path for inspection', async () => {
  const order = []
  const { deps, calls } = makeDeps({
    buildFiles: () => { order.push('build'); return { logPath: '/x/b.log', gzPath: '/x/b.log.gz' } },
    confirm: async (_m, logPath) => { order.push('confirm'); calls.confirmedWith.push(logPath); return true },
  })
  await contactSupport(deps)
  assert.deepEqual(order.slice(0, 2), ['build', 'confirm']) // bundle exists before we ask
  assert.deepEqual(calls.confirmedWith, ['/x/b.log']) // readable path handed to the confirm
})

await ta('upload success: link in email body, no clipboard/reveal/attach text', async () => {
  const uploads = []
  const { deps, calls } = makeDeps({
    upload: async (gzPath) => { uploads.push(gzPath); return { id: 'a'.repeat(64), url: 'https://api.capgo.app/builder_support_logs/' + 'a'.repeat(64) } },
  })
  const result = await contactSupport(deps)
  assert.equal(result, 'opened')
  assert.deepEqual(uploads, ['/x/b.log.gz']) // uploads the gzip
  const body = decodeURIComponent(calls.opened[0])
  assert.ok(body.includes('builder_support_logs/' + 'a'.repeat(64))) // download link in the email
  assert.ok(!body.includes('Please attach')) // send-ready, no attach instructions
  assert.equal(calls.copied.length, 0) // no clipboard needed
  assert.equal(calls.revealed.length, 0) // no Finder reveal needed
  assert.ok(calls.printed.some(m => m.includes('press Send')))
})

await ta('upload failure degrades to the manual attach flow', async () => {
  const { deps, calls } = makeDeps({ upload: async () => null })
  const result = await contactSupport(deps)
  assert.equal(result, 'opened')
  assert.deepEqual(calls.copied, ['/x/b.log.gz']) // clipboard fallback kicks in
  assert.ok(decodeURIComponent(calls.opened[0]).includes('Please attach')) // attach instructions back
})

await ta('logs link survives body truncation (long error text)', async () => {
  const url = 'https://api.capgo.app/builder_support_logs/' + 'b'.repeat(64)
  const { deps, calls } = makeDeps({
    body: 'Error: ' + 'x'.repeat(5000), // way past the mailto body cap
    upload: async () => ({ id: 'b'.repeat(64), url }),
  })
  await contactSupport(deps)
  const body = decodeURIComponent(calls.opened[0].split('body=')[1])
  assert.ok(body.endsWith(url)) // the link is NEVER truncated away
  assert.ok(body.includes('…(truncated)')) // the long prefix is what got cut
})

await ta('attach path survives body truncation in the fallback flow', async () => {
  const { deps, calls } = makeDeps({ body: 'Error: ' + 'y'.repeat(5000) })
  await contactSupport(deps)
  const body = decodeURIComponent(calls.opened[0].split('body=')[1])
  assert.ok(body.includes('/x/b.log.gz')) // attach path preserved despite truncation
})

await ta('upload failure is announced, not silent', async () => {
  const { deps, calls } = makeDeps({ upload: async () => null })
  await contactSupport(deps)
  assert.ok(calls.printed.some(m => m.includes('upload to Capgo failed')))
})

await ta('repeat Email support reuses the first upload — no second upload, no rate-limit hit', async () => {
  const url = 'https://api.capgo.app/builder_support_logs/' + 'c'.repeat(64)
  const uploads = []
  const { deps, calls } = makeDeps({ // makeDeps resets the cache once, at the start
    upload: async (gz) => { uploads.push(gz); return { id: 'c'.repeat(64), url } },
  })
  await contactSupport(deps) // first click → uploads
  await contactSupport(deps) // second click → must REUSE, not upload again
  assert.equal(uploads.length, 1) // uploaded exactly once for the whole run
  assert.equal(calls.opened.length, 2) // but a mail was opened both times
  assert.ok(decodeURIComponent(calls.opened[0]).includes('c'.repeat(64)))
  assert.ok(decodeURIComponent(calls.opened[1]).includes('c'.repeat(64))) // same link reused
  assert.ok(calls.printed.some(m => m.includes('reusing the logs you already uploaded')))
})

await ta('confirm copy discloses the upload + 30-day retention when uploading', async () => {
  let confirmMsg = ''
  const { deps } = makeDeps({
    confirm: async (msg) => { confirmMsg = msg; return false },
    upload: async () => null,
  })
  await contactSupport(deps)
  assert.ok(confirmMsg.includes('upload your logs to Capgo support'))
  assert.ok(confirmMsg.includes('kept 30 days'))
  assert.ok(!confirmMsg.includes('save your logs locally')) // no misleading "save locally" wording
})
