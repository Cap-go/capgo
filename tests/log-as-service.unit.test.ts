import type { Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSpoofedAdminJwt: vi.fn(),
  isSpoofed: vi.fn(),
  saveSpoof: vi.fn(),
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
  },
  useSupabase: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: mocks.toast,
}))

vi.mock('../src/services/supabase.ts', () => ({
  getSpoofedAdminJwt: mocks.getSpoofedAdminJwt,
  isSpoofed: mocks.isSpoofed,
  saveSpoof: mocks.saveSpoof,
  useSupabase: mocks.useSupabase,
}))

function createRouter() {
  return {
    replace: vi.fn(() => Promise.resolve()),
  } as unknown as Router
}

function useSupabaseMock() {
  const invoke = vi.fn()
  const getSession = vi.fn()
  const setSession = vi.fn()

  mocks.useSupabase.mockReturnValue({
    auth: {
      getSession,
      setSession,
    },
    functions: {
      invoke,
    },
  })

  return { getSession, invoke, setSession }
}

describe('logAsUser', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mocks.toast.loading.mockReturnValue('toast-id')
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    vi.useRealTimers()
  })

  it('keeps the current spoofed session untouched when the next spoof request fails', async () => {
    const { getSession, invoke, setSession } = useSupabaseMock()
    mocks.isSpoofed.mockReturnValue(true)
    mocks.getSpoofedAdminJwt.mockResolvedValue('admin-jwt')
    invoke.mockResolvedValue({ data: null, error: new Error('User does not exist') })

    const { logAsUser } = await import('../src/services/logAs.ts')

    await expect(logAsUser('missing-target', createRouter())).rejects.toThrow('User does not exist')

    expect(mocks.getSpoofedAdminJwt).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith('private/log_as', {
      body: { identifier: 'missing-target' },
      headers: { Authorization: 'Bearer admin-jwt' },
    })
    expect(getSession).not.toHaveBeenCalled()
    expect(setSession).not.toHaveBeenCalled()
    expect(mocks.saveSpoof).not.toHaveBeenCalled()
  })

  it('switches between spoofed users without replacing the stored admin backup', async () => {
    const { getSession, invoke, setSession } = useSupabaseMock()
    mocks.isSpoofed.mockReturnValue(true)
    mocks.getSpoofedAdminJwt.mockResolvedValue('admin-jwt')
    invoke.mockResolvedValue({ data: { jwt: 'new-user-jwt', refreshToken: 'new-user-refresh' }, error: null })
    setSession.mockResolvedValue({ data: { session: {} }, error: null })

    const { logAsUser } = await import('../src/services/logAs.ts')

    await logAsUser('next-target', createRouter())

    expect(invoke).toHaveBeenCalledWith('private/log_as', {
      body: { identifier: 'next-target' },
      headers: { Authorization: 'Bearer admin-jwt' },
    })
    expect(getSession).not.toHaveBeenCalled()
    expect(setSession).toHaveBeenCalledWith({ access_token: 'new-user-jwt', refresh_token: 'new-user-refresh' })
    expect(mocks.saveSpoof).not.toHaveBeenCalled()
  })

  it('stores the current admin session when starting a spoof from the admin account', async () => {
    const { getSession, invoke, setSession } = useSupabaseMock()
    mocks.isSpoofed.mockReturnValue(false)
    invoke.mockResolvedValue({ data: { jwt: 'user-jwt', refreshToken: 'user-refresh' }, error: null })
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'admin-jwt',
          refresh_token: 'admin-refresh',
        },
      },
      error: null,
    })
    setSession.mockResolvedValue({ data: { session: {} }, error: null })

    const { logAsUser } = await import('../src/services/logAs.ts')

    await logAsUser('target-user', createRouter())

    expect(mocks.getSpoofedAdminJwt).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith('private/log_as', {
      body: { identifier: 'target-user' },
    })
    expect(mocks.saveSpoof).toHaveBeenCalledWith('admin-jwt', 'admin-refresh')
    expect(setSession).toHaveBeenCalledWith({ access_token: 'user-jwt', refresh_token: 'user-refresh' })
  })
})
