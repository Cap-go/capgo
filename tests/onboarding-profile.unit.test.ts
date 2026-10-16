// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive } from 'vue'
import OnboardingProfile from '../src/components/OnboardingProfile.vue'
import { hasProfileOnboarding, resolveOnboardingAnalyticsVersion } from '../src/utils/onboardingABTests'
import { createOnboardingDetailsFieldDebouncer } from '../src/utils/onboardingProgressAnalytics'

const mocks = vi.hoisted(() => ({ single: vi.fn(), update: vi.fn(), setUser: vi.fn(), toast: vi.fn() }))
const state = reactive({ user: { id: 'profile-user', email: 'profile@example.com', first_name: '', last_name: '', onboarding: { version: 6 }, image_url: null } })
vi.mock('~/stores/main', () => ({ useMainStore: () => state }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-sonner', () => ({ toast: { error: mocks.toast } }))
vi.mock('~/services/posthog', () => ({ setUser: mocks.setUser }))
vi.mock('~/services/supabase', () => ({
  getLocalConfig: () => ({ supaHost: 'https://example.supabase.co' }),
  isLocal: () => false,
  useSupabase: () => ({ from: () => ({ update: (...args: unknown[]) => {
    mocks.update(...args)
    return { eq: () => ({ select: () => ({ single: mocks.single }) }) }
  } }) }),
}))

let app: ReturnType<typeof createApp> | undefined
function mount() {
  const container = document.createElement('div')
  const fields = vi.fn()
  app = createApp(OnboardingProfile, { onFieldInput: fields })
  const profile = app.mount(container) as unknown as { isValid: boolean, save: () => Promise<boolean> }
  return { container, profile, fields }
}
async function enter(container: HTMLElement, field: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`[data-test="onboarding-${field}"]`)!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
beforeEach(() => {
  vi.clearAllMocks()
  state.user = { id: 'profile-user', email: 'profile@example.com', first_name: '', last_name: '', onboarding: { version: 6 }, image_url: null }
  mocks.single.mockResolvedValue({ data: { id: 'profile-user', first_name: 'Example', last_name: 'User' }, error: null })
})
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('profile onboarding V6', () => {
  it('gates the form and analytics version by persisted cohort, preserving legacy experiment versions', () => {
    expect(hasProfileOnboarding({ version: 6 })).toBe(true)
    expect(hasProfileOnboarding({ version: 5 })).toBe(false)
    expect(resolveOnboardingAnalyticsVersion({ version: 6 })).toBe(6)
    expect(resolveOnboardingAnalyticsVersion({})).toBe(4)
    const abtests = { webnativeapp_publish_intent: { assigned_at: '2026-01-01', branch: 'A' } }
    expect(resolveOnboardingAnalyticsVersion({ abtests })).toBe('5.A')
    expect(resolveOnboardingAnalyticsVersion({ version: 6, abtests })).toBe(6)
    state.user.onboarding = { version: 4 }
    const { container, profile } = mount()
    expect(container.querySelector('input')).toBeNull()
    expect(profile.isValid).toBe(true)
  })

  it('updates PostHog person names only after the profile is saved', async () => {
    const { container, profile, fields } = mount()
    await enter(container, 'first-name', '  Example  ')
    await enter(container, 'last-name', '  User  ')
    expect(mocks.setUser).not.toHaveBeenCalled()
    expect(fields.mock.calls).toEqual([['first_name', '  Example  '], ['last_name', '  User  ']])
    expect(await profile.save()).toBe(true)
    expect(mocks.update).toHaveBeenCalledWith({ first_name: 'Example', last_name: 'User' })
    expect(mocks.setUser).toHaveBeenCalledWith('profile-user', expect.objectContaining({ first_name: 'Example', last_name: 'User', nickname: 'Example User' }), 'https://example.supabase.co')
  })

  it('does not report unsaved names when persistence fails, and allows retry', async () => {
    mocks.single.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    const { container, profile } = mount()
    await enter(container, 'first-name', 'Example')
    await enter(container, 'last-name', 'User')
    expect(await profile.save()).toBe(false)
    expect(mocks.setUser).not.toHaveBeenCalled()
    expect(state.user.first_name).toBe('')
    expect(await profile.save()).toBe(true)
    expect(mocks.setUser).toHaveBeenCalledOnce()
  })

  it('keeps a successful save successful if analytics throws', async () => {
    mocks.setUser.mockImplementationOnce(() => {
      throw new Error('analytics unavailable')
    })
    const { container, profile } = mount()
    await enter(container, 'first-name', 'Example')
    await enter(container, 'last-name', 'User')
    expect(await profile.save()).toBe(true)
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('identifies saved names as PostHog person properties', async () => {
    const identify = vi.fn()
    vi.stubGlobal('posthog', { identify, setPersonProperties: vi.fn() })
    const { setUser } = await vi.importActual<typeof import('../src/services/posthog')>('../src/services/posthog')
    setUser('profile-user', { first_name: 'Example', last_name: 'User', nickname: 'Example User' }, 'https://example.supabase.co')
    expect(identify).toHaveBeenCalledWith('profile-user', expect.objectContaining({ first_name: 'Example', last_name: 'User', name: 'Example User' }))
  })

  it('debounces each name independently for 500 ms and sends lengths without typed names', () => {
    vi.useFakeTimers()
    const capture = vi.fn()
    const tracker = createOnboardingDetailsFieldDebouncer(capture, 500)
    tracker.schedule('onboarding_first_name_entered', 'first_name', 'intent', 'Ex')
    vi.advanceTimersByTime(300)
    tracker.schedule('onboarding_first_name_entered', 'first_name', 'intent', 'Example')
    tracker.schedule('onboarding_last_name_entered', 'last_name', 'intent', 'User')
    vi.advanceTimersByTime(499)
    expect(capture).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(capture.mock.calls).toEqual([
      ['onboarding_first_name_entered', 'intent', { field_length: 7 }],
      ['onboarding_last_name_entered', 'intent', { field_length: 4 }],
    ])
    tracker.dispose()
  })
})
