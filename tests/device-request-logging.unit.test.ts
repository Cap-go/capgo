import { describe, expect, it, vi } from 'vitest'

const { cloudlogMock } = vi.hoisted(() => ({
  cloudlogMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
}))

describe('device request logging', () => {
  it('logs request metadata without retaining body values', async () => {
    const { logDeviceRequestContext } = await import('../supabase/functions/_backend/public/device/logging.ts')
    const context = { get: vi.fn().mockReturnValue('req-device-log') }
    const body = {
      app_id: 'com.private.app',
      device_id: 'device-secret-123',
      channel: 'beta-private',
    }

    logDeviceRequestContext(context as any, 'set', body, {
      id: 'apikey-id',
      user_id: 'user-id',
      mode: 'all',
      key: 'capg-secret',
    } as any)

    expect(cloudlogMock).toHaveBeenNthCalledWith(1, {
      requestId: 'req-device-log',
      message: 'device set request',
      hasAppId: true,
      hasDeviceId: true,
      hasChannel: true,
      fieldCount: 3,
    })
    expect(cloudlogMock.mock.calls[0][0]).not.toHaveProperty('body')
    expect(JSON.stringify(cloudlogMock.mock.calls)).not.toContain('com.private.app')
    expect(JSON.stringify(cloudlogMock.mock.calls)).not.toContain('device-secret-123')
    expect(JSON.stringify(cloudlogMock.mock.calls)).not.toContain('beta-private')
    expect(JSON.stringify(cloudlogMock.mock.calls)).not.toContain('capg-secret')
  })
})
