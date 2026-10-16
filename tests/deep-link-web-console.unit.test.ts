import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
  },
}))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: async () => {} })),
    getLaunchUrl: vi.fn(async () => ({
      url: 'https://console.capgo.app/scan?preview=capgo%3A%2F%2Fpreview%2Fbundle%3FappId%3Dcom.example.app%26versionId%3D1&nativeConfirmedPreview=1',
    })),
  },
}))
vi.mock('@capgo/capacitor-install-referrer', () => ({ InstallReferrer: { getReferrerDetails: vi.fn() } }))

function createStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  }
}

describe('installDeepLinkHandler console web links', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', createStorage())
    vi.stubGlobal('localStorage', createStorage())
  })

  it('strips nativeConfirmedPreview from console web deep links', async () => {
    const { installDeepLinkHandler } = await import('../src/services/deepLinks.ts')
    const push = vi.fn(async (_to: unknown) => {})
    const router = { push } as any

    await installDeepLinkHandler(router)
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1))
    expect(push.mock.calls[0]?.[0]).toBe('/scan?preview=capgo%3A%2F%2Fpreview%2Fbundle%3FappId%3Dcom.example.app%26versionId%3D1')
  })
})
