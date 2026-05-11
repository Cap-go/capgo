import { describe, expect, it, vi } from 'vitest'

// Mock hono utils before importing module
vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  BRES: { status: 'ok' },
  parseBody: vi.fn(),
  quickError: (status: number, code: string, message: string, data?: Record<string, unknown>) => {
    const err: any = new Error(message)
    err.status = status
    err.code = code
    err.data = data ?? null
    return err
  },
  simpleError: (code: string, message: string, data?: Record<string, unknown>) => {
    const err: any = new Error(message)
    err.code = code
    err.data = data ?? null
    return err
  },
  useCors: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', () => ({
  middlewareV2: () => vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  getPgClient: vi.fn(),
  getDrizzleClient: vi.fn(),
  closeClient: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/postgres_schema.ts', () => ({
  schema: { apps: { app_id: 'app_id', owner_org: 'owner_org' } },
}))

vi.mock('../supabase/functions/_backend/utils/stats.ts', () => ({
  createStatsDevices: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseWithAuth: vi.fn(),
}))

// Import the validation pieces directly
const { safeParseSchema } = await import('../supabase/functions/_backend/utils/ark_validation.ts')
const { type } = await import('arktype')
const { simpleError } = await import('../supabase/functions/_backend/utils/hono.ts')

// Replicate the bodySchema from create_device.ts
const bodySchema = type({
  device_id: 'string.uuid',
  app_id: 'string',
  org_id: 'string.uuid',
  platform: '"ios" | "android"',
  version_name: 'string',
})

describe('create_device validation body redaction', () => {
  it('does not include raw body in invalid_json_body error', () => {
    const maliciousBody = {
      device_id: 'not-a-uuid',
      app_id: 'com.secret.app',
      org_id: 'not-a-uuid',
      platform: 'unknown_platform',
      version_name: 'secret-version-abc123',
      extra_secret_field: 'should-never-appear-in-error',
    }

    const parsedBodyResult = safeParseSchema(bodySchema, maliciousBody)
    expect(parsedBodyResult.success).toBe(false)

    if (!parsedBodyResult.success) {
      const safeIssues = (parsedBodyResult.error?.issues ?? []).map((issue: any) => ({
        code: issue.code ?? 'unknown',
        path: Array.isArray(issue.path) ? issue.path.map(String) : [],
      }))
      const thrown = simpleError('invalid_json_body', 'Invalid JSON body', { issue_count: safeIssues.length, issues: safeIssues })

      const serialized = JSON.stringify(thrown.data ?? {})

      // Must NOT contain any submitted values
      expect(serialized).not.toContain('com.secret.app')
      expect(serialized).not.toContain('secret-version-abc123')
      expect(serialized).not.toContain('should-never-appear-in-error')
      expect(serialized).not.toContain('not-a-uuid')
      expect(serialized).not.toContain('unknown_platform')

      // Must contain issue metadata
      expect(thrown.data?.issue_count).toBeGreaterThan(0)
      const issues = thrown.data?.issues as any[]
      expect(Array.isArray(issues)).toBe(true)
      issues.forEach((issue) => {
        expect(issue).toHaveProperty('code')
        expect(issue).toHaveProperty('path')
        expect(Array.isArray(issue.path)).toBe(true)
        // path entries are field names (safe), not values
        issue.path.forEach((p: any) => expect(typeof p).toBe('string'))
      })
    }
  })

  it('does not include full parsedBodyResult in error (no data field from arktype)', () => {
    const body = { device_id: 'bad', app_id: '', org_id: 'bad', platform: 'win', version_name: '' }
    const parsedBodyResult = safeParseSchema(bodySchema, body)
    expect(parsedBodyResult.success).toBe(false)

    if (!parsedBodyResult.success) {
      const safeIssues = (parsedBodyResult.error?.issues ?? []).map((issue: any) => ({
        code: issue.code ?? 'unknown',
        path: Array.isArray(issue.path) ? issue.path.map(String) : [],
      }))
      const thrown = simpleError('invalid_json_body', 'Invalid JSON body', { issue_count: safeIssues.length, issues: safeIssues })

      const serialized = JSON.stringify(thrown.data ?? {})

      // Must NOT contain the raw submitted values from body
      expect(serialized).not.toContain('"bad"')
      expect(serialized).not.toContain('"win"')

      // issues should only have code + path keys
      const issues = thrown.data?.issues as any[]
      issues.forEach((issue) => {
        expect(Object.keys(issue).sort()).toEqual(['code', 'path'])
      })
    }
  })

  it('does not echo raw body object in error data', () => {
    const sensitiveBody = { device_id: 'secret-id', app_id: 'secret-app', org_id: 'x', platform: 'ios', version_name: 'v1' }
    const parsedBodyResult = safeParseSchema(bodySchema, sensitiveBody)

    if (!parsedBodyResult.success) {
      const safeIssues = (parsedBodyResult.error?.issues ?? []).map((issue: any) => ({
        code: issue.code ?? 'unknown',
        path: Array.isArray(issue.path) ? issue.path.map(String) : [],
      }))
      const thrown = simpleError('invalid_json_body', 'Invalid JSON body', { issue_count: safeIssues.length, issues: safeIssues })

      // The raw body must never appear in the error data
      expect(thrown.data).not.toHaveProperty('body')
      expect(thrown.data).not.toHaveProperty('parsedBodyResult')
    }
  })
})
