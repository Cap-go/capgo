// test/prescan/checks-shared.test.ts
import { describe, expect, it } from 'bun:test'
import { bundleIdConsistency, capSyncStale, nodeLinkerLayout } from '../../src/build/prescan/checks/shared'
import { makeCtx, makeProject } from './helpers'

const PKG = JSON.stringify({ dependencies: { '@capacitor/core': '7.0.0', '@capacitor/camera': '7.0.0', '@capacitor/android': '7.0.0' } })

describe('shared/cap-sync-stale', () => {
  it('errors when webDir is missing', async () => {
    const dir = makeProject({ 'package.json': PKG })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    const findings = await capSyncStale.run(ctx)
    expect(findings.some(f => f.id === 'shared/cap-sync-stale' && f.severity === 'error' && f.title.includes('webDir'))).toBe(true)
  })

  it('errors when an installed capacitor plugin is missing from capacitor.settings.gradle', async () => {
    const dir = makeProject({
      'package.json': PKG,
      'dist/index.html': '<html></html>',
      'android/capacitor.settings.gradle': `include ':capacitor-android'\n// no camera here`,
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    const findings = await capSyncStale.run(ctx)
    expect(findings.some(f => f.severity === 'error' && (f.detail ?? '').includes('@capacitor/camera'))).toBe(true)
  })

  it('passes on a synced android project', async () => {
    const dir = makeProject({
      'package.json': PKG,
      'dist/index.html': '<html></html>',
      'android/capacitor.settings.gradle': `include ':capacitor-android'\ninclude ':capacitor-camera'\nproject(':capacitor-camera').projectDir = new File('../node_modules/@capacitor/camera/android')`,
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    expect(await capSyncStale.run(ctx)).toEqual([])
  })
})

describe('shared/node-linker-layout', () => {
  it('errors when node_modules/.bun exists', async () => {
    const dir = makeProject({ 'node_modules/.bun/placeholder': '', 'package.json': PKG })
    const findings = await nodeLinkerLayout.run(makeCtx({ projectDir: dir }))
    expect(findings[0]?.severity).toBe('error')
    expect(findings[0]?.fix).toContain('--linker=hoisted')
  })

  it('warns when node_modules/.pnpm exists', async () => {
    const dir = makeProject({ 'node_modules/.pnpm/placeholder': '', 'package.json': PKG })
    expect((await nodeLinkerLayout.run(makeCtx({ projectDir: dir })))[0]?.severity).toBe('warning')
  })

  it('passes with hoisted layout', async () => {
    const dir = makeProject({ 'node_modules/@capacitor/core/package.json': '{}', 'package.json': PKG })
    expect(await nodeLinkerLayout.run(makeCtx({ projectDir: dir }))).toEqual([])
  })
})

describe('shared/bundle-id-consistency', () => {
  it('warns when gradle applicationId differs from capacitor appId', async () => {
    const dir = makeProject({
      'android/app/build.gradle': `android { defaultConfig { applicationId "com.other.app" } }`,
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    const findings = await bundleIdConsistency.run(ctx)
    expect(findings[0]?.severity).toBe('warning')
    expect(findings[0]?.detail).toContain('com.other.app')
  })

  it('passes when they match', async () => {
    const dir = makeProject({
      'android/app/build.gradle': `android { defaultConfig { applicationId "com.demo.app" } }`,
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    expect(await bundleIdConsistency.run(ctx)).toEqual([])
  })
})
