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
