#!/usr/bin/env node
// --build-env / CAPGO_BUILD_ENV parsing and --post-build-script validation.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { parseBuildEnv, resolvePostBuildScript } = await import('../src/build/build-env.ts')

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
  }
  catch (error) {
    failed++
    console.error(`❌ ${name}: ${error.message}`)
  }
}
function assertEquals(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
function assertThrows(fn, pattern) {
  try {
    fn()
  }
  catch (error) {
    if (!pattern.test(error.message))
      throw new Error(`Unexpected error: ${error.message}`)
    return
  }
  throw new Error('Expected an error')
}

test('KEY reads the value from the environment, KEY=VALUE is literal', () => {
  assertEquals(
    parseBuildEnv(['SENTRY_AUTH_TOKEN', 'SENTRY_ORG=acme'], { SENTRY_AUTH_TOKEN: 'secret' }),
    { SENTRY_AUTH_TOKEN: 'secret', SENTRY_ORG: 'acme' },
  )
})

test('CAPGO_BUILD_ENV lists names, CLI entries win', () => {
  assertEquals(
    parseBuildEnv(['B=cli'], { CAPGO_BUILD_ENV: 'A, B', A: '1', B: 'env' }),
    { A: '1', B: 'cli' },
  )
})

test('values may contain =', () => {
  assertEquals(parseBuildEnv(['DSN=https://x@y/1?a=b'], {}), { DSN: 'https://x@y/1?a=b' })
})

test('missing env value fails', () => {
  assertThrows(() => parseBuildEnv(['SENTRY_AUTH_TOKEN'], {}), /not set/)
})

test('invalid and reserved names fail', () => {
  assertThrows(() => parseBuildEnv(['lower=1'], {}), /uppercase/)
  assertThrows(() => parseBuildEnv(['CAPGO_IOS_SCHEME=App'], {}), /reserved/)
  assertThrows(() => parseBuildEnv(['P12_PASSWORD=x'], {}), /reserved/)
  assertThrows(() => parseBuildEnv(['OUTPUT_UPLOAD_URL_IOS=x'], {}), /reserved/)
})

const root = mkdtempSync(join(tmpdir(), 'capgo-post-build-'))
mkdirSync(join(root, 'scripts'))
writeFileSync(join(root, 'scripts', 'post-build.sh'), 'echo hi\n')
const outside = mkdtempSync(join(tmpdir(), 'capgo-outside-'))
writeFileSync(join(outside, 'evil.sh'), 'echo evil\n')
symlinkSync(join(outside, 'evil.sh'), join(root, 'link.sh'))

test('post-build script resolves project-relative', () => {
  assertEquals(resolvePostBuildScript(root, './scripts/post-build.sh'), 'scripts/post-build.sh')
  assertEquals(resolvePostBuildScript(root, undefined), undefined)
})

test('post-build script must exist inside the project', () => {
  assertThrows(() => resolvePostBuildScript(root, 'missing.sh'), /not found/)
  assertThrows(() => resolvePostBuildScript(root, join(outside, 'evil.sh')), /inside the project/)
  assertThrows(() => resolvePostBuildScript(root, 'link.sh'), /inside the project/)
})

rmSync(root, { recursive: true, force: true })
rmSync(outside, { recursive: true, force: true })

if (failed > 0)
  process.exit(1)
console.log('\n✅ All build env tests passed!')
