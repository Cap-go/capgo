#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { optionsSetChannelSchema } from '../src/schemas/channel.ts'
import { updateOrganizationOptionsSchema } from '../src/schemas/sdk.ts'
import { ORG_EMAIL_PREFERENCE_KEYS, parseEmailPreferenceFlags, USER_EMAIL_PREFERENCE_KEYS } from '../src/shared/email-preferences.ts'

let failures = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  }
  catch (error) {
    failures += 1
    console.error(`❌ ${name}`)
    console.error(error)
  }
}

function help(...args) {
  const result = spawnSync(process.execPath, ['dist/index.js', ...args, '--help'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

await test('parses repeatable and comma separated email preference flags', () => {
  assert.deepEqual(
    parseEmailPreferenceFlags(['weekly_stats=false', 'device_error=true,monthly_stats'], ORG_EMAIL_PREFERENCE_KEYS),
    { weekly_stats: false, device_error: true, monthly_stats: true },
  )
  assert.equal(parseEmailPreferenceFlags([], ORG_EMAIL_PREFERENCE_KEYS), undefined)
  assert.equal(parseEmailPreferenceFlags(undefined, ORG_EMAIL_PREFERENCE_KEYS), undefined)
})

await test('rejects unknown email preference keys and non-boolean values', () => {
  assert.throws(() => parseEmailPreferenceFlags(['not_a_key=true'], ORG_EMAIL_PREFERENCE_KEYS), /Unknown email preference/)
  assert.throws(() => parseEmailPreferenceFlags(['weekly_stats=maybe'], ORG_EMAIL_PREFERENCE_KEYS), /must be true or false/)
})

await test('keeps account-only email preferences out of the org list', () => {
  assert.ok(!ORG_EMAIL_PREFERENCE_KEYS.includes('cli_realtime_feed'))
  assert.ok(USER_EMAIL_PREFERENCE_KEYS.includes('cli_realtime_feed'))
  assert.ok(USER_EMAIL_PREFERENCE_KEYS.includes('bundle_incompatible'))
  assert.throws(() => parseEmailPreferenceFlags(['cli_realtime_feed=false'], ORG_EMAIL_PREFERENCE_KEYS), /Unknown email preference/)
})

await test('rejects pausing and resuming a channel at once', () => {
  assert.equal(optionsSetChannelSchema.safeParse({ apikey: 'k', pause: true, resume: true }).success, false)
  assert.equal(optionsSetChannelSchema.safeParse({ apikey: 'k', pause: true, electron: false }).success, true)
})

await test('accepts every organization security setting in the SDK', () => {
  const parsed = updateOrganizationOptionsSchema.parse({
    orgId: 'org',
    website: null,
    enforce2fa: true,
    passwordPolicy: true,
    minLength: 12,
    requireApikeyExpiration: true,
    maxApikeyExpirationDays: null,
    enforceHashedApiKeys: true,
    enforceEncryptedBundles: true,
    requiredEncryptionKey: null,
    emailPreferences: { weekly_stats: false },
  })
  assert.equal(parsed.minLength, 12)
  assert.throws(() => updateOrganizationOptionsSchema.parse({ orgId: 'org', maxApikeyExpirationDays: 400 }))
})

const builtCli = new URL('../dist/index.js', import.meta.url)
const cliSource = new URL('../src/index.ts', import.meta.url)
if (!existsSync(builtCli) || statSync(builtCli).mtimeMs < statSync(cliSource).mtimeMs) {
  failures += 1
  console.error('❌ Run `bun run build` before this test; dist/index.js is missing or stale')
}
else {
  await test('registers channel electron and pause flags', () => {
    const output = help('channel', 'set')
    for (const flag of ['--electron', '--no-electron', '--pause', '--resume'])
      assert.match(output, new RegExp(`${flag}\\b`))
  })

  await test('registers new organization set flags on both command names', () => {
    for (const command of ['organization', 'organisation']) {
      const output = help(command, 'set')
      for (const flag of ['--website', '--enforce-encrypted-bundles', '--no-enforce-encrypted-bundles', '--required-encryption-key', '--email-preference'])
        assert.match(output, new RegExp(`${flag}\\b`), `${command} set is missing ${flag}`)
    }
  })

  await test('registers organization member management commands', () => {
    assert.match(help('organization', 'members-invite'), /--role/)
    assert.match(help('organization', 'members-role'), /--role/)
    assert.match(help('organization', 'members-remove'), /--email/)
  })

  await test('registers account get and set', () => {
    help('account', 'get')
    const output = help('account', 'set')
    for (const flag of ['--first-name', '--last-name', '--country', '--discord-username', '--format-locale', '--no-notifications', '--no-newsletter', '--email-preference'])
      assert.match(output, new RegExp(`${flag}\\b`))
  })
}

if (failures > 0) {
  console.error(`\n❌ ${failures} settings parity test(s) failed`)
  process.exit(1)
}

console.log('\n✅ Settings parity checks work')
