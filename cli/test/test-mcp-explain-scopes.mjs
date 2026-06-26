#!/usr/bin/env node
/**
 * The google-sign-in explanation (capgo_builder_onboarding_explain) must name the
 * EXACT Google OAuth scopes the user is about to approve — not just "approve the
 * permissions Google shows". This pins that, and ties it to the canonical scope
 * list (OAUTH_SCOPES_FOR_ONBOARDING) so a scope added to the flow but left out of
 * the explanation fails the build instead of silently under-disclosing.
 */
import process from 'node:process'

console.log('🧪 Testing google-sign-in explanation scope disclosure...\n')

const { EXPLANATIONS } = await import('../src/build/onboarding/mcp/explanations.ts')
const { OAUTH_SCOPES_FOR_ONBOARDING } = await import('../src/build/onboarding/android/oauth-scopes.ts')

let pass = 0
let fail = 0
async function test(name, fn) {
  try { await fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy') }

const text = EXPLANATIONS['google-sign-in']

await test('lists every requested Google API scope verbatim', async () => {
  ok(typeof text === 'string' && text.length > 0, 'google-sign-in explanation must exist')
  const apiScopes = OAUTH_SCOPES_FOR_ONBOARDING.filter(s => s.startsWith('https://www.googleapis.com/auth/'))
  ok(apiScopes.length >= 2, 'expected at least cloud-platform + androidpublisher in the scope list')
  for (const scope of apiScopes)
    ok(text.includes(scope), `explanation must name the exact scope: ${scope}`)
})

await test('explains what the access is for and the local/revocable trust model', async () => {
  ok(/google cloud/i.test(text), 'must name Google Cloud')
  ok(/google play/i.test(text), 'must name Google Play')
  ok(/revoke/i.test(text), 'must tell the user they can revoke')
  // The broker (Capgo backend) DOES briefly hold the token — so disclose the honest model: short-lived,
  // handed off once, deleted, no long-lived refresh token retained.
  ok(/short-lived/i.test(text), 'must disclose the token is short-lived')
  ok(/delete|handed.*once|no long-lived refresh/i.test(text), 'must disclose the token is handed off once and not retained long-term')
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
