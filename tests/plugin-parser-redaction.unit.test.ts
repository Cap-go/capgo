import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  simpleError: (code: string, message: string, data?: Record<string, unknown>) => {
    const err: any = new Error(message)
    err.code = code
    err.data = data ?? null
    return err
  },
}))

vi.mock('../supabase/functions/_backend/utils/ark_validation.ts', async () => {
  const actual = await import('../supabase/functions/_backend/utils/ark_validation.ts')
  return actual
})

const { parsePluginBody } = await import('../supabase/functions/_backend/utils/plugin_parser.ts')
const { type } = await import('arktype')

const testSchema = type({
  device_id: 'string',
  app_id: 'string',
  plugin_version: 'string',
  version_build: 'string',
  platform: 'string',
})

function makeCtx(method = 'POST') {
  return { req: { method } } as any
}

describe('parsePluginBody redaction', () => {
  it('empty body error does not echo raw body', () => {
    let thrown: any
    try {
      parsePluginBody(makeCtx(), {} as any, testSchema)
    }
    catch (e) { thrown = e }

    expect(thrown).toBeDefined()
    expect(thrown.data).not.toHaveProperty('body')
    expect(thrown.data?.has_fields).toBe(false)
  })

  it('missing_device_id error does not echo raw body', () => {
    let thrown: any
    try {
      parsePluginBody(makeCtx(), { app_id: 'com.secret.app', version_build: '1.0.0', plugin_version: '5.0.0', platform: 'ios' } as any, testSchema)
    }
    catch (e) { thrown = e }

    expect(thrown?.code).toBe('missing_device_id')
    expect(JSON.stringify(thrown?.data ?? {})).not.toContain('com.secret.app')
    expect(thrown?.data?.has_device_id).toBe(false)
    expect(thrown?.data?.has_app_id).toBe(true)
  })

  it('missing_app_id error does not echo raw body', () => {
    let thrown: any
    try {
      parsePluginBody(makeCtx(), { device_id: 'secret-device-id', version_build: '1.0.0', plugin_version: '5.0.0', platform: 'ios' } as any, testSchema)
    }
    catch (e) { thrown = e }

    expect(thrown?.code).toBe('missing_app_id')
    expect(JSON.stringify(thrown?.data ?? {})).not.toContain('secret-device-id')
    expect(thrown?.data?.has_app_id).toBe(false)
    expect(thrown?.data?.has_device_id).toBe(true)
  })

  it('semver_error does not embed raw version_build in message or data', () => {
    let thrown: any
    try {
      parsePluginBody(makeCtx(), {
        device_id: 'dev-123',
        app_id: 'com.example',
        version_build: 'not-semver-secret-value-abc123',
        plugin_version: '5.0.0',
        platform: 'ios',
      } as any, testSchema)
    }
    catch (e) { thrown = e }

    expect(thrown?.code).toBe('semver_error')
    expect(thrown?.message).not.toContain('not-semver-secret-value-abc123')
    expect(JSON.stringify(thrown?.data ?? {})).not.toContain('not-semver-secret-value-abc123')
    expect(typeof thrown?.data?.version_build_length).toBe('number')
    expect(thrown?.data?.version_build_length).toBe('not-semver-secret-value-abc123'.length)
  })

  it('schema parse failure does not include raw parseResult with embedded values', () => {
    let thrown: any
    try {
      parsePluginBody(makeCtx(), {
        device_id: 12345 as any, // wrong type, should be string
        app_id: 'com.example',
        version_build: '1.0.0',
        plugin_version: '5.0.0',
        platform: 'ios',
      } as any, testSchema, false)
    }
    catch (e) { thrown = e }

    if (thrown) {
      expect(thrown?.data).not.toHaveProperty('parseResult')
      expect(thrown?.data).not.toHaveProperty('body')
      if (thrown?.data?.issues) {
        thrown.data.issues.forEach((issue: any) => {
          expect(Object.keys(issue).sort()).toEqual(['code', 'path'])
          expect((issue as any).data).toBeUndefined()
        })
      }
    }
  })
})
