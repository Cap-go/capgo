// cli/test/test-support-contact.mjs
import assert from 'node:assert/strict'
import { contactSupport } from '../src/support/contact-support.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}
async function ta(name, fn) {
  try { await fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

function makeDeps(overrides = {}) {
  const calls = { copied: [], opened: [], revealed: [], printed: [] }
  const deps = {
    subject: 'Capgo Builder support',
    body: 'hello',
    confirm: async () => true,
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
