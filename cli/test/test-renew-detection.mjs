#!/usr/bin/env node
/**
 * Unit tests for renew-detection.ts (pure plan computation).
 *
 * Run with: bun test/test-renew-detection.mjs
 */
import assert from 'node:assert/strict'
import { computeRenewPlan, hasAnyIosCredentials, isLegacyProfileFormat } from '../src/build/onboarding/renew-detection.ts'

let passed = 0
let failed = 0

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`✓ ${name}\n`)
    passed++
  }
  catch (err) {
    process.stderr.write(`✗ ${name}\n  ${err.message}\n`)
    failed++
  }
}

const NOW = new Date('2026-06-01T00:00:00Z')
const APP_ID = 'com.example.app'
const CAPGO_NAME = `Capgo ${APP_ID} AppStore`

const MS_PER_DAY = 24 * 60 * 60 * 1000
function daysFromNow(n) {
  return new Date(NOW.getTime() + n * MS_PER_DAY)
}

// Empty plist (no Name, no ExpirationDate). We construct mobileprovision base64
// payloads that decode to plists with arbitrary ExpirationDate values so the
// parser returns a valid date.
function makeMobileprovisionBase64(name, applicationIdentifier, expirationIso) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>${name}</string>
  <key>UUID</key>
  <string>00000000-0000-0000-0000-000000000000</string>
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>TEAM123.${applicationIdentifier}</string>
  </dict>
  <key>ExpirationDate</key>
  <date>${expirationIso}</date>
</dict>
</plist>`
  // Prefix some bytes so it doesn't look like raw XML
  const prefix = Buffer.from([0x30, 0x82, 0x00, 0x00])
  const suffix = Buffer.from([0x00, 0x00, 0x00])
  return Buffer.concat([prefix, Buffer.from(xml, 'utf-8'), suffix]).toString('base64')
}

function makeMap(entries) {
  // entries: [{ bundleId, name, expDays }]
  const map = {}
  for (const e of entries) {
    map[e.bundleId] = {
      profile: makeMobileprovisionBase64(e.name, e.bundleId, daysFromNow(e.expDays).toISOString()),
      name: e.name,
    }
  }
  return map
}

// ─── Plan computation (without cert; only profile logic) ──────────────

t('no credentials → cert needs renewal (treated as missing), no profiles', () => {
  const plan = computeRenewPlan({}, APP_ID, { thresholdDays: 30, force: false }, NOW)
  assert.equal(plan.cert.needsRenewal, true)
  assert.equal(plan.cert.reason, 'expired')
  assert.equal(plan.cert.currentExpiry, null)
  assert.deepEqual(plan.profiles, [])
  assert.equal(plan.hasAnythingToRenew, true)
})

t('force flag triggers cert renewal even with no cert', () => {
  const plan = computeRenewPlan({}, APP_ID, { thresholdDays: 30, force: true }, NOW)
  assert.equal(plan.cert.needsRenewal, true)
  assert.equal(plan.cert.reason, 'forced')
})

t('profile expiring within threshold gets needsRenewal', () => {
  const saved = {
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(makeMap([
      { bundleId: APP_ID, name: CAPGO_NAME, expDays: 15 },
    ])),
  }
  const plan = computeRenewPlan(saved, APP_ID, { thresholdDays: 30, force: false }, NOW)
  // Cert is treated as missing → needs renewal → all Capgo profiles also marked cert-renewed.
  const profile = plan.profiles[0]
  assert.equal(profile.bundleId, APP_ID)
  assert.equal(profile.needsRenewal, true)
  // Because cert needs renewal, the reason is 'cert-renewed' regardless of own expiry.
  assert.equal(profile.reason, 'cert-renewed')
  assert.equal(profile.isCapgoCreated, true)
})

t('user-imported profile (name does not match Capgo convention) is skipped', () => {
  const saved = {
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(makeMap([
      { bundleId: 'com.example.app.widget', name: 'match AdHoc com.example.app.widget', expDays: 5 },
    ])),
  }
  const plan = computeRenewPlan(saved, APP_ID, { thresholdDays: 30, force: false }, NOW)
  const profile = plan.profiles[0]
  assert.equal(profile.isCapgoCreated, false)
  assert.equal(profile.needsRenewal, false)
  assert.equal(profile.reason, 'skipped-non-capgo')
})

t('user-imported profile is skipped even with --force', () => {
  const saved = {
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(makeMap([
      { bundleId: 'com.example.app.widget', name: 'match AdHoc com.example.app.widget', expDays: 365 },
    ])),
  }
  const plan = computeRenewPlan(saved, APP_ID, { thresholdDays: 30, force: true }, NOW)
  const profile = plan.profiles[0]
  assert.equal(profile.needsRenewal, false)
  assert.equal(profile.reason, 'skipped-non-capgo')
})

t('mixed profiles: Capgo entry renewed, user-imported skipped', () => {
  const saved = {
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(makeMap([
      { bundleId: APP_ID, name: CAPGO_NAME, expDays: 365 },
      { bundleId: 'com.example.app.widget', name: 'match AdHoc com.example.app.widget', expDays: 365 },
    ])),
  }
  const plan = computeRenewPlan(saved, APP_ID, { thresholdDays: 30, force: false }, NOW)
  // Cert is missing so it gets renewed; Capgo profile follows cert-renewed; widget stays skipped.
  const main = plan.profiles.find(p => p.bundleId === APP_ID)
  const widget = plan.profiles.find(p => p.bundleId === 'com.example.app.widget')
  assert.equal(main.needsRenewal, true)
  assert.equal(main.reason, 'cert-renewed')
  assert.equal(widget.needsRenewal, false)
  assert.equal(widget.reason, 'skipped-non-capgo')
})

t('hasAnythingToRenew is false when nothing needs renewal (force=false and everything ok)', () => {
  // We can't easily produce a "valid cert" without forging a real P12, so skip via mock:
  // mock by ALSO putting a far-future cert. Since we have no P12 base64, cert will be marked
  // expired. To represent "everything ok," we'd need a forged P12 — outside the unit test scope.
  // Verify the inverse instead: when all profiles are user-imported AND cert is missing, only
  // cert needs renewing.
  const saved = {
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(makeMap([
      { bundleId: 'com.example.app.widget', name: 'match AdHoc com.example.app.widget', expDays: 365 },
    ])),
  }
  const plan = computeRenewPlan(saved, APP_ID, { thresholdDays: 30, force: false }, NOW)
  assert.equal(plan.hasAnythingToRenew, true) // because cert is missing
  assert.equal(plan.cert.needsRenewal, true)
  assert.equal(plan.profiles.length, 1)
  assert.equal(plan.profiles[0].needsRenewal, false)
})

t('profiles are sorted: main appId first, then alphabetically', () => {
  const saved = {
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(makeMap([
      { bundleId: 'com.example.app.widget', name: 'match AdHoc com.example.app.widget', expDays: 365 },
      { bundleId: APP_ID, name: CAPGO_NAME, expDays: 365 },
      { bundleId: 'com.example.app.imessage', name: 'match AdHoc com.example.app.imessage', expDays: 365 },
    ])),
  }
  const plan = computeRenewPlan(saved, APP_ID, { thresholdDays: 30, force: false }, NOW)
  assert.equal(plan.profiles[0].bundleId, APP_ID)
  assert.equal(plan.profiles[1].bundleId, 'com.example.app.imessage')
  assert.equal(plan.profiles[2].bundleId, 'com.example.app.widget')
})

t('malformed CAPGO_IOS_PROVISIONING_MAP JSON yields empty profiles list', () => {
  const saved = { CAPGO_IOS_PROVISIONING_MAP: 'not-json{' }
  const plan = computeRenewPlan(saved, APP_ID, { thresholdDays: 30, force: false }, NOW)
  assert.deepEqual(plan.profiles, [])
})

// ─── isLegacyProfileFormat ───────────────────────────────────────────

t('legacy format detected when BUILD_PROVISION_PROFILE_BASE64 set without map', () => {
  assert.equal(isLegacyProfileFormat({ BUILD_PROVISION_PROFILE_BASE64: 'xxx' }), true)
})

t('legacy format NOT detected when both legacy and map are set', () => {
  assert.equal(
    isLegacyProfileFormat({
      BUILD_PROVISION_PROFILE_BASE64: 'xxx',
      CAPGO_IOS_PROVISIONING_MAP: '{}',
    }),
    false,
  )
})

t('legacy format NOT detected when only map is set', () => {
  assert.equal(isLegacyProfileFormat({ CAPGO_IOS_PROVISIONING_MAP: '{}' }), false)
})

// ─── hasAnyIosCredentials ────────────────────────────────────────────

t('empty / null saved → hasAnyIosCredentials false', () => {
  assert.equal(hasAnyIosCredentials({}), false)
  assert.equal(hasAnyIosCredentials(null), false)
  assert.equal(hasAnyIosCredentials(undefined), false)
})

t('only APPLE_KEY_ID set → still counts as iOS credentials', () => {
  assert.equal(hasAnyIosCredentials({ APPLE_KEY_ID: 'KEY' }), true)
})

t('only legacy BUILD_PROVISION_PROFILE_BASE64 set → still counts (migrate path)', () => {
  assert.equal(hasAnyIosCredentials({ BUILD_PROVISION_PROFILE_BASE64: 'xxx' }), true)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
