// @vitest-environment happy-dom
import type { App } from 'vue'
import { getNode } from '@formkit/core'
import { defaultConfig, plugin } from '@formkit/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import messages from '../messages/en.json'
import AndroidGoogleSignInButton from '../src/components/auth/AndroidGoogleSignInButton.vue'
import DeleteAccountPage from '../src/pages/delete_account.vue'

const nativeReady = ref(true)
const mocks = vi.hoisted(() => ({
  available: true,
  identities: ['google'],
  emailVerified: true,
  recentOtp: true,
  signIn: vi.fn(),
  appleSignIn: vi.fn(),
  getClaims: vi.fn(),
  signOut: vi.fn(),
  password: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  assurance: vi.fn(),
  listFactors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  openDialog: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  captchaReset: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('~/services/androidGoogleLogin', () => ({ isAndroidGoogleLoginAvailable: () => mocks.available && nativeReady.value, signInWithGoogle: mocks.signIn }))
vi.mock('~/services/nativeAppleLogin', () => ({ isNativeAppleLoginAvailable: () => true, signInWithApple: mocks.appleSignIn }))
vi.mock('~/services/capgoApi', () => ({ invokeCapgoApi: mocks.invoke, getCapgoApiErrorCode: vi.fn() }))
vi.mock('~/services/emailOtp', () => ({ getRecentEmailOtpVerification: async () => ({ isVerified: mocks.recentOtp }) }))
vi.mock('~/services/loader', () => ({ hideLoader: vi.fn() }))
vi.mock('~/services/support', () => ({ openSupport: vi.fn() }))
vi.mock('~/utils/turnstile', () => ({ safeResetTurnstile: mocks.captchaReset }))
vi.mock('~/stores/dialogv2', () => ({ useDialogV2Store: () => ({ openDialog: mocks.openDialog, onDialogDismiss: async () => false }) }))
vi.mock('~/services/supabase', () => ({ useSupabase: () => ({
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'google-user' } }) }) }) }),
  rpc: mocks.rpc,
  auth: {
    getClaims: mocks.getClaims,
    getSession: async () => ({ data: { session: { user: { id: 'google-user', email_confirmed_at: mocks.emailVerified ? '2026-01-01' : null, identities: mocks.identities.map(provider => ({ provider })) } } } }),
    signOut: mocks.signOut,
    signInWithPassword: mocks.password,
    mfa: { getAuthenticatorAssuranceLevel: mocks.assurance, listFactors: mocks.listFactors, challenge: mocks.challenge, verify: mocks.verify },
  },
}) }))
let app: App | undefined
async function settle() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(DeleteAccountPage)
  app.use(plugin, defaultConfig())
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en: messages } }))
  app.component('AuthPageShell', defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }))
  app.component('AndroidGoogleSignInButton', AndroidGoogleSignInButton)
  app.component('AppleSignInButton', { render: () => h('button', { 'data-test': 'apple-sign-in' }) })
  for (const name of ['Spinner', 'CapgoLoader', 'RouterLink', 'LangSelector'])
    app.component(name, { render: () => h('span') })
  app.mount(root)
  await settle()
  return root
}
async function start(root: HTMLElement) {
  ;(root.querySelector('[data-test="google-sign-in"]') as HTMLButtonElement).click()
  await settle()
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.available = true
  nativeReady.value = true
  mocks.identities = ['google']
  mocks.emailVerified = true
  mocks.recentOtp = true
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'google-user' } }, error: null })
  mocks.signIn.mockResolvedValue({ user: { id: 'google-user' } })
  mocks.signOut.mockResolvedValue({ error: null })
  mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
  mocks.listFactors.mockResolvedValue({ data: { all: [{ id: 'factor', status: 'verified' }] }, error: null })
  mocks.challenge.mockResolvedValue({ data: { id: 'challenge' }, error: null })
  mocks.verify.mockResolvedValue({ error: null })
  mocks.rpc.mockResolvedValue({ error: null })
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.innerHTML = ''
})

describe('android Google account deletion', () => {
  it('reauthenticates the same account and schedules deletion without a password', async () => {
    const root = await mount()
    expect(root.querySelector('input[type="password"]')).toBeNull()
    await start(root)
    expect(mocks.signIn).toHaveBeenCalledWith(expect.anything(), undefined, { reauthenticate: true })
    await mocks.openDialog.mock.calls[0][0].buttons[0].handler()
    expect(mocks.rpc).toHaveBeenCalledWith('delete_user')
    expect(mocks.password).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('preserves Apple revocation for accounts linked to both providers', async () => {
    mocks.identities = ['google', 'apple']
    const root = await mount()
    expect(root.querySelector('[data-test="google-sign-in"]')).toBeNull()
    expect(root.querySelector('[data-test="apple-sign-in"]')).not.toBeNull()
    expect(mocks.signIn).not.toHaveBeenCalled()
  })
  it('updates the deletion path when native readiness arrives after the session', async () => {
    nativeReady.value = false
    const root = await mount()
    expect(root.querySelector('[data-test="google-sign-in"]')).toBeNull()
    nativeReady.value = true
    await settle()
    expect(root.querySelector('[data-test="google-sign-in"]')).not.toBeNull()
    expect(root.querySelector('input[type="password"]')).toBeNull()
  })
  it('requires a configured Google binary for the passwordless deletion path', async () => {
    mocks.available = false
    const root = await mount()
    expect(root.querySelector('[data-test="google-sign-in"]')).toBeNull()
    expect(root.querySelector('input[type="password"]')).not.toBeNull()
  })
  it('does not authenticate before the account email is verified', async () => {
    mocks.emailVerified = false
    const root = await mount()
    expect(root.querySelector('[data-test="google-sign-in"]')).toBeNull()
    expect(root.textContent).toContain(messages['email-not-verified'])
    expect(mocks.signIn).not.toHaveBeenCalled()
  })
  it('requires recent email OTP before reauthentication', async () => {
    mocks.recentOtp = false
    await start(await mount())
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ path: '/resend_email' }))
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(mocks.openDialog).not.toHaveBeenCalled()
  })
  it('checks recent email OTP again at confirmation', async () => {
    await start(await mount())
    mocks.recentOtp = false
    await mocks.openDialog.mock.calls[0][0].buttons[0].handler()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ path: '/resend_email' }))
  })
  it('rejects another Google account before deletion confirmation', async () => {
    mocks.signIn.mockResolvedValue({ user: { id: 'different-user' } })
    await start(await mount())
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.openDialog).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('checks account binding again at confirmation', async () => {
    await start(await mount())
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'different-user' } }, error: null })
    await mocks.openDialog.mock.calls[0][0].buttons[0].handler()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('requires enrolled MFA before opening deletion confirmation', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    const root = await mount()
    await start(root)
    expect(root.querySelector('input[name="code"]')?.getAttribute('autocomplete')).toBe('one-time-code')
    expect(mocks.challenge).toHaveBeenCalledWith({ factorId: 'factor' })
    expect(mocks.openDialog).not.toHaveBeenCalled()
    await getNode('delete-account')!.input({ code: '123456' })
    getNode('delete-account')!.submit()
    await vi.waitFor(() => expect(mocks.verify).toHaveBeenCalledWith({ factorId: 'factor', challengeId: 'challenge', code: '123456' }))
    expect(mocks.openDialog).toHaveBeenCalledOnce()
  })
  it('returns quietly after cancellation and resets CAPTCHA', async () => {
    mocks.signIn.mockResolvedValue(null)
    const root = await mount()
    await start(root)
    expect(mocks.openDialog).not.toHaveBeenCalled()
    expect(mocks.captchaReset).toHaveBeenCalled()
    expect((root.querySelector('[data-test="google-sign-in"]') as HTMLButtonElement).disabled).toBe(false)
  })
  it.each(['mfa_challenge_expired', 'exception'])('requires new Google authorization after %s', async (failure) => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    if (failure === 'exception')
      mocks.verify.mockRejectedValue(new Error('Network unavailable'))
    else
      mocks.verify.mockResolvedValue({ error: { code: failure } })
    const root = await mount()
    await start(root)
    await getNode('delete-account')!.input({ code: '123456' })
    getNode('delete-account')!.submit()
    await vi.waitFor(() => expect(root.querySelector('[data-test="google-sign-in"]')).not.toBeNull())
    expect(mocks.openDialog).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
