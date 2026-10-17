// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, shallowReactive } from 'vue'
import NamePage from '../src/pages/onboarding/name.vue'

const mocks = vi.hoisted(() => ({
  valid: false,
  persist: vi.fn(), toastError: vi.fn(),
  save: vi.fn(), reset: vi.fn(), replace: vi.fn(), logout: vi.fn(), capture: vi.fn(),
  profileEmit: undefined as undefined | ((event: string, ...args: unknown[]) => void),
  route: { query: {} as Record<string, string> },
}))
const main = shallowReactive({ authGeneration: 1, user: { id: 'name-user', first_name: '', last_name: '', onboarding: { version: 6 } as any }, logout: mocks.logout })
vi.mock('~/stores/main', () => ({ useMainStore: () => main }))
vi.mock('~/stores/organization', () => ({ useOrganizationStore: () => ({ hasOrganizations: false }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace, resolve: (path: string) => {
    const url = new URL(path, 'https://example.com')
    return { path: url.pathname, query: Object.fromEntries(url.searchParams), hash: url.hash }
  } }),
}))
vi.mock('vue-sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('~/services/supabase', () => ({ getLocalConfig: () => ({ supaHost: 'https://example.com' }), isLocal: () => false }))
vi.mock('~/services/onboardingTracking', () => ({ sendOnboardingEvent: mocks.capture }))
vi.mock('~/services/userOnboardingWriteQueue', () => ({
  serializeUserOnboardingWrite: (_id: string, write: () => unknown) => write(),
  replaceUserOnboardingWithRetry: mocks.persist,
}))
vi.mock('~/components/auth/AuthPageShell.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }) }
})
vi.mock('~/components/OnboardingProfile.vue', async () => {
  const { defineComponent, h, ref } = await import('vue')
  return { default: defineComponent({
    emits: ['fieldInput', 'saveFailed'],
    setup: (_, { expose, emit }) => {
      mocks.profileEmit = emit as typeof mocks.profileEmit
      expose({ isValid: ref(mocks.valid), resetDraft: mocks.reset, save: async () => {
        const saved = await mocks.save()
        if (!saved)
          emit('saveFailed')
        return saved
      } })
      return () => h('div')
    },
  }) }
})

let app: ReturnType<typeof createApp> | undefined
async function mount() {
  const container = document.createElement('div')
  app = createApp(NamePage)
  app.mount(container)
  await nextTick()
  await Promise.resolve()
  return container
}
async function submit(container: HTMLElement) {
  container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.valid = false
  mocks.persist.mockImplementation(async (_id: string, current: unknown, build: (current: unknown) => unknown) => ({ status: 'persisted', onboarding: build(current) }))
  mocks.route.query = {}
  mocks.save.mockResolvedValue(true)
  mocks.reset.mockResolvedValue(true)
  mocks.replace.mockResolvedValue(undefined)
  main.user = { id: 'name-user', first_name: '', last_name: '', onboarding: { version: 6 } }
})
afterEach(() => { app?.unmount(); app = undefined; vi.useRealTimers() })

describe('separate required name screen', () => {
  it('blocks continuing and programmatic form submission while names are invalid', async () => {
    const container = await mount()
    expect(container.querySelector<HTMLButtonElement>('[data-test="onboarding-name-continue"]')?.disabled).toBe(true)
    await submit(container)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
  it('stays on name after a failed save and tracks failure without step completion', async () => {
    mocks.valid = true
    mocks.save.mockResolvedValue(false)
    const container = await mount()
    await submit(container)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.capture).toHaveBeenCalledWith('onboarding_profile_save_failed', expect.objectContaining({ step: 'name', onboarding_version: 6 }))
    expect(mocks.capture.mock.calls.some(call => call[0] === 'onboarding_step_completed')).toBe(false)
  })
  it('preserves the original destination query/hash and telemetry identity after saving', async () => {
    mocks.valid = true
    mocks.route.query.to = '/onboarding/organization?source=org-switcher#details'
    const container = await mount()
    await submit(container)
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalled())
    expect(main.user.onboarding.profile_completed_at).toEqual(expect.any(String))
    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({ path: '/onboarding/organization', query: { source: 'org-switcher' }, hash: '#details', state: { capgoProfileOnboardingHandoff: expect.objectContaining({ attemptId: expect.any(String), runId: expect.any(String) }) } }))
    expect(mocks.capture).toHaveBeenCalledWith('onboarding_profile_saved', expect.objectContaining({ step: 'name', onboarding_version: 6 }))
    expect(mocks.capture).toHaveBeenCalledWith('onboarding_step_completed', expect.not.objectContaining({ next_step: 'welcome' }))
  })
  it.each(['error', 'throw'])('requires persisted confirmation when its write fails with %s', async (failure) => {
    mocks.valid = true
    const container = await mount()
    if (failure === 'throw')
      mocks.persist.mockRejectedValueOnce(new Error('network unavailable'))
    else
      mocks.persist.mockResolvedValueOnce({ status: 'error', error: new Error('write rejected') })
    await submit(container)
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(main.user.onboarding.profile_completed_at).toBeUndefined()
    expect(mocks.capture).toHaveBeenCalledWith('onboarding_profile_save_failed', expect.objectContaining({ step: 'name' }))
    expect(mocks.capture.mock.calls.some(call => call[0] === 'onboarding_step_completed')).toBe(false)
  })
  it('debounces field events for 500 ms and sends lengths without raw names', async () => {
    vi.useFakeTimers()
    await mount()
    mocks.profileEmit?.('fieldInput', 'first_name', 'Alice')
    mocks.profileEmit?.('fieldInput', 'last_name', 'Smith')
    await vi.advanceTimersByTimeAsync(499)
    expect(mocks.capture.mock.calls.some(call => call[0] === 'onboarding_first_name_entered')).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.capture).toHaveBeenCalledWith('onboarding_first_name_entered', expect.objectContaining({ step: 'name', field_length: 5, onboarding_version: 6 }))
    expect(mocks.capture).toHaveBeenCalledWith('onboarding_last_name_entered', expect.objectContaining({ step: 'name', field_length: 5, onboarding_version: 6 }))
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toMatch(/Alice|Smith/)
  })
})
