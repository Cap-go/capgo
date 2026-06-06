// test/prescan/checks-android-project.test.ts
import { describe, expect, it } from 'bun:test'
import {
  agp8PackageAttr,
  cordovaVarsPresent,
  flavorExists,
  gradlePropsHeuristics,
  playSaJson,
} from '../../src/build/prescan/checks/android-project'
import { makeCtx, makeProject } from './helpers'

const aCtx = (dir: string, extra: object = {}) => makeCtx({ projectDir: dir, platform: 'android', ...extra })

describe('android/cordova-vars-present', () => {
  it('errors when cordova plugins exist but variables file is missing', async () => {
    const dir = makeProject({
      'package.json': JSON.stringify({ dependencies: { 'cordova-plugin-device': '2.0.0' } }),
      'android/app/build.gradle': '',
    })
    const f = await cordovaVarsPresent.run(aCtx(dir))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.fix).toContain('cap sync')
  })
  it('passes when the file exists', async () => {
    const dir = makeProject({
      'package.json': JSON.stringify({ dependencies: { 'cordova-plugin-device': '2.0.0' } }),
      'android/capacitor-cordova-android-plugins/cordova.variables.gradle': 'ext {}',
    })
    expect(await cordovaVarsPresent.run(aCtx(dir))).toEqual([])
  })
  it('does not apply without cordova plugins', async () => {
    const dir = makeProject({ 'package.json': JSON.stringify({ dependencies: {} }) })
    expect(cordovaVarsPresent.appliesTo!(aCtx(dir))).toBe(false)
  })
})

describe('android/gradle-props-heuristics', () => {
  const settings = Array.from({ length: 40 }, (_, i) => `include ':plugin-${i}'`).join('\n')
  it('warns: many modules + parallel off', async () => {
    const dir = makeProject({
      'android/capacitor.settings.gradle': settings,
      'android/gradle.properties': 'org.gradle.jvmargs=-Xmx4096m',
    })
    const f = await gradlePropsHeuristics.run(aCtx(dir))
    expect(f.some(x => x.title.includes('parallel'))).toBe(true)
  })
  it('warns: workers.max=1 neutering parallel', async () => {
    const dir = makeProject({
      'android/capacitor.settings.gradle': settings,
      'android/gradle.properties': 'org.gradle.parallel=true\norg.gradle.workers.max=1',
    })
    const f = await gradlePropsHeuristics.run(aCtx(dir))
    expect(f.some(x => x.title.includes('workers.max'))).toBe(true)
  })
  it('warns: low heap with many modules', async () => {
    const dir = makeProject({
      'android/capacitor.settings.gradle': settings,
      'android/gradle.properties': 'org.gradle.parallel=true\norg.gradle.jvmargs=-Xmx1536m',
    })
    const f = await gradlePropsHeuristics.run(aCtx(dir))
    expect(f.some(x => x.title.includes('heap') || x.title.includes('Xmx'))).toBe(true)
  })
  it('silent on a small, tuned project', async () => {
    const dir = makeProject({
      'android/capacitor.settings.gradle': `include ':capacitor-android'`,
      'android/gradle.properties': 'org.gradle.jvmargs=-Xmx1536m',
    })
    expect(await gradlePropsHeuristics.run(aCtx(dir))).toEqual([])
  })
})

describe('android/play-sa-json', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64')
  it('errors on non-service-account json', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: b64({ type: 'authorized_user' }) } })
    expect((await playSaJson.run(ctx))[0]?.severity).toBe('error')
  })
  it('errors on missing private_key', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: b64({ type: 'service_account', client_email: 'a@b.iam' }) } })
    expect((await playSaJson.run(ctx))[0]?.detail).toContain('private_key')
  })
  it('passes a complete service account', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: b64({ type: 'service_account', client_email: 'a@b.iam', private_key: '-----BEGIN PRIVATE KEY-----' }) } })
    expect(await playSaJson.run(ctx)).toEqual([])
  })
  it('errors (not crashes) when the payload is not decodable JSON', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: Buffer.from('not json at all').toString('base64') } })
    const f = await playSaJson.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('valid JSON')
  })
  it('errors (not crashes) when the payload decodes to JSON null', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: Buffer.from('null').toString('base64') } })
    const f = await playSaJson.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('valid JSON')
  })
  it('errors (not crashes) when the payload decodes to a JSON array', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: b64([{ type: 'service_account' }]) } })
    const f = await playSaJson.run(ctx)
    expect(f[0]?.severity).toBe('error')
  })
})

describe('android/flavor-exists', () => {
  // realistic multi-line layout: buildTypes AFTER productFlavors — a greedy regex
  // would swallow buildTypes/release/dependencies into the flavor list
  const GROOVY_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace "com.demo.app"
    flavorDimensions "env"
    productFlavors {
        dev {
            dimension "env"
            applicationIdSuffix ".dev"
        }
        prod {
            dimension "env"
        }
    }
    buildTypes {
        release {
            minifyEnabled true
        }
        debug {
            minifyEnabled false
        }
    }
}

dependencies {
    implementation project(':capacitor-android')
}
`
  const KTS_GRADLE = `plugins { id("com.android.application") }

android {
    namespace = "com.demo.app"
    flavorDimensions += "env"
    productFlavors {
        create("demo") {
            dimension = "env"
        }
        register("prod") {
            dimension = "env"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
        }
    }
}
`
  it('errors on unknown flavor, listing ALL declared flavors (and nothing else)', async () => {
    const ctx = aCtx(makeProject({ 'android/app/build.gradle': GROOVY_GRADLE }), { androidFlavor: 'staging' })
    const f = await flavorExists.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail).toBe('declared flavors: dev, prod')
  })
  it('passes the FIRST declared flavor', async () => {
    const ctx = aCtx(makeProject({ 'android/app/build.gradle': GROOVY_GRADLE }), { androidFlavor: 'dev' })
    expect(await flavorExists.run(ctx)).toEqual([])
  })
  it('passes the SECOND declared flavor', async () => {
    const ctx = aCtx(makeProject({ 'android/app/build.gradle': GROOVY_GRADLE }), { androidFlavor: 'prod' })
    expect(await flavorExists.run(ctx)).toEqual([])
  })
  it('errors when a buildType name is passed as a flavor (the classic user mistake)', async () => {
    const ctx = aCtx(makeProject({ 'android/app/build.gradle': GROOVY_GRADLE }), { androidFlavor: 'release' })
    const f = await flavorExists.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail).not.toContain('release')
    expect(f[0]?.detail).not.toContain('buildTypes')
  })
  it('parses Kotlin DSL create()/register() flavor declarations', async () => {
    const dir = makeProject({ 'android/app/build.gradle.kts': KTS_GRADLE })
    expect(await flavorExists.run(aCtx(dir, { androidFlavor: 'demo' }))).toEqual([])
    expect(await flavorExists.run(aCtx(dir, { androidFlavor: 'prod' }))).toEqual([])
    const f = await flavorExists.run(aCtx(dir, { androidFlavor: 'release' }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail).toBe('declared flavors: demo, prod')
  })
  it('errors when no productFlavors block is declared at all', async () => {
    const ctx = aCtx(makeProject({ 'android/app/build.gradle': `android { buildTypes { release {} } }` }), { androidFlavor: 'dev' })
    const f = await flavorExists.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('declares no productFlavors')
  })
  it('also handles the single-line gradle fixture', async () => {
    const gradle = `android { productFlavors { dev { dimension "env" } prod { dimension "env" } } }`
    const dir = makeProject({ 'android/app/build.gradle': gradle })
    expect(await flavorExists.run(aCtx(dir, { androidFlavor: 'prod' }))).toEqual([])
    const f = await flavorExists.run(aCtx(dir, { androidFlavor: 'staging' }))
    expect(f[0]?.detail).toBe('declared flavors: dev, prod')
  })
})

describe('android/agp8-package-attr', () => {
  it('errors when manifest has package= and gradle has namespace', async () => {
    const dir = makeProject({
      'android/app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.demo.app"><application/></manifest>`,
      'android/app/build.gradle': `android { namespace "com.demo.app" }`,
    })
    expect((await agp8PackageAttr.run(aCtx(dir)))[0]?.severity).toBe('error')
  })
  it('passes a namespace-only project', async () => {
    const dir = makeProject({
      'android/app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application/></manifest>`,
      'android/app/build.gradle': `android { namespace "com.demo.app" }`,
    })
    expect(await agp8PackageAttr.run(aCtx(dir))).toEqual([])
  })
})
