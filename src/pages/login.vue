<script setup lang="ts">
import type { Factor } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import iconEmail from '~icons/oui/email?raw'
import iconPassword from '~icons/ph/key?raw'
import mfaIcon from '~icons/simple-icons/2fas?raw'
import { hideLoader } from '~/services/loader'
import { autoAuth, defaultApiHost, hashEmail, useSupabase } from '~/services/supabase'
import { openSupport } from '~/services/support'

const route = useRoute('/login')
const supabase = useSupabase()
const isLoading = ref(false)
const isMobile = ref(Capacitor.isNativePlatform())
const turnstileToken = ref('')
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
const statusAuth: Ref<'email' | 'credentials' | '2fa'> = ref('email')
const mfaLoginFactor: Ref<Factor | null> = ref(null)
const mfaChallengeId: Ref<string> = ref('')
const querySessionAccessToken = ref('')
const querySessionRefreshToken = ref('')
const hasQuerySession = ref(false)
const router = useRouter()
const { t } = useI18n()
const captchaComponent = ref<InstanceType<typeof VueTurnstile> | null>(null)

// Two-step login state
const emailForLogin = ref('')
const hasSso = ref(false)
const enforceSso = ref(false)
const isDomainChecking = ref(false)
const isCheckingSavedSession = ref(true)
const captchaStatus = ref<'disabled' | 'loading' | 'ready' | 'unavailable'>(captchaKey.value ? 'loading' : 'disabled')
let captchaInitTimeout: ReturnType<typeof setTimeout> | null = null

const version = import.meta.env.VITE_APP_VERSION
const isEmailStepBusy = computed(() => isDomainChecking.value || isCheckingSavedSession.value)
const shouldBlockForCaptcha = computed(() => !!captchaKey.value && captchaStatus.value === 'loading' && !turnstileToken.value)
const loginHeroChips = computed(() => [
  t('login-chip-live-updates'),
  t('login-chip-release-analytics'),
  t('login-chip-channel-control'),
])
const loginHeroHighlights = computed(() => [
  {
    title: t('login-highlight-rollouts-title'),
    description: t('login-highlight-rollouts-description'),
  },
  {
    title: t('login-highlight-observability-title'),
    description: t('login-highlight-observability-description'),
  },
  {
    title: t('login-highlight-team-title'),
    description: t('login-highlight-team-description'),
  },
])

const registerUrl = window.location.host === 'console.capgo.app' ? 'https://capgo.app/register/' : `/register/`

function clearCaptchaInitTimeout() {
  if (captchaInitTimeout) {
    clearTimeout(captchaInitTimeout)
    captchaInitTimeout = null
  }
}

function scheduleCaptchaInitTimeout() {
  if (!captchaKey.value || statusAuth.value !== 'credentials') {
    clearCaptchaInitTimeout()
    return
  }

  clearCaptchaInitTimeout()
  captchaInitTimeout = setTimeout(() => {
    if (!turnstileToken.value && !window.turnstile) {
      captchaStatus.value = 'unavailable'
      console.error('Turnstile failed to initialize')
    }
  }, 8000)
}

function handleCaptchaUnavailable(reason: string, error?: unknown) {
  captchaStatus.value = 'unavailable'
  clearCaptchaInitTimeout()
  console.error(reason, error)
}

watch(turnstileToken, (token) => {
  if (!captchaKey.value) {
    captchaStatus.value = 'disabled'
    return
  }

  if (token) {
    captchaStatus.value = 'ready'
    clearCaptchaInitTimeout()
  }
  else if (statusAuth.value === 'credentials') {
    captchaStatus.value = 'loading'
    scheduleCaptchaInitTimeout()
  }
})

watch(statusAuth, (status) => {
  if (!captchaKey.value) {
    captchaStatus.value = 'disabled'
    clearCaptchaInitTimeout()
    return
  }

  if (status === 'credentials') {
    captchaStatus.value = turnstileToken.value ? 'ready' : 'loading'
    scheduleCaptchaInitTimeout()
  }
  else {
    clearCaptchaInitTimeout()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  clearCaptchaInitTimeout()
})

async function nextLogin() {
  if (route.query.to && typeof route.query.to === 'string') {
    await router.replace(route.query.to)
  }
  else {
    await router.replace('/dashboard')
  }
  setTimeout(async () => {
    isLoading.value = false
  }, 500)
}

async function checkMfa() {
  const { data: mfaFactors, error: mfaError } = await supabase.auth.mfa.listFactors()
  if (mfaError) {
    setErrors('login-account', ['See browser console'], {})
    console.error('Cannot get MFA factors', mfaError)
    return
  }

  const unverified = mfaFactors.all.filter(factor => factor.status === 'unverified')
  if (unverified && unverified.length > 0) {
    console.log(`Found ${unverified.length} unverified MFA factors, removing all`)
    const responses = await Promise.all(unverified.map(factor => supabase.auth.mfa.unenroll({ factorId: factor.id })))

    responses.filter(res => !!res.error).forEach((res) => {
      console.error('Failed to unregister', res.error)
    })
  }

  const mfaFactor = mfaFactors?.all.find(factor => factor.status === 'verified')
  const hasMfa = !!mfaFactor

  if (hasMfa) {
    mfaLoginFactor.value = mfaFactor
    const { data: challenge, error: errorChallenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactor.id })
    if (errorChallenge) {
      isLoading.value = false
      setErrors('login-account', ['See browser console'], {})
      console.error('Cannot challenge mfa', errorChallenge)
      return
    }

    mfaChallengeId.value = challenge.id
    statusAuth.value = '2fa'
    isLoading.value = false
  }
  else {
    await nextLogin()
  }
}

async function checkReviewAccount(form: { email: string }) {
  // this is a review account, we need to check if the user is banned for Apple and Google to check delete feature
  const { data: userPreData, error: userPreError } = await supabase.from('users').select('ban_time').eq('email', form.email).single()
  if (!userPreData && userPreError) {
    isLoading.value = false
    console.error('error', userPreError)
    setErrors('login-account', [userPreError.message], {})
    toast.error(t('failed-to-get-user'))
    return
  }

  if (!!userPreData.ban_time && dayjs().isBefore(userPreData.ban_time)) {
    isLoading.value = false
    setErrors('login-account', ['Invalid login credentials'], {})
    toast.error(t('failed-to-get-user'))
  }
}

async function login(form: { email: string, password: string }) {
  const hashedEmail = await hashEmail(form.email)
  const { data: deleted, error: errorDeleted } = await supabase
    .rpc('is_not_deleted', { email_check: hashedEmail })
  if (errorDeleted) {
    console.error(errorDeleted)
    isLoading.value = false
    setErrors('login-account', [errorDeleted.message], {})
    return
  }

  if (!deleted) {
    toast.error(t('used-to-create'))
    isLoading.value = false
    setErrors('login-account', [t('used-to-create')], {})
    return
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: form.password,
    options: {
      captchaToken: turnstileToken.value,
    },
  })
  if (error) {
    isLoading.value = false
    console.error('error', error)
    setErrors('login-account', [error.message], {})
    if (error.message.includes('Invalid login credentials')) {
      turnstileToken.value = ''
      captchaComponent.value?.reset()
    }
    if (error.message.includes('captcha')) {
      turnstileToken.value = ''
      captchaComponent.value?.reset()
      toast.error(t('captcha-fail'))
    }
    else {
      toast.error(t('invalid-auth'))
    }

    return
  }

  if (form.email.endsWith('review@capgo.app') && Capacitor.isNativePlatform()) {
    await checkReviewAccount(form)
  }

  await checkMfa()
}

async function checkDomain(email: string): Promise<{ has_sso: boolean, enforce_sso?: boolean, provider_id?: string, org_id?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${defaultApiHost}/private/sso/check-domain`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    })

    if (!response.ok) {
      return { has_sso: false }
    }

    return await response.json()
  }
  catch {
    return { has_sso: false }
  }
}

async function handleEmailContinue(form: { email: string }) {
  isDomainChecking.value = true
  emailForLogin.value = form.email

  const result = await checkDomain(form.email)
  hasSso.value = result.has_sso
  enforceSso.value = result.enforce_sso === true

  isDomainChecking.value = false
  statusAuth.value = 'credentials'
}

async function handlePasswordSubmit(form: { password: string }) {
  isLoading.value = true
  await login({ email: emailForLogin.value, password: form.password })
}

async function handleSsoLogin() {
  if (isLoading.value || shouldBlockForCaptcha.value) {
    return
  }

  isLoading.value = true
  const domain = emailForLogin.value.split('@')[1]

  try {
    const redirectUrl = new URL('/sso-callback', window.location.origin)
    if (route.query.to && typeof route.query.to === 'string') {
      redirectUrl.searchParams.set('to', route.query.to)
    }

    const { data, error } = await supabase.auth.signInWithSSO({
      domain,
      options: {
        redirectTo: redirectUrl.toString(),
        captchaToken: turnstileToken.value,
      },
    })

    if (error) {
      console.error('SSO login error', error)
      turnstileToken.value = ''
      captchaComponent.value?.reset()
      if (error.message.includes('captcha')) {
        toast.error(t('captcha-fail'))
      }
      else {
        toast.error(t('invalid-auth'))
      }
      isLoading.value = false
      return
    }

    if (data?.url) {
      window.location.href = data.url
    }
  }
  catch (err) {
    console.error('SSO login error', err)
    turnstileToken.value = ''
    captchaComponent.value?.reset()
    toast.error(t('invalid-auth'))
    isLoading.value = false
  }
}

async function handleMfaSubmit(form: { code: string }) {
  isLoading.value = true
  const verify = await supabase.auth.mfa.verify({
    factorId: mfaLoginFactor.value!.id!,
    challengeId: mfaChallengeId.value!,
    code: form.code.replaceAll(' ', ''),
  })

  if (verify.error) {
    toast.error(t('invalid-mfa-code'))
    console.error('verify error', verify.error)
    isLoading.value = false
  }
  else {
    await nextLogin()
    isLoading.value = false
  }
}

function goBackToEmail() {
  statusAuth.value = 'email'
  hasSso.value = false
}

async function checkAuthUser() {
  const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (mfaError) {
    console.error('Cannot guard auth', mfaError)
    isLoading.value = false
    return
  }

  if (mfaData.currentLevel === 'aal1' && mfaData.nextLevel === 'aal2') {
    const { data: mfaFactors, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      setErrors('login-account', ['See browser console'], {})
      console.error('Cannot get MFA factors', error)
      isLoading.value = false
      return
    }

    const mfaFactor = mfaFactors?.all.find(factor => factor.status === 'verified')

    const { data: challenge, error: errorChallenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactor!.id })
    if (errorChallenge) {
      setErrors('login-account', ['See browser console'], {})
      console.error('Cannot challenge mfa', errorChallenge)
      isLoading.value = false
      return
    }

    mfaLoginFactor.value = mfaFactor!
    mfaChallengeId.value = challenge.id

    statusAuth.value = '2fa'
    isLoading.value = false
  }
  else {
    await nextLogin()
  }
}

async function checkMagicLink() {
  const parsedUrl = new URL(route.fullPath, window.location.origin)

  const hash = parsedUrl.hash
  const params = new URLSearchParams(hash.slice(1))
  const error = params.get('error_description')
  const message = params.get('message')
  const authType = params.get('type')

  if (message) {
    isLoading.value = false
    hideLoader()
    return setTimeout(() => {
      toast.success(message, {
        duration: 7000,
      })
    }, 400)
  }
  if (error) {
    isLoading.value = false
    hideLoader()
    return toast.error(error)
  }

  const logSession = await autoAuth(route)
  if (!logSession) {
    isLoading.value = false
    hideLoader()
    return
  }
  if (logSession.user && logSession?.user?.email && logSession?.user?.id) {
    if (authType === 'email_change') {
      const email = logSession.user.email
      const id = logSession.user.id
      await supabase
        .from('users')
        .upsert({
          id,
          email,
        }, { onConflict: 'id' })
        .select()
        .single()
    }
    await nextLogin()
  }
}

async function openScan() {
  router.push('/scan')
}

async function checkLogin() {
  try {
    const parsedUrl = new URL(route.fullPath, window.location.origin)
    const params = new URLSearchParams(parsedUrl.search)

    if (params.get('message') === 'sso_account_linked') {
      parsedUrl.searchParams.delete('message')
      window.history.replaceState({}, '', parsedUrl.toString())
      toast.success(t('sso-account-linked'))
    }

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!!accessToken && !!refreshToken) {
      parsedUrl.searchParams.delete('access_token')
      parsedUrl.searchParams.delete('refresh_token')
      window.history.replaceState({}, '', parsedUrl.toString())

      querySessionAccessToken.value = accessToken
      querySessionRefreshToken.value = refreshToken
      hasQuerySession.value = true
      isLoading.value = false
      hideLoader()
      return
    }

    isLoading.value = true
    const { data: claimsData } = await supabase.auth.getClaims()
    const hasUser = !!claimsData?.claims?.sub
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData?.session
    if (hasUser) {
      await checkAuthUser()
    }
    else if (!session && route.query.code && typeof route.query.code === 'string') {
      const { data, error } = await supabase.auth.exchangeCodeForSession(route.query.code)
      if (!error && data.session) {
        await nextLogin()
      }
      else {
        isLoading.value = false
        hideLoader()
      }
    }
    else if (!session && route.hash) {
      await checkMagicLink()
    }
    else {
      isLoading.value = false
      hideLoader()
    }
  }
  catch (error) {
    console.error('Login bootstrap failed', error)
    isLoading.value = false
    hideLoader()
  }
  finally {
    isCheckingSavedSession.value = false
  }
}

async function acceptQuerySession() {
  isLoading.value = true
  const res = await supabase.auth.setSession({
    access_token: querySessionAccessToken.value,
    refresh_token: querySessionRefreshToken.value,
  })
  if (res.error) {
    console.error('Cannot set auth', res.error)
    isLoading.value = false
    return
  }

  hasQuerySession.value = false
  querySessionAccessToken.value = ''
  querySessionRefreshToken.value = ''
  nextLogin()
}

function declineQuerySession() {
  hasQuerySession.value = false
  querySessionAccessToken.value = ''
  querySessionRefreshToken.value = ''
  isLoading.value = false
  hideLoader()
}

// eslint-disable-next-line regexp/no-unused-capturing-group
const mfaRegex = /(((\d){6})|((\d){3} (\d){3}))$/
function mfa_code_validation(node: { value: any }) {
  return Promise.resolve(mfaRegex.test(node.value))
}

async function goback() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    toast.error(t('cannot-sign-off'))
    console.error('cannot log off', error)
    return
  }

  mfaChallengeId.value = ''
  mfaLoginFactor.value = null
  statusAuth.value = 'email'
}
onMounted(checkLogin)
</script>

<template>
  <section class="login-shell flex overflow-y-auto min-h-full w-full">
    <div class="login-backdrop" aria-hidden="true">
      <div class="login-glow login-glow-primary" />
      <div class="login-glow login-glow-secondary" />
      <div class="login-grid-pattern" />
    </div>

    <div class="relative mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:min-h-full lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,30rem)] lg:items-center lg:px-8 lg:py-10">
      <section class="hidden lg:block">
        <div class="max-w-2xl">
          <div class="inline-flex flex-wrap gap-2">
            <span
              v-for="chip in loginHeroChips"
              :key="chip"
              class="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium tracking-[0.18em] text-slate-600 uppercase shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200"
            >
              {{ chip }}
            </span>
          </div>

          <div class="mt-8 space-y-5">
            <div class="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/70 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/70">
              <img src="/capgo.webp" alt="logo" class="h-8 w-8 rounded-sm invert dark:invert-0">
            </div>
            <div>
              <p class="text-xs font-semibold tracking-[0.26em] text-slate-500 uppercase dark:text-slate-300">
                {{ t('login-console-kicker') }}
              </p>
              <h1 class="mt-4 text-4xl font-semibold leading-tight text-slate-950 dark:text-white xl:text-5xl">
                {{ t('login-console-title') }}
              </h1>
              <p class="mt-5 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300 xl:text-lg">
                {{ t('login-console-description') }}
              </p>
            </div>
          </div>

          <div class="mt-10 grid gap-4 sm:grid-cols-3">
            <article
              v-for="highlight in loginHeroHighlights"
              :key="highlight.title"
              class="rounded-3xl border border-white/70 bg-white/78 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/72"
            >
              <div class="mb-3 h-2 w-12 rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-indigo-500" />
              <h2 class="text-base font-semibold text-slate-900 dark:text-white">
                {{ highlight.title }}
              </h2>
              <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ highlight.description }}
              </p>
            </article>
          </div>
        </div>
      </section>

      <div class="relative mx-auto w-full max-w-lg lg:max-w-none">
        <div class="mb-6 text-center lg:hidden">
          <img src="/capgo.webp" alt="logo" class="mx-auto mb-4 h-12 w-12 rounded-sm invert dark:invert-0">
          <p class="text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase dark:text-slate-300">
            {{ t('login-console-kicker') }}
          </p>
          <h1 class="mt-4 text-3xl font-semibold leading-tight text-slate-950 dark:text-white sm:text-4xl">
            {{ t('welcome-to') }} <span class="font-prompt">Capgo</span> !
          </h1>
          <p class="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
            {{ t('login-console-description') }}
          </p>
        </div>

        <div class="auth-card-shell">
          <div class="auth-card-header">
            <div>
              <p class="auth-card-kicker">
                {{ t('login-auth-kicker') }}
              </p>
              <h2 class="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
                {{ t('login-to-your-account') }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">
                {{ t('login-auth-description') }}
              </p>
            </div>
            <span class="auth-version-badge">{{ version }}</span>
          </div>

          <div class="relative mt-6">
            <div v-if="hasQuerySession" class="auth-step-card">
              <div class="auth-card-body space-y-4 text-gray-500">
                <p class="text-sm">
                  This link contains a login session. Continue to sign in with this session?
                </p>
                <button
                  type="button" data-test="accept-query-session" :disabled="isLoading" :aria-busy="isLoading ? 'true' : 'false'"
                  class="auth-primary-button"
                  @click="acceptQuerySession"
                >
                  <svg
                    v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-white align-middle animate-spin"
                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" data-test="loading"
                  >
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path
                      class="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Continue
                </button>
                <button
                  type="button" :disabled="isLoading"
                  class="auth-secondary-button"
                  @click="declineQuerySession"
                >
                  Cancel
                </button>
              </div>
            </div>

            <Transition v-else name="step-slide" mode="out-in">
              <!-- Step 1: Email -->
              <div v-if="statusAuth === 'email'" key="step-email" class="auth-step-card">
                <div class="auth-card-body text-gray-500">
                  <FormKit id="email-step" type="form" :actions="false" @submit="handleEmailContinue">
                    <div class="space-y-5">
                      <FormKit
                        type="email" name="email" :disabled="isEmailStepBusy" enterkeyhint="next" :placeholder="t('email')"
                        :prefix-icon="iconEmail" inputmode="email" :label="t('email')" autocomplete="email"
                        validation="required:trim" data-test="email"
                      />
                      <FormKitMessages data-test="form-error" />
                      <div>
                        <div class="inline-flex justify-center items-center w-full">
                          <button
                            type="submit" data-test="continue" :disabled="isEmailStepBusy" :aria-busy="isEmailStepBusy ? 'true' : 'false'"
                            class="auth-primary-button"
                          >
                            <svg
                              v-if="isEmailStepBusy" class="inline-block mr-3 -ml-1 w-5 h-5 text-white align-middle animate-spin"
                              xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" data-test="loading"
                            >
                              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                              <path
                                class="opacity-75" fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            {{ t('continue') }}
                          </button>
                        </div>
                      </div>

                      <div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-center dark:border-slate-700 dark:bg-slate-900/70">
                        <p class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase dark:text-slate-500">
                          {{ t('login-auth-kicker') }}
                        </p>
                        <div class="mt-3">
                          <a
                            :href="registerUrl"
                            data-test="register"
                            class="auth-inline-link"
                          >
                            {{ t('create-a-free-account') }}
                          </a>
                        </div>
                      </div>
                    </div>
                  </FormKit>
                </div>
              </div>

              <!-- Step 2: Credentials (SSO or Password) -->
              <div v-else-if="statusAuth === 'credentials'" key="step-credentials" class="auth-step-card">
                <div class="auth-card-body text-gray-500">
                  <!-- SSO path (enforce_sso=true: SSO only) -->
                  <div v-if="hasSso && enforceSso" class="space-y-5">
                    <!-- Show email context -->
                    <p class="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-gray-400 truncate dark:border-slate-700 dark:bg-slate-900/70">
                      {{ emailForLogin }}
                    </p>
                    <p class="text-sm text-gray-600 dark:text-gray-300">
                      {{ t('sso-detected') }}
                    </p>
                    <div v-if="!!captchaKey">
                      <VueTurnstile
                        ref="captchaComponent"
                        v-model="turnstileToken"
                        size="flexible"
                        :site-key="captchaKey"
                        @error="handleCaptchaUnavailable('Turnstile error', $event)"
                        @unsupported="handleCaptchaUnavailable('Turnstile unsupported')"
                      />
                    </div>
                    <div>
                      <div class="inline-flex justify-center items-center w-full">
                        <button
                          type="button" data-test="sso-login" :disabled="isLoading || shouldBlockForCaptcha" :aria-busy="isLoading ? 'true' : 'false'"
                          class="auth-primary-button"
                          @click="handleSsoLogin"
                        >
                          <svg
                            v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-white align-middle animate-spin"
                            xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" data-test="loading"
                          >
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                            <path
                              class="opacity-75" fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          {{ t('continue-with-sso') }}
                        </button>
                      </div>
                    </div>
                    <div class="text-center">
                      <p class="auth-inline-link cursor-pointer" @click="goBackToEmail()">
                        ← {{ t('go-back') }}
                      </p>
                    </div>
                  </div>

                  <!-- Password path (with optional SSO button when enforce_sso=false) -->
                  <div v-else>
                    <FormKit id="login-account" type="form" :actions="false" @submit="handlePasswordSubmit">
                      <div class="space-y-5">
                        <!--
                      Hidden email input placed inside the form so browsers and password managers
                      can associate the password field with the correct account (autocomplete="username").
                      Uses opacity+absolute positioning instead of display:none so browsers still
                      detect it for autofill purposes.
                    -->
                        <input
                          type="email"
                          :value="emailForLogin"
                          name="username"
                          autocomplete="username"
                          readonly
                          tabindex="-1"
                          aria-hidden="true"
                          style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none;"
                        >
                        <!-- Show email context -->
                        <p class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-gray-400 truncate dark:border-slate-700 dark:bg-slate-900/70">
                          {{ emailForLogin }}
                        </p>
                        <!-- Optional SSO button when SSO exists but is not enforced -->
                        <div v-if="hasSso && !enforceSso">
                          <button
                            type="button" data-test="sso-login"
                            :disabled="isLoading || shouldBlockForCaptcha"
                            :aria-busy="isLoading ? 'true' : 'false'"
                            class="auth-primary-button"
                            @click="handleSsoLogin"
                          >
                            {{ t('continue-with-sso') }}
                          </button>
                          <div class="flex items-center my-4">
                            <div class="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                            <span class="px-3 text-sm text-gray-400">or</span>
                            <div class="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                          </div>
                        </div>
                        <div>
                          <FormKit
                            id="passwordInput" type="password" :placeholder="t('password')"
                            name="password" :label="t('password')" :prefix-icon="iconPassword" :disabled="isLoading"
                            validation="required:trim" enterkeyhint="send" autocomplete="current-password"
                            data-test="password"
                          />
                        </div>
                        <div v-if="!!captchaKey">
                          <VueTurnstile
                            ref="captchaComponent"
                            v-model="turnstileToken"
                            size="flexible"
                            :site-key="captchaKey"
                            @error="handleCaptchaUnavailable('Turnstile error', $event)"
                            @unsupported="handleCaptchaUnavailable('Turnstile unsupported')"
                          />
                        </div>
                        <FormKitMessages data-test="form-error" />
                        <div>
                          <div class="inline-flex justify-center items-center w-full">
                            <button
                              type="submit" data-test="submit" :disabled="isLoading || shouldBlockForCaptcha" :aria-busy="isLoading ? 'true' : 'false'"
                              class="auth-primary-button"
                            >
                              <svg
                                v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-white align-middle animate-spin"
                                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" data-test="loading"
                              >
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                                <path
                                  class="opacity-75" fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              {{ t('log-in') }}
                            </button>
                          </div>
                        </div>

                        <div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-center dark:border-slate-700 dark:bg-slate-900/70">
                          <div>
                            <p class="auth-inline-link cursor-pointer" @click="goBackToEmail()">
                              ← {{ t('go-back') }}
                            </p>
                          </div>
                          <div class="mt-3">
                            <a
                              :href="registerUrl"
                              data-test="register"
                              class="auth-inline-link"
                            >
                              {{ t('create-a-free-account') }}
                            </a>
                          </div>
                          <div class="mt-3">
                            <router-link
                              to="/forgot_password"
                              data-test="forgot-password"
                              class="auth-inline-link"
                            >
                              {{ t('forgot') }} {{ t('password') }} ?
                            </router-link>
                          </div>
                        </div>
                      </div>
                    </FormKit>
                  </div>
                </div>
              </div>

              <!-- Step 3: 2FA -->
              <div v-else key="step-2fa" class="auth-step-card">
                <div class="auth-card-body">
                  <FormKit id="2fa-account" type="form" :actions="false" autocapitalize="off" data-test="2fa-form" @submit="handleMfaSubmit">
                    <div class="space-y-5 text-gray-500">
                      <FormKit
                        type="text" name="code" :disabled="isLoading"
                        :prefix-icon="mfaIcon" inputmode="text" :label="t('2fa-code')"
                        :validation-rules="{ mfa_code_validation }"
                        :validation-messages="{
                          mfa_code_validation: '2FA authentication code is not formatted properly',
                        }"
                        placeholder="xxx xxx"
                        autocomplete="off"
                        validation="required|mfa_code_validation"
                        validation-visibility="live"
                        data-test="2fa-code"
                      />
                      <FormKitMessages />
                      <div>
                        <div class="inline-flex justify-center items-center w-full">
                          <button
                            type="submit" data-test="verify" :disabled="isLoading" :aria-busy="isLoading ? 'true' : 'false'"
                            class="auth-primary-button"
                          >
                            <svg
                              v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-white align-middle animate-spin"
                              xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" data-test="loading"
                            >
                              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                              <path
                                class="opacity-75" fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            {{ t('verify') }}
                          </button>
                        </div>
                      </div>

                      <div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-center dark:border-slate-700 dark:bg-slate-900/70">
                        <p class="text-base text-gray-600" />
                        <p class="auth-inline-link cursor-pointer" @click="goback()">
                          {{ t('go-back') }}
                        </p>
                      </div>
                    </div>
                  </FormKit>
                </div>
              </div>
            </Transition>

            <!-- Footer (visible for email and credentials steps) -->
            <section v-if="statusAuth !== '2fa'" class="flex flex-col items-center mt-6">
              <div class="mx-auto">
                <LangSelector />
              </div>
              <button class="auth-ghost-button mt-3" @click="openSupport">
                {{ t("support") }}
              </button>
              <button v-if="isMobile" class="auth-ghost-button mt-3" @click="openScan">
                {{ t("test-bundle") }}
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.login-shell {
  background: linear-gradient(
    180deg,
    rgba(248, 250, 252, 0.98) 0%,
    rgba(238, 244, 255, 0.92) 55%,
    rgba(248, 250, 252, 0.98) 100%
  );
}

.dark .login-shell {
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0.98) 0%,
    rgba(20, 29, 53, 0.96) 52%,
    rgba(15, 23, 42, 0.98) 100%
  );
}

.login-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.login-glow {
  position: absolute;
  border-radius: 9999px;
  filter: blur(52px);
  opacity: 0.55;
}

.login-glow-primary {
  top: 10%;
  left: -8rem;
  height: 22rem;
  width: 22rem;
  background: rgba(17, 158, 255, 0.22);
}

.login-glow-secondary {
  right: -7rem;
  bottom: 8%;
  height: 18rem;
  width: 18rem;
  background: rgba(104, 118, 225, 0.18);
}

.login-grid-pattern {
  position: absolute;
  inset: 0;
  opacity: 0.4;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.12) 1px, transparent 1px);
  background-size: 3rem 3rem;
  mask-image: radial-gradient(circle at center, black 40%, transparent 82%);
}

.auth-card-shell {
  border: 1px solid rgba(226, 232, 240, 0.75);
  border-radius: 1.75rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 255, 255, 0.84) 100%);
  box-shadow: 0 34px 80px -42px rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(18px);
  padding: 1.5rem;
}

.dark .auth-card-shell {
  border-color: rgba(71, 85, 105, 0.7);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.88) 0%, rgba(15, 23, 42, 0.7) 100%);
}

.auth-card-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-card-kicker {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(100 116 139);
}

.dark .auth-card-kicker {
  color: rgb(148 163 184);
}

.auth-version-badge {
  align-self: flex-start;
  border-radius: 9999px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  background: rgba(248, 250, 252, 0.96);
  padding: 0.45rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgb(71 85 105);
}

.dark .auth-version-badge {
  border-color: rgba(71, 85, 105, 0.9);
  background: rgba(30, 41, 59, 0.9);
  color: rgb(226 232 240);
}

.auth-step-card {
  overflow: hidden;
  border-radius: 1.5rem;
  border: 1px solid rgba(226, 232, 240, 0.75);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 26px 60px -40px rgba(15, 23, 42, 0.42);
}

.dark .auth-step-card {
  border-color: rgba(71, 85, 105, 0.68);
  background: rgba(15, 23, 42, 0.8);
}

.auth-card-body {
  padding: 1.5rem 1.25rem;
}

.auth-primary-button {
  display: inline-flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 1rem;
  background: linear-gradient(135deg, rgb(36 67 102) 0%, rgb(12 110 184) 100%);
  padding: 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: white;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    filter 0.2s ease;
  box-shadow: 0 20px 38px -26px rgba(17, 158, 255, 0.85);
}

.auth-primary-button:hover,
.auth-primary-button:focus-visible {
  transform: translateY(-1px);
  filter: brightness(1.04);
  outline: none;
}

.auth-primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
  filter: none;
}

.auth-secondary-button {
  display: inline-flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: rgba(255, 255, 255, 0.92);
  padding: 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: rgb(51 65 85);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.auth-secondary-button:hover,
.auth-secondary-button:focus-visible {
  border-color: rgba(17, 158, 255, 0.45);
  background: rgba(241, 245, 249, 0.96);
  outline: none;
}

.dark .auth-secondary-button {
  border-color: rgba(71, 85, 105, 0.9);
  background: rgba(15, 23, 42, 0.85);
  color: rgb(226 232 240);
}

.dark .auth-secondary-button:hover,
.dark .auth-secondary-button:focus-visible {
  background: rgba(30, 41, 59, 0.95);
}

.auth-inline-link {
  font-size: 0.95rem;
  font-weight: 600;
  color: rgb(255 114 17);
  transition:
    color 0.2s ease,
    opacity 0.2s ease;
}

.auth-inline-link:hover,
.auth-inline-link:focus-visible {
  color: rgb(235 94 0);
  outline: none;
}

.auth-ghost-button {
  border-radius: 9999px;
  padding: 0.55rem 1rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: rgb(100 116 139);
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.auth-ghost-button:hover,
.auth-ghost-button:focus-visible {
  background: rgba(226, 232, 240, 0.75);
  color: rgb(30 41 59);
  outline: none;
}

.dark .auth-ghost-button {
  color: rgb(203 213 225);
}

.dark .auth-ghost-button:hover,
.dark .auth-ghost-button:focus-visible {
  background: rgba(30, 41, 59, 0.85);
  color: white;
}

.step-slide-enter-active,
.step-slide-leave-active {
  transition: all 0.25s ease;
}
.step-slide-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.step-slide-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

@media (min-width: 640px) {
  .auth-card-shell {
    padding: 1.75rem;
  }

  .auth-card-body {
    padding: 1.75rem;
  }

  .auth-card-header {
    align-items: flex-start;
    justify-content: space-between;
    flex-direction: row;
  }
}
</style>

<route lang="yaml">
meta:
  layout: naked
</route>
