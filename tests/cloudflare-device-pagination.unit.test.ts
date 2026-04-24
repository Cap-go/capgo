import { describe, expect, it } from 'vitest'
import { buildReadDevicesCFQuery } from '../supabase/functions/_backend/utils/cloudflare.ts'

describe('buildReadDevicesCFQuery', () => {
  it('applies descending cursor pagination after device grouping', () => {
    const query = buildReadDevicesCFQuery({
      app_id: 'com.example.app',
      cursor: '2026-04-04 03:05:59|11111111-1111-4111-8111-111111111111',
      limit: 1,
      order: [{ key: 'updated_at', sortable: 'desc' }],
    }, false)

    const groupByIndex = query.indexOf('GROUP BY blob1')
    const cursorIndex = query.indexOf(`WHERE (updated_at < toDateTime('2026-04-04 03:05:59')`)

    expect(groupByIndex).toBeGreaterThan(-1)
    expect(cursorIndex).toBeGreaterThan(groupByIndex)
    expect(query).not.toContain(`AND (timestamp < toDateTime('2026-04-04 03:05:59')`)
    expect(query).toContain(`ORDER BY updated_at DESC, device_id ASC`)
  })

  it('applies ascending cursor pagination after device grouping', () => {
    const query = buildReadDevicesCFQuery({
      app_id: 'com.example.app',
      cursor: '2026-04-04 03:05:59|11111111-1111-4111-8111-111111111111',
      limit: 1,
      order: [{ key: 'updated_at', sortable: 'asc' }],
    }, false)

    expect(query).toContain(`WHERE (updated_at > toDateTime('2026-04-04 03:05:59')`)
    expect(query).toContain(`ORDER BY updated_at ASC, device_id ASC`)
  })
})
