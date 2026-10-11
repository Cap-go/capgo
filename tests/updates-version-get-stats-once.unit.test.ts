import { describe, expect, it, vi } from 'vitest'

const createStatsVersionMock = vi.fn(() => Promise.resolve())
const sendStatsAndDeviceMock = vi.fn(() => Promise.resolve())

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/plugin_stats.ts', () => ({
  createStatsVersion: createStatsVersionMock,
  sendStatsAndDevice: sendStatsAndDeviceMock,
}))

function createContext() {
  const raw = { id: 'raw-req-version-get' }
  return {
    req: { raw },
  } as any
}

describe('recordUpdatesVersionGetStatsOnce', () => {
  it('retries only createStatsVersion when sendStatsAndDevice failed first', async () => {
    const { recordUpdatesVersionGetStatsOnce } = await import('../supabase/functions/_backend/plugin_runtime/utils/update.ts')
    createStatsVersionMock.mockClear()
    sendStatsAndDeviceMock.mockClear()
    createStatsVersionMock.mockResolvedValueOnce(undefined)
    sendStatsAndDeviceMock
      .mockRejectedValueOnce(new Error('device stats failed'))
      .mockResolvedValueOnce(undefined)
    const c = createContext()
    const device = { device_id: 'device-1' } as any
    const channel = { id: 42, name: 'production' }

    await expect(recordUpdatesVersionGetStatsOnce(c, device, '1.2.3', 'com.test.app', channel))
      .rejects.toThrow('device stats failed')
    await recordUpdatesVersionGetStatsOnce(c, device, '1.2.3', 'com.test.app', channel)

    expect(createStatsVersionMock).toHaveBeenCalledTimes(1)
    expect(sendStatsAndDeviceMock).toHaveBeenCalledTimes(2)
  })

  it('retries only sendStatsAndDevice when createStatsVersion failed first', async () => {
    const { recordUpdatesVersionGetStatsOnce } = await import('../supabase/functions/_backend/plugin_runtime/utils/update.ts')
    createStatsVersionMock.mockClear()
    sendStatsAndDeviceMock.mockClear()
    createStatsVersionMock
      .mockRejectedValueOnce(new Error('version stats failed'))
      .mockResolvedValueOnce(undefined)
    sendStatsAndDeviceMock.mockResolvedValueOnce(undefined)
    const c = createContext()
    const device = { device_id: 'device-1' } as any
    const channel = { id: 42, name: 'production' }

    await expect(recordUpdatesVersionGetStatsOnce(c, device, '1.2.3', 'com.test.app', channel))
      .rejects.toThrow('version stats failed')
    await recordUpdatesVersionGetStatsOnce(c, device, '1.2.3', 'com.test.app', channel)

    expect(createStatsVersionMock).toHaveBeenCalledTimes(2)
    expect(sendStatsAndDeviceMock).toHaveBeenCalledTimes(1)
  })

  it('records version get stats at most once per raw request', async () => {
    const { recordUpdatesVersionGetStatsOnce } = await import('../supabase/functions/_backend/plugin_runtime/utils/update.ts')
    createStatsVersionMock.mockClear()
    sendStatsAndDeviceMock.mockClear()
    const c = createContext()
    const device = { device_id: 'device-1' } as any
    const channel = { id: 42, name: 'production' }

    await recordUpdatesVersionGetStatsOnce(c, device, '1.2.3', 'com.test.app', channel)
    await recordUpdatesVersionGetStatsOnce(c, device, '1.2.3', 'com.test.app', channel)

    expect(createStatsVersionMock).toHaveBeenCalledTimes(1)
    expect(sendStatsAndDeviceMock).toHaveBeenCalledTimes(1)
  })
})
