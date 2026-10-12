import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync as readSource } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setConfigWriteTarget } from '../src/config/index.ts'
import {
  CAPGO_APP_ID_OPT_IN_MESSAGE,
  generateRandomCapgoAppId,
  offerCapgoAppIdPrompt,
  persistCapgoAppIdToCapacitorConfig,
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

function makeConfigFixture(initialAppId = 'com.example.before') {
  const root = mkdtempSync(join(tmpdir(), 'capgo-app-id-prompt-'))
  const configPath = join(root, 'capacitor.config.json')
  writeFileSync(configPath, JSON.stringify({
    appId: initialAppId,
    appName: 'Test',
    webDir: 'www',
    plugins: {
      CapacitorUpdater: {
        appId: initialAppId,
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

await test('generateRandomCapgoAppId uses com.capgo prefix and valid shape', () => {
  const id = generateRandomCapgoAppId()
  assert.match(id, /^com\.capgo\.[a-f0-9]{16}$/)
})

await test('non-interactive skips without writing config', async () => {
  const { root, configPath } = makeConfigFixture()
  try {
    const outcome = await offerCapgoAppIdPrompt({ interactive: false })
    assert.equal(outcome, 'skipped')
    assert.equal(readConfig(configPath).appId, 'com.example.before')
  }
  finally {
    setConfigWriteTarget(undefined)
    rmSync(root, { recursive: true, force: true })
  }
})

await test('skip flag skips without writing config', async () => {
  const { root, configPath } = makeConfigFixture()
  try {
    const outcome = await offerCapgoAppIdPrompt({ skip: true, interactive: true })
    assert.equal(outcome, 'skipped')
    assert.equal(readConfig(configPath).appId, 'com.example.before')
  }
  finally {
    setConfigWriteTarget(undefined)
    rmSync(root, { recursive: true, force: true })
  }
})

await test('declining opt-in keeps existing app ID', async () => {
  const { root, configPath } = makeConfigFixture()
  try {
    const outcome = await offerCapgoAppIdPrompt({
      interactive: true,
      deps: {
        confirm: async () => false,
      },
    })
    assert.equal(outcome, 'declined')
    assert.equal(readConfig(configPath).appId, 'com.example.before')
    assert.equal(readConfig(configPath).plugins.CapacitorUpdater.appId, 'com.example.before')
  }
  finally {
    setConfigWriteTarget(undefined)
    rmSync(root, { recursive: true, force: true })
  }
})

await test('random path writes top-level and CapacitorUpdater appId', async () => {
  const { root, configPath } = makeConfigFixture()
  const generated = 'com.capgo.deadbeefcafebabe'
  try {
    const outcome = await offerCapgoAppIdPrompt({
      interactive: true,
      deps: {
        confirm: async () => true,
        select: async () => 'random',
        generateRandomAppId: () => generated,
        logSuccess: () => {},
        logWarn: () => {},
      },
    })
    assert.equal(outcome, 'saved-random')
    const config = readConfig(configPath)
    assert.equal(config.appId, generated)
    assert.equal(config.plugins.CapacitorUpdater.appId, generated)
  }
  finally {
    setConfigWriteTarget(undefined)
    rmSync(root, { recursive: true, force: true })
  }
})

await test('custom path writes typed app ID to both config fields', async () => {
  const { root, configPath } = makeConfigFixture()
  const custom = 'com.customer.encrypted'
  try {
    const outcome = await offerCapgoAppIdPrompt({
      interactive: true,
      deps: {
        confirm: async () => true,
        select: async () => 'custom',
        text: async () => custom,
        logSuccess: () => {},
        logWarn: () => {},
      },
    })
    assert.equal(outcome, 'saved-custom')
    const config = readConfig(configPath)
    assert.equal(config.appId, custom)
    assert.equal(config.plugins.CapacitorUpdater.appId, custom)
  }
  finally {
    setConfigWriteTarget(undefined)
    rmSync(root, { recursive: true, force: true })
  }
})

await test('persistCapgoAppIdToCapacitorConfig updates both fields', async () => {
  const { root, configPath } = makeConfigFixture()
  try {
    const saved = await persistCapgoAppIdToCapacitorConfig('com.example.saved')
    assert.equal(saved, true)
    const config = readConfig(configPath)
    assert.equal(config.appId, 'com.example.saved')
    assert.equal(config.plugins.CapacitorUpdater.appId, 'com.example.saved')
  }
  finally {
    setConfigWriteTarget(undefined)
    rmSync(root, { recursive: true, force: true })
  }
})

await test('key create wires offerCapgoAppIdPrompt and skip flag in CLI', () => {
  const keySource = readSource(join(cliRoot, 'src/key.ts'), 'utf8')
  const indexSource = readSource(join(cliRoot, 'src/index.ts'), 'utf8')
  const initSource = readSource(join(cliRoot, 'src/init/command.ts'), 'utf8')
  assert.ok(keySource.includes('offerCapgoAppIdPrompt'))
  assert.ok(keySource.includes('skipCapgoAppIdPrompt'))
  assert.ok(indexSource.includes('--skip-capgo-app-id-prompt'))
  assert.ok(initSource.includes('offerCapgoAppIdPrompt'))
  assert.ok(initSource.includes("finalSummary.phase === 'enabled'") || initSource.includes('finalSummary.phase === \'enabled\''))
})

await test('opt-in message is stable', () => {
  assert.ok(CAPGO_APP_ID_OPT_IN_MESSAGE.includes('CapacitorUpdater.appId'))
})

if (failures > 0) {
  console.error(`\n❌ ${failures} capgo app id prompt test(s) failed`)
  process.exit(1)
}

console.log('\n✅ Capgo app ID prompt tests passed')
