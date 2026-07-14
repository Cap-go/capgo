import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { getConfigWriteTarget, resolveCapacitorConfigTargetPath, setConfigWriteTarget } from '../src/config/index.ts'
import { createKeyInternal } from '../src/key.ts'

const cliRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const root = mkdtempSync(join(cliRoot, '.capgo-config-target-'))
const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  promise.then(
    value => { clearTimeout(timer); resolve(value) },
    error => { clearTimeout(timer); reject(error) },
  )
})

let transport
let mcpStderr = ''
try {
  const configDir = join(root, 'env-configs')
  const directoryTarget = join(root, 'directory-target')
  const rootConfig = join(root, 'capacitor.config.json')
  const configTarget = join(configDir, 'capacitor.config.qr-code-reader.ts')
  const rootConfigSource = JSON.stringify({
    appId: 'com.example.app',
    appName: 'Example',
    webDir: 'www',
    plugins: {
      CapacitorUpdater: {
        appId: 'com.example.app',
      },
    },
  }, null, 2)

  const appDir = join(root, 'apps', 'qr-code-reader')
  mkdirSync(configDir, { recursive: true })
  mkdirSync(directoryTarget)
  mkdirSync(appDir, { recursive: true })
  writeFileSync(join(root, 'package.json'), '{}')
  writeFileSync(rootConfig, rootConfigSource)
  writeFileSync(configTarget, 'export default {}\n')
  writeFileSync(join(configDir, 'not-a-capacitor-config.ts'), 'export default {}\n')

  assert.equal(resolveCapacitorConfigTargetPath('./env-configs/capacitor.config.qr-code-reader.ts', root), configTarget)
  assert.throws(() => resolveCapacitorConfigTargetPath('./missing.ts', root), /Capacitor config path does not exist/)
  assert.throws(() => resolveCapacitorConfigTargetPath('./directory-target', root), /Capacitor config path does not exist/)
  assert.throws(() => resolveCapacitorConfigTargetPath('', root), /Capacitor config path must not be empty/)

  const previousCwd = process.cwd()
  const previousConfigWriteTarget = getConfigWriteTarget()
  try {
    process.chdir(appDir)
    setConfigWriteTarget(configTarget)
    await createKeyInternal({ force: true, setupChannel: false }, true, root)
  }
  finally {
    process.chdir(previousCwd)
    setConfigWriteTarget(previousConfigWriteTarget)
  }

  assert.ok(existsSync(join(appDir, '.capgo_key_v2')))
  assert.ok(existsSync(join(appDir, '.capgo_key_v2.pub')))
  assert.match(readFileSync(configTarget, 'utf8'), /publicKey/)
  assert.equal(readFileSync(rootConfig, 'utf8'), rootConfigSource)
  assert.throws(() => resolveCapacitorConfigTargetPath('./env-configs/not-a-capacitor-config.ts', root), /must point to a capacitor.config/)

  const command = spawnSync('node', [
    join(cliRoot, 'dist/index.js'),
    'app',
    'setting',
    'plugins.CapacitorUpdater.autoUpdate',
    '--bool',
    'false',
    '--capacitor-config',
    configTarget,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CAPGO_DISABLE_TELEMETRY: 'true' },
  })

  assert.equal(command.status, 0, `${command.stdout}\n${command.stderr}`)
  assert.match(readFileSync(configTarget, 'utf8'), /autoUpdate:\s*false/)
  assert.equal(readFileSync(rootConfig, 'utf8'), rootConfigSource)

  const mcpHelp = spawnSync('node', [join(cliRoot, 'dist/index.js'), 'mcp', '--help'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CAPGO_DISABLE_TELEMETRY: 'true' },
  })
  assert.equal(mcpHelp.status, 0, `${mcpHelp.stdout}\n${mcpHelp.stderr}`)
  assert.match(mcpHelp.stdout, /--capacitor-config <path>/)

  transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(cliRoot, 'dist/index.js'), 'mcp', '--capacitor-config', configTarget],
    cwd: root,
    env: { ...process.env, CAPGO_DISABLE_TELEMETRY: 'true' },
    stderr: 'pipe',
  })
  if (transport.stderr)
    transport.stderr.on('data', chunk => { mcpStderr += chunk.toString() })

  const client = new Client({ name: 'capgo-config-target-test', version: '0.0.0' })
  await withTimeout(client.connect(transport), 10000, 'MCP connect')
  const result = await withTimeout(client.callTool({ name: 'capgo_generate_encryption_keys', arguments: { force: true } }), 30000, 'MCP encryption key generation')
  assert.equal(result.isError, undefined, JSON.stringify(result))
  assert.match(readFileSync(configTarget, 'utf8'), /publicKey/)
  assert.equal(readFileSync(rootConfig, 'utf8'), rootConfigSource)
  console.log('✅ capacitor config target tests passed')
}
finally {
  try {
    await transport?.close()
  }
  catch {
    // The process may already be closed after an MCP failure.
  }
  if (mcpStderr)
    console.error(mcpStderr.trim())
  rmSync(root, { recursive: true, force: true })
}
