#!/usr/bin/env node
/** Unit tests for the Gradle applicationId extractor. */

console.log('🧪 Testing Gradle applicationId extractor...\n')

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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed') }
function assertEquals(a, b, msg) {
  const as = JSON.stringify(a)
  const bs = JSON.stringify(b)
  if (as !== bs) throw new Error(msg || `Expected ${bs}, got ${as}`)
}

async function imp() {
  return await import('../src/build/onboarding/android/gradle-parser.ts')
}

await test('extractApplicationIds handles Groovy defaultConfig', async () => {
  const { extractApplicationIds } = await imp()
  const src = `
android {
    defaultConfig {
        applicationId "com.example.app"
        versionCode 1
    }
}`
  assertEquals(extractApplicationIds(src), ['com.example.app'])
})

await test('extractApplicationIds handles Kotlin DSL (=)', async () => {
  const { extractApplicationIds } = await imp()
  const src = `
android {
    defaultConfig {
        applicationId = "com.example.kotlin"
    }
}`
  assertEquals(extractApplicationIds(src), ['com.example.kotlin'])
})

await test('extractApplicationIds picks up multiple flavors', async () => {
  const { extractApplicationIds } = await imp()
  const src = `
android {
    defaultConfig {
        applicationId "com.example.app"
    }
    productFlavors {
        free {
            applicationId "com.example.app.free"
        }
        pro {
            applicationId "com.example.app.pro"
        }
    }
}`
  const ids = extractApplicationIds(src)
  assert(ids.includes('com.example.app'))
  assert(ids.includes('com.example.app.free'))
  assert(ids.includes('com.example.app.pro'))
  assertEquals(ids.length, 3)
})

await test('extractApplicationIds ignores applicationIdSuffix', async () => {
  const { extractApplicationIds } = await imp()
  const src = `
android {
    defaultConfig {
        applicationId "com.example.app"
    }
    buildTypes {
        debug {
            applicationIdSuffix ".debug"
        }
    }
}`
  assertEquals(extractApplicationIds(src), ['com.example.app'])
})

await test('extractApplicationIds handles single quotes', async () => {
  const { extractApplicationIds } = await imp()
  const src = `defaultConfig { applicationId 'com.example.single' }`
  assertEquals(extractApplicationIds(src), ['com.example.single'])
})

await test('extractApplicationIds returns empty list on no matches', async () => {
  const { extractApplicationIds } = await imp()
  assertEquals(extractApplicationIds('no gradle here'), [])
  assertEquals(extractApplicationIds(''), [])
})

await test('extractApplicationIds dedupes identical values', async () => {
  const { extractApplicationIds } = await imp()
  const src = `
applicationId "com.example.app"
applicationId = "com.example.app"
`
  assertEquals(extractApplicationIds(src), ['com.example.app'])
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
