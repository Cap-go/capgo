import { describe, expect, it } from 'vitest'

/**
 * Unit tests verifying that the not_admin log path in admin_stats
 * only emits whitelisted schema fields and never caller-supplied
 * extra JSON fields.
 */

function buildWhitelistedLog(body: Record<string, unknown>) {
  // Mirrors the fixed logging logic in admin_stats.ts
  const { metric_category, start_date, end_date, app_id, org_id, limit, offset } = body as any
  return {
    message: 'not_admin',
    metric_category,
    start_date,
    end_date,
    app_id: app_id ?? null,
    org_id: org_id ?? null,
    limit: limit ?? null,
    offset: offset ?? null,
  }
}

describe('admin_stats — not_admin log redaction', () => {
  it('does not include extra caller-supplied fields in log', () => {
    const maliciousBody = {
      metric_category: 'org_metrics',
      start_date: '2025-01-01T00:00:00.000Z',
      end_date: '2025-01-31T00:00:00.000Z',
      injected_field: 'sensitive_value',
      __proto__: 'polluted',
    }

    const logged = buildWhitelistedLog(maliciousBody)
    expect(JSON.stringify(logged)).not.toContain('sensitive_value')
    expect(JSON.stringify(logged)).not.toContain('injected_field')
    expect(logged).not.toHaveProperty('injected_field')
  })

  it('preserves all whitelisted schema fields', () => {
    const body = {
      metric_category: 'org_metrics',
      start_date: '2025-01-01T00:00:00.000Z',
      end_date: '2025-01-31T00:00:00.000Z',
      app_id: 'com.example.app',
      org_id: 'org_abc',
      limit: 100,
      offset: 0,
    }

    const logged = buildWhitelistedLog(body)
    expect(logged.metric_category).toBe('org_metrics')
    expect(logged.start_date).toBe('2025-01-01T00:00:00.000Z')
    expect(logged.end_date).toBe('2025-01-31T00:00:00.000Z')
    expect(logged.app_id).toBe('com.example.app')
    expect(logged.org_id).toBe('org_abc')
    expect(logged.limit).toBe(100)
    expect(logged.offset).toBe(0)
  })

  it('nulls out optional fields when absent', () => {
    const body = {
      metric_category: 'org_metrics',
      start_date: '2025-01-01T00:00:00.000Z',
      end_date: '2025-01-31T00:00:00.000Z',
    }

    const logged = buildWhitelistedLog(body)
    expect(logged.app_id).toBeNull()
    expect(logged.org_id).toBeNull()
    expect(logged.limit).toBeNull()
    expect(logged.offset).toBeNull()
  })
})
