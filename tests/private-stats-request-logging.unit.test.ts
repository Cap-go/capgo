import { describe, expect, it } from 'vitest'
import { summarizePrivateStatsRequestForLog } from '../supabase/functions/_backend/utils/private_stats_request_log.ts'

describe('private stats request logging', () => {
  it.concurrent('keeps analytics request logs metadata-only', () => {
    const summary = summarizePrivateStatsRequestForLog({
      appId: 'com.example.app',
      devicesId: ['device-secret-123', 'device-secret-456'],
      search: 'customer@example.com',
      order: [
        { key: 'device_id', sortable: 'asc' },
      ],
      rangeStart: '2026-01-01T00:00:00.000Z',
      rangeEnd: '2026-01-02T00:00:00.000Z',
      limit: 500,
      actions: ['app_moved_to_foreground'],
      format: 'csv',
      filename: 'customer@example.com.csv',
    })

    expect(summary).toEqual({
      app_id: 'com.example.app',
      range_start: '2026-01-01T00:00:00.000Z',
      range_end: '2026-01-02T00:00:00.000Z',
      limit: 500,
      format: 'csv',
      device_filter_count: 2,
      order_count: 1,
      action_count: 1,
      has_search: true,
      has_filename: true,
    })

    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('device-secret-123')
    expect(serialized).not.toContain('device-secret-456')
    expect(serialized).not.toContain('customer@example.com')
    expect(serialized).not.toContain('app_moved_to_foreground')
  })

  it.concurrent('handles empty private stats requests without throwing', () => {
    expect(summarizePrivateStatsRequestForLog(undefined)).toMatchObject({
      device_filter_count: 0,
      order_count: 0,
      action_count: 0,
      has_search: false,
      has_filename: false,
    })
  })
})
