#!/usr/bin/env node

import {
  createCiSecretEntries,
  detectCiSecretTargets,
  getCiSecretRepoLabel,
  listExistingCiSecretKeys,
  uploadCiSecrets,
} from '../src/build/onboarding/ci-secrets.ts'

console.log('🧪 Testing build onboarding CI secret helpers...\n')

let testsPassed = 0
let testsFailed = 0

async function test(name, fn) {
  try {
    console.log(`\n🔍 ${name}`)
    await fn()
    console.log(`✅ PASSED: ${name}`)
    testsPassed++
  }
  catch (error) {
    console.error(`❌ FAILED: ${name}`)
    console.error(`   Error: ${error.message}`)
    testsFailed++
  }
}

function assert(condition, message) {
  if (!condition)
    throw new Error(message || 'Assertion failed')
}

function assertEquals(actual, expected, message) {
  if (actual !== expected)
    throw new Error(message || `Expected ${expected}, got ${actual}`)
}

function assertDeepEquals(actual, expected, message) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson)
    throw new Error(message || `Expected ${expectedJson}, got ${actualJson}`)
}

function createRunner(handlers) {
  const calls = []
  const runner = (command, args, options = {}) => {
    calls.push({ command, args, input: options.input })
    const key = `${command} ${args.join(' ')}`
    const handler = handlers[key] || handlers[command]
    if (!handler)
      return { status: 1, stdout: '', stderr: `unexpected command: ${key}` }
    return typeof handler === 'function'
      ? handler(command, args, options)
      : handler
  }
  runner.calls = calls
  return runner
}

await test('creates env entries and converts provisioning map to base64', () => {
  const entries = createCiSecretEntries({
    BUILD_CERTIFICATE_BASE64: 'cert',
    P12_PASSWORD: 'pass',
    CAPGO_IOS_PROVISIONING_MAP: '{"com.example.app":{"profile":"abc","name":"main"}}',
    APP_STORE_CONNECT_TEAM_ID: 'TEAM123',
    KEYSTORE_KEY_ALIAS: '',
  })

  const keys = entries.map(entry => entry.key)
  assert(keys.includes('BUILD_CERTIFICATE_BASE64'), 'Expected certificate entry')
  assert(keys.includes('P12_PASSWORD'), 'Expected p12 password entry')
  assert(keys.includes('CAPGO_IOS_PROVISIONING_MAP_BASE64'), 'Expected base64 provisioning map entry')
  assert(!keys.includes('CAPGO_IOS_PROVISIONING_MAP'), 'Raw provisioning map should not be uploaded')
  assert(!keys.includes('KEYSTORE_KEY_ALIAS'), 'Empty values should not be uploaded')

  const mapEntry = entries.find(entry => entry.key === 'CAPGO_IOS_PROVISIONING_MAP_BASE64')
  assertEquals(
    Buffer.from(mapEntry.value, 'base64').toString('utf8'),
    '{"com.example.app":{"profile":"abc","name":"main"}}',
  )
  assert(mapEntry.masked, 'Provisioning map base64 should be masked')
})

await test('omits CAPGO_TOKEN when no API key is provided', () => {
  const entries = createCiSecretEntries({ BUILD_CERTIFICATE_BASE64: 'cert' })
  const keys = entries.map(entry => entry.key)
  assert(!keys.includes('CAPGO_TOKEN'), 'CAPGO_TOKEN should be absent without an API key')
})

await test('includes a masked CAPGO_TOKEN when an API key is provided', () => {
  // The generated GitHub Actions workflow references ${{ secrets.CAPGO_TOKEN }}
  // for --apikey, so the wizard must push it alongside build credentials.
  const entries = createCiSecretEntries({ BUILD_CERTIFICATE_BASE64: 'cert' }, 'cap_test_apikey_xyz')
  const tokenEntry = entries.find(entry => entry.key === 'CAPGO_TOKEN')
  assert(tokenEntry !== undefined, 'CAPGO_TOKEN should be pushed when API key is provided')
  assertEquals(tokenEntry.value, 'cap_test_apikey_xyz')
  assert(tokenEntry.masked, 'CAPGO_TOKEN must be masked')
})

await test('treats an empty-string API key as "no token" (no entry)', () => {
  const entries = createCiSecretEntries({ BUILD_CERTIFICATE_BASE64: 'cert' }, '')
  assert(!entries.some(e => e.key === 'CAPGO_TOKEN'), 'Empty API key must not produce a CAPGO_TOKEN entry')
})

await test('trims the API key before creating CAPGO_TOKEN', () => {
  const entries = createCiSecretEntries({ BUILD_CERTIFICATE_BASE64: 'cert' }, '  capgo_token_value  ')
  const tokenEntry = entries.find(entry => entry.key === 'CAPGO_TOKEN')
  assert(tokenEntry !== undefined, 'Trimmed API key should produce a CAPGO_TOKEN entry')
  assertEquals(tokenEntry.value, 'capgo_token_value')
  assert(tokenEntry.masked, 'CAPGO_TOKEN must stay masked')
})

await test('detects authenticated GitHub target from git remotes', () => {
  const runner = createRunner({
    'git remote -v': {
      status: 0,
      stdout: 'origin\tgit@github.com:Cap-go/capgo.git (fetch)\norigin\tgit@github.com:Cap-go/capgo.git (push)\n',
      stderr: '',
    },
    'gh --version': { status: 0, stdout: 'gh version 2.0.0', stderr: '' },
    'gh auth status': { status: 0, stdout: 'Logged in', stderr: '' },
  })

  const discovery = detectCiSecretTargets(runner)
  assertEquals(discovery.targets.length, 1)
  assertEquals(discovery.targets[0].provider, 'github')
  assertEquals(discovery.setup.length, 0)
  assertEquals(discovery.notes.length, 0)
})

await test('returns GitLab setup instructions when glab is missing', () => {
  const runner = createRunner({
    'git remote -v': {
      status: 0,
      stdout: 'origin\thttps://gitlab.com/group/project.git (fetch)\n',
      stderr: '',
    },
    'glab --version': { status: 1, stdout: '', stderr: 'command not found' },
  })

  const discovery = detectCiSecretTargets(runner)
  assertEquals(discovery.targets.length, 0)
  assertEquals(discovery.setup.length, 1)
  assertEquals(discovery.setup[0].target.provider, 'gitlab')
  assertEquals(discovery.setup[0].reason, 'not-installed')
  assert(discovery.setup[0].commands.includes('glab auth login'), 'Expected login command')
})

await test('returns GitHub login instructions when gh is not authenticated', () => {
  const runner = createRunner({
    'git remote -v': {
      status: 0,
      stdout: 'origin\thttps://github.com/Cap-go/capgo.git (fetch)\n',
      stderr: '',
    },
    'gh --version': { status: 0, stdout: 'gh version 2.0.0', stderr: '' },
    'gh auth status': { status: 1, stdout: '', stderr: 'not logged in' },
  })

  const discovery = detectCiSecretTargets(runner)
  assertEquals(discovery.targets.length, 0)
  assertEquals(discovery.setup.length, 1)
  assertEquals(discovery.setup[0].target.provider, 'github')
  assertEquals(discovery.setup[0].reason, 'not-authenticated')
  assertDeepEquals(discovery.setup[0].commands, ['gh auth login'])
})

await test('lists existing GitHub secrets by requested key order', () => {
  const runner = createRunner({
    'gh secret list --json name': {
      status: 0,
      stdout: JSON.stringify([{ name: 'P12_PASSWORD' }, { name: 'APPLE_KEY_ID' }]),
      stderr: '',
    },
  })

  const existing = listExistingCiSecretKeys(
    { provider: 'github', label: 'GitHub Actions repository secrets', cli: 'gh' },
    ['APPLE_KEY_ID', 'NOPE', 'P12_PASSWORD'],
    runner,
  )
  assertDeepEquals(existing, ['APPLE_KEY_ID', 'P12_PASSWORD'])
})

await test('lists existing GitLab variables from json output', () => {
  const runner = createRunner({
    'glab variable list --output json --per-page 100 --page 1': {
      status: 0,
      stdout: JSON.stringify([{ key: 'PLAY_CONFIG_JSON' }, { key: 'KEYSTORE_KEY_ALIAS' }]),
      stderr: '',
    },
  })

  const existing = listExistingCiSecretKeys(
    { provider: 'gitlab', label: 'GitLab CI/CD variables', cli: 'glab' },
    ['PLAY_CONFIG_JSON', 'MISSING', 'KEYSTORE_KEY_ALIAS'],
    runner,
  )
  assertDeepEquals(existing, ['PLAY_CONFIG_JSON', 'KEYSTORE_KEY_ALIAS'])
})

await test('uploads GitHub secrets through stdin', () => {
  const runner = createRunner({
    gh: { status: 0, stdout: '', stderr: '' },
  })

  uploadCiSecrets(
    { provider: 'github', label: 'GitHub Actions repository secrets', cli: 'gh' },
    [{ key: 'P12_PASSWORD', value: 'secret-pass', masked: true }],
    [],
    runner,
  )

  assertDeepEquals(runner.calls, [
    {
      command: 'gh',
      args: ['secret', 'set', 'P12_PASSWORD'],
      input: 'secret-pass',
    },
  ])
})

await test('uploads GitLab variables using set/update and masks only secret keys', () => {
  const runner = createRunner({
    glab: { status: 0, stdout: '', stderr: '' },
  })

  uploadCiSecrets(
    { provider: 'gitlab', label: 'GitLab CI/CD variables', cli: 'glab' },
    [
      { key: 'PLAY_CONFIG_JSON', value: 'json', masked: true },
      { key: 'KEYSTORE_KEY_ALIAS', value: 'release', masked: false },
    ],
    ['PLAY_CONFIG_JSON'],
    runner,
  )

  assertDeepEquals(runner.calls, [
    {
      command: 'glab',
      args: ['variable', 'update', 'PLAY_CONFIG_JSON', '--raw', '--masked'],
      input: 'json',
    },
    {
      command: 'glab',
      args: ['variable', 'set', 'KEYSTORE_KEY_ALIAS', '--raw'],
      input: 'release',
    },
  ])
})

const GITHUB_TARGET = { provider: 'github', label: 'GitHub Actions repository secrets', cli: 'gh' }
const GITLAB_TARGET = { provider: 'gitlab', label: 'GitLab CI/CD variables', cli: 'glab' }

await test('getCiSecretRepoLabel returns the gh-resolved nameWithOwner for GitHub', () => {
  const runner = createRunner({
    'gh repo view --json nameWithOwner -q .nameWithOwner': { status: 0, stdout: 'Cap-go/capgo\n', stderr: '' },
  })
  assertEquals(getCiSecretRepoLabel(GITHUB_TARGET, runner), 'Cap-go/capgo')
})

await test('getCiSecretRepoLabel returns null when gh repo view fails', () => {
  // No matching handler → createRunner returns status: 1 by default
  const runner = createRunner({})
  assertEquals(getCiSecretRepoLabel(GITHUB_TARGET, runner), null)
})

await test('getCiSecretRepoLabel trims trailing whitespace from gh output', () => {
  const runner = createRunner({
    'gh repo view --json nameWithOwner -q .nameWithOwner': { status: 0, stdout: '   owner/repo   \n', stderr: '' },
  })
  assertEquals(getCiSecretRepoLabel(GITHUB_TARGET, runner), 'owner/repo')
})

await test('getCiSecretRepoLabel parses path_with_namespace from glab JSON output', () => {
  const runner = createRunner({
    'glab repo view -F json': {
      status: 0,
      stdout: JSON.stringify({ path_with_namespace: 'group/sub/project', name: 'project' }),
      stderr: '',
    },
  })
  assertEquals(getCiSecretRepoLabel(GITLAB_TARGET, runner), 'group/sub/project')
})

await test('getCiSecretRepoLabel returns null on glab JSON parse failure', () => {
  const runner = createRunner({
    'glab repo view -F json': { status: 0, stdout: 'not-valid-json', stderr: '' },
  })
  assertEquals(getCiSecretRepoLabel(GITLAB_TARGET, runner), null)
})

if (testsFailed > 0) {
  console.error(`\n❌ ${testsFailed} CI secret helper test(s) failed`)
  process.exit(1)
}

console.log(`\n✅ CI secret helper tests passed (${testsPassed})`)
