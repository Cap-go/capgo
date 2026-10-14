import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readFileSync as readSource, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setConfigWriteTarget } from '../src/config/index.ts'
import {
  CAPGO_APP_ID_OPT_IN_MESSAGE,
  generateRandomCapgoAppId,
  offerCapgoAppIdPrompt,
} from '../src/key/capgoAppIdPrompt.ts'

const cliRoot = dirname(dirname(fileURLToPath(import.meta.url)))
let failures = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`✅ ${name}`)
  }
  catch (error) {
    failures += 1
    console.error(`❌ ${name}`)
    console.error(error)
  }
}

function makeConfigFixture(updaterAppId) {
  const root = mkdtempSync(join(tmpdir(), 'capgo-app-id-prompt-'))
  const configPath = join(root, 'capacitor.config.json')
  writeFileSync(configPath, JSON.stringify({
    appId: 'com.example.native',
    appName: 'Test',
    webDir: 'www',
    plugins: {
      CapacitorUpdater: {
        ...(updaterAppId ? { appId: updaterAppId } : {}),
        publicKey: '-----BEGIN RSA PUBLIC KEY-----\nTEST\n-----END RSA PUBLIC KEY-----',
      },
    },
  }, null, 2), 'utf8')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test-app' }), 'utf8')
  setConfigWriteTarget(configPath)
  return { root, configPath }
}

function readConfig(configPath) {
  return JSON.parse(readFileSync(configPath, 'utf8'))
}

const quiet = { logSuccess: () => {}, logWarn: () => {} }

async function withFixture(fn, initialAppId) {
  const { root, configPath } = makeConfigFixture(initialAppId)
  try {
    await fn(configPath)
  }
  finally {
    setConfigWriteTarget(undefined)
    rmSync(root, { recursive: true, force: true })
  }
}

await test('generateRandomCapgoAppId uses com.capgo prefix and valid shape', () => {
  const id = generateRandomCapgoAppId()
  assert.match(id, /^com\.capgo\.[a-f0-9]{16}$/)
})

await test('non-interactive skips without writing config', () => withFixture(async (configPath) => {
  const outcome = await offerCapgoAppIdPrompt({ interactive: false })
  assert.equal(outcome, 'skipped')
  assert.equal(readConfig(configPath).plugins.CapacitorUpdater.appId, undefined)
}))

await test('skip flag skips without writing config', () => withFixture(async (configPath) => {
  const outcome = await offerCapgoAppIdPrompt({ skip: true, interactive: true })
  assert.equal(outcome, 'skipped')
  assert.equal(readConfig(configPath).plugins.CapacitorUpdater.appId, undefined)
}))

await test('existing CapacitorUpdater.appId skips without prompting', () => withFixture(async (configPath) => {
  const outcome = await offerCapgoAppIdPrompt({
    interactive: true,
    deps: {
      findApiKey: () => 'key',
      confirm: async () => { throw new Error('should not prompt') },
    },
  })
  assert.equal(outcome, 'skipped')
  assert.equal(readConfig(configPath).plugins.CapacitorUpdater.appId, 'com.example.updater')
}, 'com.example.updater'))

await test('missing API key skips without prompting', () => withFixture(async (configPath) => {
  const outcome = await offerCapgoAppIdPrompt({
    interactive: true,
    deps: {
      findApiKey: () => undefined,
      confirm: async () => { throw new Error('should not prompt') },
    },
  })
  assert.equal(outcome, 'skipped')
  assert.equal(readConfig(configPath).plugins.CapacitorUpdater.appId, undefined)
}))

await test('declining keeps config untouched and creates nothing', () => withFixture(async (configPath) => {
  let created = false
  const outcome = await offerCapgoAppIdPrompt({
    interactive: true,
    deps: {
      findApiKey: () => 'key',
      confirm: async () => false,
      createApp: async () => { created = true },
    },
  })
  assert.equal(outcome, 'declined')
  assert.equal(created, false)
  assert.equal(readConfig(configPath).plugins.CapacitorUpdater.appId, undefined)
}))

await test('accepting creates random app in backend then writes CapacitorUpdater.appId only', () => withFixture(async (configPath) => {
  const generated = 'com.capgo.deadbeefcafebabe'
  const calls = []
  const outcome = await offerCapgoAppIdPrompt({
    interactive: true,
    deps: {
      ...quiet,
      findApiKey: () => 'key',
      confirm: async () => true,
      generateRandomAppId: () => generated,
      createApp: async (appId, apikey) => { calls.push([appId, apikey]) },
    },
  })
  assert.equal(outcome, 'saved')
  assert.deepEqual(calls, [[generated, 'key']])
  const config = readConfig(configPath)
  assert.equal(config.appId, 'com.example.native')
  assert.equal(config.plugins.CapacitorUpdater.appId, generated)
}))

await test('backend create failure does not write config', () => withFixture(async (configPath) => {
  const outcome = await offerCapgoAppIdPrompt({
    interactive: true,
    deps: {
      ...quiet,
      findApiKey: () => 'key',
      confirm: async () => true,
      createApp: async () => { throw new Error('boom') },
    },
  })
  assert.equal(outcome, 'failed')
  assert.equal(readConfig(configPath).plugins.CapacitorUpdater.appId, undefined)
}))

await test('key create wires prompt and skip flag; init does not', () => {
  const keySource = readSource(join(cliRoot, 'src/key.ts'), 'utf8')
  const indexSource = readSource(join(cliRoot, 'src/index.ts'), 'utf8')
  const initSource = readSource(join(cliRoot, 'src/init/command.ts'), 'utf8')
  assert.ok(keySource.includes('offerCapgoAppIdPrompt'))
  assert.ok(keySource.includes('skipCapgoAppIdPrompt'))
  assert.ok(indexSource.includes('--skip-capgo-app-id-prompt'))
  assert.ok(!initSource.includes('offerCapgoAppIdPrompt'))
})

await test('opt-in message mentions CapacitorUpdater.appId', () => {
  assert.ok(CAPGO_APP_ID_OPT_IN_MESSAGE.includes('CapacitorUpdater.appId'))
})

if (failures > 0) {
  console.error(`\n❌ ${failures} capgo app id prompt test(s) failed`)
  process.exit(1)
}

console.log('\n✅ Capgo app ID prompt tests passed')
