import { describe, expect, it } from 'vitest'
import { createSchema, makeIssue } from '../supabase/functions/_backend/utils/ark_validation.ts'
import { getPluginBodyMetadata, getPluginParseFailureMetadata, parsePluginBody } from '../supabase/functions/_backend/utils/plugin_parser.ts'

function createContext(method = 'POST') {
  return {
    req: {
      method,
    },
  } as any
}

function getThrownCause(action: () => unknown) {
  try {
    action()
  }
  catch (error) {
    return (error as Error & { cause?: any }).cause
  }
  throw new Error('Expected action to throw')
}

describe('plugin parser redaction', () => {
  it('summarizes request bodies without exposing plugin identifiers', () => {
    const metadata = getPluginBodyMetadata({
      app_id: 'com.secret.app',
      custom_id: 'custom-secret',
      device_id: 'device-secret',
      key_id: 'key-secret',
      version_build: '1.2.3',
      unexpected_secret: 'raw-value',
    })

    expect(metadata).toEqual({
      fieldCount: 6,
      hasBody: true,
      presentFields: ['app_id', 'custom_id', 'device_id', 'key_id', 'version_build'],
      unknownFieldCount: 1,
    })
    expect(JSON.stringify(metadata)).not.toContain('com.secret.app')
    expect(JSON.stringify(metadata)).not.toContain('device-secret')
    expect(JSON.stringify(metadata)).not.toContain('key-secret')
    expect(JSON.stringify(metadata)).not.toContain('raw-value')
  })

  it('uses body metadata for missing device errors', () => {
    const cause = getThrownCause(() => parsePluginBody(
      createContext(),
      {
        app_id: 'com.secret.app',
        custom_id: 'custom-secret',
        version_build: '1.2.3',
      } as any,
      createSchema(value => ({ value: value as any })),
    ))

    expect(cause.error).toBe('missing_device_id')
    expect(cause.moreInfo).toEqual({
      body: {
        fieldCount: 3,
        hasBody: true,
        presentFields: ['app_id', 'custom_id', 'version_build'],
        unknownFieldCount: 0,
      },
    })
    expect(JSON.stringify(cause.moreInfo)).not.toContain('com.secret.app')
    expect(JSON.stringify(cause.moreInfo)).not.toContain('custom-secret')
  })

  it('redacts invalid semver values from error details', () => {
    const cause = getThrownCause(() => parsePluginBody(
      createContext(),
      {
        app_id: 'com.secret.app',
        device_id: 'device-secret',
        version_build: 'secret-build',
      } as any,
      createSchema(value => ({ value: value as any })),
    ))

    expect(cause.error).toBe('semver_error')
    expect(cause.message).not.toContain('secret-build')
    expect(JSON.stringify(cause.moreInfo)).not.toContain('secret-build')
  })

  it('summarizes schema parse failures without raw issue messages or body values', () => {
    const schema = createSchema(() => ({
      issues: [
        makeIssue('Secret value device-secret is invalid', ['device_id'], 'invalid'),
        makeIssue('App com.secret.app is invalid', ['app_id'], 'invalid'),
      ],
    }))
    const parseResult = schema['~standard'].validate({}) as any
    const metadata = getPluginParseFailureMetadata({
      success: false,
      error: {
        issues: parseResult.issues,
      },
    } as any)

    expect(metadata).toEqual({
      success: false,
      issueCount: 2,
      issues: [
        { code: 'invalid' },
        { code: 'invalid' },
      ],
    })
    expect(JSON.stringify(metadata)).not.toContain('device-secret')
    expect(JSON.stringify(metadata)).not.toContain('com.secret.app')
  })

  it('does not expose user-controlled issue path segments', () => {
    const metadata = getPluginParseFailureMetadata({
      success: false,
      error: {
        issues: [
          makeIssue('Invalid metadata key', ['metadata', 'secret-metadata-key'], 'invalid'),
        ],
      },
    } as any)

    expect(metadata).toEqual({
      success: false,
      issueCount: 1,
      issues: [
        { code: 'invalid' },
      ],
    })
    expect(JSON.stringify(metadata)).not.toContain('secret-metadata-key')
  })

  it('uses parse failure metadata in thrown validation errors', () => {
    const schema = createSchema(() => ({
      issues: [
        makeIssue('Secret value device-secret is invalid', ['device_id'], 'invalid'),
      ],
    }))

    const cause = getThrownCause(() => parsePluginBody(
      createContext(),
      {
        app_id: 'com.secret.app',
        device_id: 'device-secret',
        version_build: '1.2.3',
      } as any,
      schema as any,
    ))

    expect(cause.error).toBe('invalid_json_body')
    expect(cause.moreInfo).toEqual({
      parseResult: {
        success: false,
        issueCount: 1,
        issues: [
          { code: 'invalid' },
        ],
      },
    })
    expect(JSON.stringify(cause.moreInfo)).not.toContain('device-secret')
    expect(JSON.stringify(cause.moreInfo)).not.toContain('com.secret.app')
  })
})
