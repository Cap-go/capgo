<script setup lang="ts">
import type { Factor } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import dayjs from 'dayjs'
import { onMounted, ref } from 'vue'
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
const isDomainChecking = ref(false)

const version = import.meta.env.VITE_APP_VERSION

const registerUrl = window.location.host === 'console.capgo.app' ? 'https://capgo.app/register/' : `/register/`

async function nextLogin() {
  if (route.query.to && typeof route.query.to === 'string') {
    router.replace(route.query.to)
  }
  else {
    router.replace('/dashboard')
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
      captchaComponent.value?.reset()
    }
    if (error.message.includes('captcha')) {
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

async function checkDomain(email: string): Promise<{ has_sso: boolean, provider_id?: string, org_id?: string }> {
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

  isDomainChecking.value = false
  statusAuth.value = 'credentials'
}

async function handlePasswordSubmit(form: { password: string }) {
  isLoading.value = true
  await login({ email: emailForLogin.value, password: form.password })
}

async function handleSsoLogin() {
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
      },
    })

    if (error) {
      console.error('SSO login error', error)
      toast.error(t('invalid-auth'))
      isLoading.value = false
      return
    }

    if (data?.url) {
      window.location.href = data.url
    }
  }
  catch (err) {
    console.error('SSO login error', err)
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
    return
  }

  if (mfaData.currentLevel === 'aal1' && mfaData.nextLevel === 'aal2') {
    const { data: mfaFactors, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      setErrors('login-account', ['See browser console'], {})
      console.error('Cannot get MFA factors', error)
      return
    }

    const mfaFactor = mfaFactors?.all.find(factor => factor.status === 'verified')

    const { data: challenge, error: errorChallenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactor!.id })
    if (errorChallenge) {
      setErrors('login-account', ['See browser console'], {})
      console.error('Cannot challenge mfa', errorChallenge)
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
    return setTimeout(() => {
      toast.success(message, {
        duration: 7000,
      })
    }, 400)
  }
  if (error) {
    isLoading.value = false
    return toast.error(error)
  }

  const logSession = await autoAuth(route)
  if (!logSession)
    return
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
  const parsedUrl = new URL(route.fullPath, window.location.origin)
  const params = new URLSearchParams(parsedUrl.search)
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
  else if (!session && route.hash) {
    await checkMagicLink()
  }
  else {
    isLoading.value = false
    hideLoader()
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
  <!-- component -->
  <section class="flex overflow-y-auto py-10 my-auto w-full h-full sm:py-8 lg:py-2">
    <div class="px-4 my-auto mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded-sm invert dark:invert-0">
        <h1 class="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl dark:text-white">
          {{ t('welcome-to') }} <p class="inline font-prompt">
            Capgo
          </p> !
        </h1>
        <p class="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-300">
          {{ t('login-to-your-account') }}
        </p>
      </div>

      <div class="relative mx-auto mt-8 max-w-md md:mt-4">
        <div v-if="hasQuerySession" class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
          <div class="py-6 px-4 space-y-4 text-gray-500 sm:py-7 sm:px-8">
            <p class="text-sm">
              This link contains a login session. Continue to sign in with this session?
            </p>
            <button
              v-if="!isLoading" type="button" data-test="accept-query-session"
              class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden"
              @click="acceptQuerySession"
            >
              Continue
            </button>
            <button
              v-if="!isLoading" type="button" class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-slate-700 rounded-md border border-slate-300 transition-all duration-200 hover:bg-slate-50 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700"
              @click="declineQuerySession"
            >
              Cancel
            </button>
          </div>
        </div>

        <Transition v-else name="step-slide" mode="out-in">
          <!-- Step 1: Email -->
          <div v-if="statusAuth === 'email'" key="step-email" class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
            <div class="py-6 px-4 text-gray-500 sm:py-7 sm:px-8">
              <FormKit id="email-step" type="form" :actions="false" @submit="handleEmailContinue">
                <div class="space-y-5">
                  <FormKit
                    type="email" name="email" :disabled="isDomainChecking" enterkeyhint="next" :placeholder="t('email')"
                    :prefix-icon="iconEmail" inputmode="email" :label="t('email')" autocomplete="email"
                    validation="required:trim" data-test="email"
                  />
                  <FormKitMessages data-test="form-error" />
                  <div>
                    <div class="inline-flex justify-center items-center w-full">
                      <svg
                        v-if="isDomainChecking" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-900 align-middle animate-spin dark:text-white"
                        xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" data-test="loading"
                      >
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                        <path
                          class="opacity-75" fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <button
                        v-if="!isDomainChecking" type="submit" data-test="continue"
                        class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden"
                      >
                        {{ t('continue') }}
                      </button>
                    </div>
                  </div>

                  <div class="text-center">
                    <p class="pt-2 text-gray-300">
                      {{ version }}
                    </p>
                    <div>
                      <a
                        :href="registerUrl"
                        data-test="register"
                        class="text-sm font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline focus:text-orange-600"
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
          <div v-else-if="statusAuth === 'credentials'" key="step-credentials" class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
            <div class="py-6 px-4 text-gray-500 sm:py-7 sm:px-8">
              <!-- Show email context -->
              <p class="mb-4 text-sm text-gray-400 truncate">
                {{ emailForLogin }}
              </p>

              <!-- SSO path -->
              <div v-if="hasSso" class="space-y-5">
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  {{ t('sso-detected') }}
                </p>
                <div>
                  <div class="inline-flex justify-center items-center w-full">
                    <svg
                      v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-900 align-middle animate-spin dark:text-white"
                      xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" data-test="loading"
                    >
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path
                        class="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <button
                      v-if="!isLoading"
                      type="button" data-test="sso-login"
                      class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden"
                      @click="handleSsoLogin"
                    >
                      {{ t('continue-with-sso') }}
                    </button>
                  </div>
                </div>
                <div class="text-center">
                  <p class="font-medium text-orange-500 transition-all duration-200 cursor-pointer hover:text-orange-600 hover:underline" @click="goBackToEmail()">
                    ← {{ t('go-back') }}
                  </p>
                </div>
              </div>

              <!-- Password path -->
              <div v-else>
                <FormKit id="login-account" type="form" :actions="false" @submit="handlePasswordSubmit">
                  <div class="space-y-5">
                    <div>
                      <FormKit
                        id="passwordInput" type="password" :placeholder="t('password')"
                        name="password" :label="t('password')" :prefix-icon="iconPassword" :disabled="isLoading"
                        validation="required:trim" enterkeyhint="send" autocomplete="current-password"
                        data-test="password"
                      />
                    </div>
                    <div v-if="!!captchaKey">
                      <VueTurnstile ref="captchaComponent" v-model="turnstileToken" size="flexible" :site-key="captchaKey" />
                    </div>
                    <FormKitMessages data-test="form-error" />
                    <div>
                      <div class="inline-flex justify-center items-center w-full">
                        <svg
                          v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-900 align-middle animate-spin dark:text-white"
                          xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" data-test="loading"
                        >
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                          <path
                            class="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <button
                          v-if="!isLoading" type="submit" data-test="submit"
                          class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden"
                        >
                          {{ t('log-in') }}
                        </button>
                      </div>
                    </div>

                    <div class="text-center">
                      <p class="pt-2 text-gray-300">
                        {{ version }}
                      </p>
                      <div>
                        <p class="font-medium text-orange-500 transition-all duration-200 cursor-pointer hover:text-orange-600 hover:underline" @click="goBackToEmail()">
                          ← {{ t('go-back') }}
                        </p>
                      </div>
                      <div>
                        <a
                          :href="registerUrl"
                          data-test="register"
                          class="text-sm font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline focus:text-orange-600"
                        >
                          {{ t('create-a-free-account') }}
                        </a>
                      </div>
                      <div>
                        <router-link
                          to="/forgot_password"
                          data-test="forgot-password"
                          class="text-sm font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline focus:text-orange-600"
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
          <div v-else key="step-2fa" class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
            <div class="py-6 px-4 sm:py-7 sm:px-8">
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
                      <svg
                        v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-900 align-middle animate-spin dark:text-white"
                        xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                      >
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                        <path
                          class="opacity-75" fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <button
                        v-if="!isLoading" type="submit" data-test="verify"
                        class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden"
                      >
                        {{ t('verify') }}
                      </button>
                    </div>
                  </div>

                  <div class="text-center">
                    <p class="text-base text-gray-600" />
                    <p class="font-medium text-orange-500 transition-all duration-200 cursor-pointer hover:text-orange-600 hover:underline" @click="goback()">
                      {{ t('go-back') }}
                    </p>
                    <p class="pt-2 text-gray-300">
                      {{ version }}
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
          <button class="p-2 mt-3 text-gray-500 rounded-md hover:bg-gray-300" @click="openSupport">
            {{ t("support") }}
          </button>
          <button v-if="isMobile" class="p-2 mt-3 text-gray-500 rounded-md hover:bg-gray-300" @click="openScan">
            {{ t("test-bundle") }}
          </button>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
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
</style>

<route lang="yaml">
meta:
  layout: naked
</route>
