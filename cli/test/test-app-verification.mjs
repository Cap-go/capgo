import assert from 'node:assert/strict'
import { classifyAppVerification, evaluateGate } from '../src/build/onboarding/app-verification.ts'

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

// ─── classifyAppVerification ──────────────────────────────────────────────

t('classifyAppVerification returns exact-match with the matched app', () => {
  const apps = [
    { bundleId: 'com.other.app', name: 'Other' },
    { bundleId: 'com.foo.app', name: 'Foo' },
  ]
  const result = classifyAppVerification({
    releaseBundleId: 'com.foo.app',
    apps,
    registeredBundleIds: ['com.foo.app'],
  })
  assert.equal(result.result, 'exact-match')
  assert.deepEqual(result.matchedApp, { bundleId: 'com.foo.app', name: 'Foo' })
})

t('classifyAppVerification returns wrong-build-id when apps exist but none match', () => {
  const result = classifyAppVerification({
    releaseBundleId: 'com.foo.typo',
    apps: [
      { bundleId: 'com.foo.app', name: 'Foo' },
      { bundleId: 'com.bar.app', name: 'Bar' },
    ],
    registeredBundleIds: ['com.foo.app'],
  })
  assert.equal(result.result, 'wrong-build-id')
  assert.equal(result.matchedApp, null)
})

t('classifyAppVerification returns no-app-identifier-exists when no apps but id is registered', () => {
  const result = classifyAppVerification({
    releaseBundleId: 'com.foo.app',
    apps: [],
    registeredBundleIds: ['com.foo.app', 'com.other.id'],
  })
  assert.equal(result.result, 'no-app-identifier-exists')
  assert.equal(result.matchedApp, null)
})

t('classifyAppVerification returns no-app-unregistered when no apps and id is not registered', () => {
  const result = classifyAppVerification({
    releaseBundleId: 'com.foo.app',
    apps: [],
    registeredBundleIds: ['com.other.id'],
  })
  assert.equal(result.result, 'no-app-unregistered')
  assert.equal(result.matchedApp, null)
})

t('classifyAppVerification treats an empty registeredBundleIds list as unregistered', () => {
  const result = classifyAppVerification({
    releaseBundleId: 'com.foo.app',
    apps: [],
    registeredBundleIds: [],
  })
  assert.equal(result.result, 'no-app-unregistered')
  assert.equal(result.matchedApp, null)
})

t('classifyAppVerification prefers exact-match even when the id is also registered', () => {
  // An exact app match outranks both the wrong-build-id and registered branches.
  const result = classifyAppVerification({
    releaseBundleId: 'com.foo.app',
    apps: [{ bundleId: 'com.foo.app', name: 'Foo' }],
    registeredBundleIds: ['com.foo.app'],
  })
  assert.equal(result.result, 'exact-match')
  assert.equal(result.matchedApp?.name, 'Foo')
})

// ─── evaluateGate ──────────────────────────────────────────────────────────

t('evaluateGate proceeds with no escalation when satisfied', () => {
  // attempt is ignored when satisfied — always escalationLevel 0.
  assert.deepEqual(evaluateGate({ satisfied: true, attempt: 0 }), { proceed: true, escalationLevel: 0 })
  assert.deepEqual(evaluateGate({ satisfied: true, attempt: 7 }), { proceed: true, escalationLevel: 0 })
})

t('evaluateGate blocks with escalation equal to attempt when unsatisfied', () => {
  assert.deepEqual(evaluateGate({ satisfied: false, attempt: 1 }), { proceed: false, escalationLevel: 1 })
  assert.deepEqual(evaluateGate({ satisfied: false, attempt: 2 }), { proceed: false, escalationLevel: 2 })
  assert.deepEqual(evaluateGate({ satisfied: false, attempt: 3 }), { proceed: false, escalationLevel: 3 })
})

t('evaluateGate caps the escalation level at 3', () => {
  assert.deepEqual(evaluateGate({ satisfied: false, attempt: 4 }), { proceed: false, escalationLevel: 3 })
  assert.deepEqual(evaluateGate({ satisfied: false, attempt: 99 }), { proceed: false, escalationLevel: 3 })
})

t('evaluateGate handles attempt 0 (no escalation yet) when unsatisfied', () => {
  assert.deepEqual(evaluateGate({ satisfied: false, attempt: 0 }), { proceed: false, escalationLevel: 0 })
})

console.log('OK')
