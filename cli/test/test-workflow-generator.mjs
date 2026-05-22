#!/usr/bin/env node

import process from 'node:process'
import { generateWorkflow, WORKFLOW_PATH } from '../src/build/onboarding/workflow-generator.ts'

console.log('🧪 Testing GitHub Actions workflow generator...\n')

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

function assertEquals(actual, expected, message) {
  if (actual !== expected)
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle))
    throw new Error(message || `Expected output to include:\n  ${needle}\nbut it did not. Output was:\n${haystack}`)
}

function assertExcludes(haystack, needle, message) {
  if (haystack.includes(needle))
    throw new Error(message || `Expected output to NOT include:\n  ${needle}\nbut it did. Output was:\n${haystack}`)
}

await test('writes to .github/workflows/capgo-build.yml', () => {
  const result = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'bun',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertEquals(result.path, '.github/workflows/capgo-build.yml')
  assertEquals(result.path, WORKFLOW_PATH)
})

await test('bun template includes BOTH setup-bun AND setup-node', () => {
  // Per maintainer convention: bun runs alongside Node so build scripts that
  // shell out to `node` directly or rely on Node-resolvable native binaries
  // still work; bun's Node compat isn't perfect.
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'bun',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertIncludes(content, 'oven-sh/setup-bun@v2')
  assertIncludes(content, 'actions/setup-node@v4')
  assertIncludes(content, 'bun install --frozen-lockfile')
  assertIncludes(content, 'bun run build')
  assertIncludes(content, 'bunx @capgo/cli@latest build request com.example.app')
})

await test('npm template uses npm ci, npm run, and npx', () => {
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'npm',
    buildScript: { type: 'npm-script', name: 'build:prod' },
    secretKeys: [],
  })
  assertIncludes(content, 'actions/setup-node@v4')
  assertExcludes(content, 'setup-bun', 'npm template should not include setup-bun')
  assertIncludes(content, `cache: 'npm'`)
  assertIncludes(content, 'npm ci')
  assertIncludes(content, 'npm run build:prod')
  assertIncludes(content, 'npx @capgo/cli@latest build request com.example.app')
})

await test('pnpm template includes pnpm setup AND setup-node with pnpm cache', () => {
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'android',
    packageManager: 'pnpm',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertIncludes(content, 'pnpm/action-setup@v4')
  assertIncludes(content, 'actions/setup-node@v4')
  assertIncludes(content, `cache: 'pnpm'`)
  assertIncludes(content, 'pnpm install --frozen-lockfile')
  assertIncludes(content, 'pnpm run build')
  assertIncludes(content, 'pnpm dlx @capgo/cli@latest build request')
})

await test('yarn template uses yarn (not yarn run) for npm-script', () => {
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'yarn',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertIncludes(content, `cache: 'yarn'`)
  assertIncludes(content, 'yarn install --frozen-lockfile')
  // yarn classic invokes scripts without `run`
  assertIncludes(content, '\n        run: |\n          yarn build\n')
  assertIncludes(content, 'npx @capgo/cli@latest build request')
  assertIncludes(content, 'URL=$(npx @capgo/cli@latest build last-output')
})

await test('custom build command is rendered verbatim', () => {
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'npm',
    buildScript: { type: 'custom', command: 'make web' },
    secretKeys: [],
  })
  assertIncludes(content, '\n        run: |\n          make web\n')
  assertExcludes(content, 'npm run', 'should not prepend npm run for custom command')
})

await test('custom build command with YAML-significant characters uses a block scalar', () => {
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'npm',
    buildScript: { type: 'custom', command: 'echo "a: b" # shell comment' },
    secretKeys: [],
  })
  assertIncludes(content, '\n        run: |\n          echo "a: b" # shell comment\n')
  assertExcludes(content, 'run: echo "a: b" # shell comment')
})

await test('skip build omits the build step but keeps install', () => {
  // Plain HTML/JS Capacitor apps exist (rare but real). They still need deps
  // installed (postinstall hooks, etc.) but have no separate build step.
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'bun',
    buildScript: { type: 'skip' },
    secretKeys: [],
  })
  assertIncludes(content, 'Install dependencies')
  assertExcludes(content, 'Build web assets', 'skip mode must omit the web build step')
})

await test('secret keys appear verbatim in env: block', () => {
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'bun',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [
      'P12_PASSWORD',
      'BUILD_CERTIFICATE_BASE64',
      'CAPGO_IOS_PROVISIONING_MAP_BASE64',
      'APP_STORE_CONNECT_KEY_ID',
      'CAPGO_TOKEN',
    ],
  })
  assertIncludes(content, '        env:')
  assertIncludes(content, '          P12_PASSWORD: ${{ secrets.P12_PASSWORD }}')
  assertIncludes(content, '          BUILD_CERTIFICATE_BASE64: ${{ secrets.BUILD_CERTIFICATE_BASE64 }}')
  assertIncludes(content, '          CAPGO_IOS_PROVISIONING_MAP_BASE64: ${{ secrets.CAPGO_IOS_PROVISIONING_MAP_BASE64 }}')
  assertIncludes(content, '          APP_STORE_CONNECT_KEY_ID: ${{ secrets.APP_STORE_CONNECT_KEY_ID }}')
  // CAPGO_TOKEN gets used both in --apikey and the env block; both must be present.
  assertIncludes(content, '--apikey ${{ secrets.CAPGO_TOKEN }}')
})

await test('empty secretKeys produces no env block', () => {
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'bun',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertExcludes(content, '\n        env:\n', 'empty secret list must not emit env block')
  // --apikey reference is still there even without an env block — the user can
  // wire CAPGO_TOKEN manually if they declined the secrets push.
  assertIncludes(content, '--apikey ${{ secrets.CAPGO_TOKEN }}')
})

await test('default platform respects the wizard-side selection', () => {
  const ios = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'bun',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertIncludes(ios.content, '        default: ios')

  const android = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'android',
    packageManager: 'bun',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertIncludes(android.content, '        default: android')
})

await test('workflow_dispatch trigger present, push/pr triggers absent', () => {
  // v1 intentionally limits to manual trigger. Push/PR triggers are out of
  // scope so we never accidentally fire a build on every commit.
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'bun',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertIncludes(content, 'workflow_dispatch:')
  assertExcludes(content, '\n  push:\n', 'v1 must not include push trigger')
  assertExcludes(content, '\n  pull_request:\n', 'v1 must not include pull_request trigger')
})

await test('artifact URL surface step uses GITHUB_STEP_SUMMARY', () => {
  const { content } = generateWorkflow({
    appId: 'com.example.app',
    defaultPlatform: 'ios',
    packageManager: 'bun',
    buildScript: { type: 'npm-script', name: 'build' },
    secretKeys: [],
  })
  assertIncludes(content, '--output-record /tmp/capgo-build.json')
  assertIncludes(content, 'build last-output --path /tmp/capgo-build.json --field outputUrl')
  assertIncludes(content, '$GITHUB_STEP_SUMMARY')
})

if (testsFailed > 0) {
  console.error(`\n❌ ${testsFailed} test(s) failed`)
  process.exit(1)
}
console.log(`\n✅ Workflow generator tests passed (${testsPassed})`)
