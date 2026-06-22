import assert from 'node:assert'

const { validateAppleAppPassword } = await import('../src/build/onboarding/ios/validate-app-password.ts')

const ok = await validateAppleAppPassword('a@b.com', 'w-x-y-z', async () => ({ ok: true, json: async () => ({ result: { Success: true } }) }))
assert.strictEqual(ok.valid, true)

const bad = await validateAppleAppPassword('a@b.com', 'bad', async () => ({ ok: true, json: async () => ({ result: { Success: false, ErrorMessage: 'nope', ErrorCode: -20101 } }) }))
assert.strictEqual(bad.valid, false)
assert.strictEqual(bad.message, 'nope')

const net = await validateAppleAppPassword('a@b.com', 'x', async () => { throw new Error('offline') })
assert.strictEqual(net.valid, false) // never throws

console.log('validate app-specific password OK')
