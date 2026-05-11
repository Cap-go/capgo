import { describe, expect, it } from 'vitest'
import { getPrivateDevicesRequestLogMetadata } from '../supabase/functions/_backend/private/devices.ts'

describe('private devices request log metadata', () => {
  it.concurrent('summarizes device filters without retaining request values', () => {
    const metadata = getPrivateDevicesRequestLogMetadata({
      appId: 'com.example.secret',
      count: true,
      versionName: '1.2.3-sensitive-build',
      devicesId: ['device-secret-1', 'device-secret-2'],
      search: 'private-user-search',
      customIdMode: true,
      order: [{ key: 'device_id', sortable: 'asc' }],
      cursor: 'cursor-secret',
      limit: 50,
    })

    expect(metadata).toEqual({
      hasAppId: true,
      count: true,
      hasVersionName: true,
      deviceIdsCount: 2,
      hasSearch: true,
      customIdMode: true,
      orderCount: 1,
      hasCursor: true,
      limit: 50,
    })
    expect(JSON.stringify(metadata)).not.toContain('com.example.secret')
    expect(JSON.stringify(metadata)).not.toContain('1.2.3-sensitive-build')
    expect(JSON.stringify(metadata)).not.toContain('device-secret-1')
    expect(JSON.stringify(metadata)).not.toContain('private-user-search')
    expect(JSON.stringify(metadata)).not.toContain('cursor-secret')
  })

  it.concurrent('handles empty optional filters', () => {
    expect(getPrivateDevicesRequestLogMetadata({ appId: 'com.example.app' })).toEqual({
      hasAppId: true,
      count: false,
      hasVersionName: false,
      deviceIdsCount: 0,
      hasSearch: false,
      customIdMode: false,
      orderCount: 0,
      hasCursor: false,
      limit: undefined,
    })
  })
})
