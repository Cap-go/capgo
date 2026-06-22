// cli/test/test-support-upload-prompt.mjs
// Covers the ADDITIVE "also upload logs to Capgo support?" gate that now runs
// before AI analysis on a failed build (both the post-onboarding clack menu and
// the onboarding Ink flow). The gate is upload-only: it never composes a mailto.
import assert from 'node:assert/strict'
import {
  offerSupportUploadBeforeAi,
  SUPPORT_UPLOAD_PROMPT,
  supportUploadConfirmation,
} from '../src/support/support-upload-prompt.ts'
import { ta } from './support-harness.mjs'

const MOCK_UPLOAD_URL = `https://api.capgo.app/builder_support_logs/${'a'.repeat(64)}`

function makeDeps(overrides = {}) {
  const calls = { confirmed: [], built: 0, uploaded: [], printed: [] }
  const deps = {
    confirm: async (msg) => { calls.confirmed.push(msg); return true },
    buildFiles: () => { calls.built++; return { gzPath: '/x/b.log.gz' } },
    upload: async (gzPath) => { calls.uploaded.push(gzPath); return { id: 'a'.repeat(64), url: MOCK_UPLOAD_URL } },
    print: (m) => { calls.printed.push(m) },
    ...overrides,
  }
  return { deps, calls }
}

await ta('declining the gate does NOT build or upload anything', async () => {
  const { deps, calls } = makeDeps({ confirm: async () => false })
  const outcome = await offerSupportUploadBeforeAi(deps)
  assert.equal(outcome, 'declined')
  assert.equal(calls.built, 0)
  assert.equal(calls.uploaded.length, 0)
  assert.equal(calls.printed.length, 0) // nothing printed when declined
})

await ta('the gate prompt offers the additive upload and mentions email follow-up', async () => {
  let asked = ''
  const { deps } = makeDeps({ confirm: async (msg) => { asked = msg; return false } })
  await offerSupportUploadBeforeAi(deps)
  assert.equal(asked, SUPPORT_UPLOAD_PROMPT)
  assert.ok(SUPPORT_UPLOAD_PROMPT.includes('Capgo support'))
  assert.ok(/email/i.test(SUPPORT_UPLOAD_PROMPT)) // tells the user support follows up by email
})

await ta('accepting builds the bundle then uploads the GZIP', async () => {
  const order = []
  const { deps, calls } = makeDeps({
    buildFiles: () => { order.push('build'); return { gzPath: '/x/b.log.gz' } },
    upload: async (gz) => { order.push('upload'); calls.uploaded.push(gz); return { id: 'a'.repeat(64), url: 'u' } },
  })
  const outcome = await offerSupportUploadBeforeAi(deps)
  assert.equal(outcome, 'uploaded')
  assert.deepEqual(order, ['build', 'upload']) // bundle is written before the network upload
  assert.deepEqual(calls.uploaded, ['/x/b.log.gz'])
})

await ta('on upload success it prints the "support will be in touch by email" line — and no mailto', async () => {
  const { deps, calls } = makeDeps()
  await offerSupportUploadBeforeAi(deps)
  // The success line now appends a `Reference: <url>` line, so assert the
  // printed confirmation matches the helper output for the uploaded URL.
  assert.ok(calls.printed.some(m => m === supportUploadConfirmation(MOCK_UPLOAD_URL)))
  const printed = calls.printed.join('\n')
  assert.ok(/in touch by email/i.test(printed))
  assert.ok(!printed.includes('mailto:')) // upload-only — never composes mail
  assert.ok(!/press Send/i.test(printed)) // not the email flow
})

await ta('bundle write failure is reported and does not throw', async () => {
  const { deps, calls } = makeDeps({ buildFiles: () => null })
  const outcome = await offerSupportUploadBeforeAi(deps)
  assert.equal(outcome, 'failed')
  assert.equal(calls.uploaded.length, 0)
  assert.ok(calls.printed.length >= 1) // user is told it couldn't be sent
})

await ta('upload returning null degrades to "unavailable" and is announced, not silent', async () => {
  const { deps, calls } = makeDeps({ upload: async () => null })
  const outcome = await offerSupportUploadBeforeAi(deps)
  assert.equal(outcome, 'unavailable')
  assert.ok(calls.printed.some(m => /unavailable|couldn'?t|could not/i.test(m)))
})

await ta('an upload that throws is swallowed (best-effort) and never breaks the AI flow', async () => {
  const { deps } = makeDeps({ upload: async () => { throw new Error('network down') } })
  const outcome = await offerSupportUploadBeforeAi(deps)
  assert.equal(outcome, 'unavailable') // treated like an unavailable upload, not a crash
})

await ta('a confirm that throws is swallowed and treated as declined', async () => {
  const { deps, calls } = makeDeps({ confirm: async () => { throw new Error('tty gone') } })
  const outcome = await offerSupportUploadBeforeAi(deps)
  assert.equal(outcome, 'declined')
  assert.equal(calls.built, 0)
})
