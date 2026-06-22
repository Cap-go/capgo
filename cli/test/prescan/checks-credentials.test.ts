// test/prescan/checks-credentials.test.ts
import { describe, expect, it } from 'bun:test'
import { credentialsSaved } from '../../src/build/prescan/checks/credentials'
import { apikeyPermission, appExists } from '../../src/build/prescan/checks/shared-remote'
import { makeCtx, makeProject } from './helpers'

function fakeSupabase(opts: { permission?: boolean, appRow?: object | null, error?: { message: string } }) {
  return {
    rpc: async (_fn: string, _args: object) => ({ data: opts.error ? null : (opts.permission ?? false), error: opts.error ?? null }),
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_k: string, _v: string) => ({
          maybeSingle: async () => ({ data: opts.error ? null : (opts.appRow ?? null), error: opts.error ?? null }),
        }),
      }),
    }),
  } as any
}

describe('shared/apikey-permission', () => {
  it('errors when permission rpc returns false', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', apikey: 'k', supabase: fakeSupabase({ permission: false }) })
    const findings = await apikeyPermission.run(ctx)
    expect(findings[0]?.severity).toBe('error')
    expect(findings[0]?.title).toContain('app.build_native')
  })
  it('passes when permission granted', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', apikey: 'k', supabase: fakeSupabase({ permission: true }) })
    expect(await apikeyPermission.run(ctx)).toEqual([])
  })
  it('downgrades a network/API failure to info — never blocks offline users (spec)', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', apikey: 'k', supabase: fakeSupabase({ error: { message: 'fetch failed' } }) })
    const findings = await apikeyPermission.run(ctx)
    expect(findings[0]?.severity).toBe('info')
    expect(findings[0]?.title).toContain('Could not verify')
  })
})

describe('shared/app-exists', () => {
  it('errors when app row is absent', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', supabase: fakeSupabase({ appRow: null }) })
    expect((await appExists.run(ctx))[0]?.severity).toBe('error')
  })
  it('passes when app found', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', supabase: fakeSupabase({ appRow: { app_id: 'com.demo.app' } }) })
    expect(await appExists.run(ctx)).toEqual([])
  })
  it('downgrades a network/API failure to info — never blocks offline users (spec)', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', supabase: fakeSupabase({ error: { message: 'fetch failed' } }) })
    const findings = await appExists.run(ctx)
    expect(findings[0]?.severity).toBe('info')
    expect(findings[0]?.title).toContain('Could not verify')
  })
})

describe('shared/credentials-saved', () => {
  it('errors when no credentials at all', async () => {
    const ctx = makeCtx({ projectDir: makeProject({}), platform: 'ios', credentials: undefined })
    expect((await credentialsSaved.run(ctx))[0]?.severity).toBe('error')
  })
  it('errors listing missing required ios keys', async () => {
    const ctx = makeCtx({ projectDir: makeProject({}), platform: 'ios', credentials: { BUILD_CERTIFICATE_BASE64: 'x' } })
    const f = (await credentialsSaved.run(ctx))[0]
    expect(f?.severity).toBe('error')
    expect(f?.detail).toContain('CAPGO_IOS_PROVISIONING_MAP')
  })
  it('errors listing missing required android keys', async () => {
    const ctx = makeCtx({ projectDir: makeProject({}), platform: 'android', credentials: { ANDROID_KEYSTORE_FILE: 'x' } })
    const f = (await credentialsSaved.run(ctx))[0]
    expect(f?.detail).toContain('KEYSTORE_KEY_ALIAS')
  })
  it('passes with complete android credentials', async () => {
    const ctx = makeCtx({ projectDir: makeProject({}), platform: 'android', credentials: {
      ANDROID_KEYSTORE_FILE: 'x', KEYSTORE_KEY_ALIAS: 'a', KEYSTORE_STORE_PASSWORD: 'p',
    } })
    expect(await credentialsSaved.run(ctx)).toEqual([])
  })
})
