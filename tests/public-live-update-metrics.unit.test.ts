import type { Context } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPublicLiveUpdateMetricsCF } from '../supabase/functions/_backend/utils/cloudflare.ts'

interface AnalyticsColumn { name: string, type: string }

function analyticsResponse(meta: AnalyticsColumn[], data: Array<Record<string, string>>) {
  return new Response(JSON.stringify({
    meta,
    data,
    rows: data.length,
    rows_before_limit_at_least: data.length,
  }), { headers: { 'content-type': 'application/json' } })
}

function createContext() {
  return {
    env: {
      APP_LOG: {},
      DEVICE_USAGE: {},
      DEVICE_INFO: {},
      CF_ANALYTICS_TOKEN: 'analytics-token',
      CF_ACCOUNT_ANALYTICS_ID: 'analytics-account',
    },
    req: {
      url: 'http://localhost/private/website_stats/live_updates',
      raw: { headers: new Headers() },
    },
    get: () => 'public-live-update-metrics-test',
  } as unknown as Context
}

describe('public live update metrics', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses Analytics Engine-supported queries and preserves Float64 platform values', async () => {
    const queries: string[] = []
    vi.stubEnv('CF_ANALYTICS_TOKEN', 'analytics-token')
    vi.stubEnv('CF_ACCOUNT_ANALYTICS_ID', 'analytics-account')
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const query = String(init?.body ?? '')
      queries.push(query)

      if (query.includes('SELECT action, count() AS devices')) {
        return analyticsResponse(
          [
            { name: 'action', type: 'String' },
            { name: 'devices', type: 'UInt64' },
          ],
          [{ action: 'download_fail', devices: '3' }],
        )
      }

      if (query.includes('FROM device_usage')) {
        return analyticsResponse(
          [
            { name: 'platform', type: 'Float64' },
            { name: 'devices', type: 'UInt64' },
          ],
          [
            { platform: '0', devices: '80' },
            { platform: '1', devices: '30' },
            { platform: '2', devices: '10' },
          ],
        )
      }

      return analyticsResponse(
        [
          { name: 'date', type: 'String' },
          { name: 'version', type: 'String' },
          { name: 'devices', type: 'UInt64' },
        ],
        [{ date: '2026-06-30', version: '8.1.0', devices: '120' }],
      )
    }))

    const metrics = await getPublicLiveUpdateMetricsCF(
      createContext(),
      new Date('2026-07-01T00:00:00.000Z'),
    )

    expect(metrics).toEqual({
      failures: [{ reason: 'download_fail', share: 100 }],
      platforms: { ios: 25, android: 66.66666666666666, electron: 8.333333333333332 },
      updater_versions: [{ date: '2026-06-30', version: '8.1.0', share: 100 }],
    })
    expect(queries).toHaveLength(3)
    expect(queries.join('\n')).not.toContain('toString')
    expect(queries.join('\n')).not.toContain('concat')
    expect(queries.join('\n')).not.toContain('sum(succeeded)')
    expect(queries.find(query => query.includes('FROM device_usage'))).toContain('double1 IN (0.0, 1.0, 2.0)')
    expect(queries.find(query => query.includes('SELECT action, count() AS devices'))).toContain('GROUP BY date, action, app_id, device_id')
  })
})
