<script setup lang="ts">
import type { Factor } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import dayjs from 'dayjs'
import { useI18n } from 'petite-vue-i18n'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import iconEmail from '~icons/oui/email?raw'
import iconPassword from '~icons/ph/key?raw'
import mfaIcon from '~icons/simple-icons/2fas?raw'
import { openMessenger } from '~/services/bento'
import { hideLoader } from '~/services/loader'
import { autoAuth, useSupabase } from '~/services/supabase'
import { registerWebsiteDomain } from '~/utils/Utils'

const route = useRoute('/login')
const supabase = useSupabase()
const isLoading = ref(false)
const turnstileToken = ref('')
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
const stauts: Ref<'login' | '2fa'> = ref('login')
const mfaLoginFactor: Ref<Factor | null> = ref(null)
const mfaChallangeId: Ref<string> = ref('')
const router = useRouter()
const { t } = useI18n()

const version = import.meta.env.VITE_APP_VERSION

function openSupport() {
  openMessenger()
}

async function nextLogin() {
  if (route.query.to && typeof route.query.to === 'string') {
    router.push(route.query.to)
  }
  else {
    router.push('/app/home')
  }
  setTimeout(async () => {
    isLoading.value = false
  }, 500)
}

async function submit(form: { email: string, password: string, code: string }) {
  isLoading.value = true
  if (stauts.value === 'login') {
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
      if (error.message.includes('captcha')) {
        toast.error(t('captcha-fail'))
      }
      else {
        toast.error(t('invalid-auth'))
      }

      return
    }

    if (form.email.endsWith('review@capgo.app') && Capacitor.isNativePlatform()) {
      const { data: userPreData, error: userPreError } = await supabase.from('users').select('ban_time').eq('email', form.email).single()
      if (!userPreData && userPreError) {
        isLoading.value = false
        console.error('error', error)
        setErrors('login-account', [userPreError.message], {})
        toast.error(t('failed-to-get-user'))
        return
      }

      if (!!userPreData.ban_time && dayjs().isBefore(userPreData.ban_time)) {
        isLoading.value = false
        console.error('error', error)
        setErrors('login-account', ['Invalid login credentials'], {})
        toast.error(t('failed-to-get-user'))
        return
      }
    }

    const { data: mfaFactors, error: mfaError } = await supabase.auth.mfa.listFactors()
    if (mfaError) {
      setErrors('login-account', ['See browser console'], {})
      console.error('Cannot getm MFA factors', error)
      return
    }

    const unverified = mfaFactors.all.filter(factor => factor.status === 'unverified')
    if (unverified && unverified.length > 0) {
      console.log(`Found ${unverified.length} unverified MFA factors, removing all`)
      const responses = await Promise.all(unverified.map(factor => supabase.auth.mfa.unenroll({ factorId: factor.id })))

      responses.filter(res => !!res.error).forEach(() => console.error('Failed to unregister', error))
    }

    const mfaFactor = mfaFactors?.all.find(factor => factor.status === 'verified')
    const hasMfa = !!mfaFactor

    if (hasMfa) {
      mfaLoginFactor.value = mfaFactor
      const { data: challenge, error: errorChallenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactor.id })
      if (errorChallenge) {
        isLoading.value = false
        setErrors('login-account', ['See browser console'], {})
        console.error('Cannot challange mfa', errorChallenge)
        return
      }

      mfaChallangeId.value = challenge.id
      stauts.value = '2fa'
      isLoading.value = false
    }
    else {
      await nextLogin()
    }
  }
  else {
    // http://localhost:5173/app/home
    const verify = await supabase.auth.mfa.verify({
      factorId: mfaLoginFactor.value!.id!,
      challengeId: mfaChallangeId.value!,
      code: form.code.replace(' ', ''),
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
}

async function checkLogin() {
  const parsedUrl = new URL(route.fullPath, window.location.origin)
  const params = new URLSearchParams(parsedUrl.search)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (!!accessToken && !!refreshToken) {
    const res = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (res.error) {
      console.error('Cannot set auth', res.error)
      return
    }
    nextLogin()
    return
  }

  isLoading.value = true
  const resUser = await supabase.auth.getUser()
  const user = resUser?.data.user
  const resSession = await supabase.auth.getSession()!
  let session = resSession?.data.session
  if (user) {
    const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (mfaError) {
      console.error('Cannot guard auth', mfaError)
      return
    }

    if (mfaData.currentLevel === 'aal1' && mfaData.nextLevel === 'aal2') {
      const { data: mfaFactors, error } = await supabase.auth.mfa.listFactors()
      if (error) {
        setErrors('login-account', ['See browser console'], {})
        console.error('Cannot getm MFA factors', error)
        return
      }

      const mfaFactor = mfaFactors?.all.find(factor => factor.status === 'verified')

      const { data: challenge, error: errorChallenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactor!.id })
      if (errorChallenge) {
        setErrors('login-account', ['See browser console'], {})
        console.error('Cannot challange mfa', errorChallenge)
        return
      }

      mfaLoginFactor.value = mfaFactor!
      mfaChallangeId.value = challenge.id

      stauts.value = '2fa'
      isLoading.value = false
    }
    else {
      await nextLogin()
    }
  }
  else if (!session && route.hash) {
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
    if (logSession.session)
      session = logSession.session
    if (logSession.user && logSession?.user?.email && logSession?.user?.id) {
      if (authType === 'email_change') {
        const email = logSession.user.email
        const id = logSession.user.id
        await supabase
          .from('users')
          .upsert({
            id,
            email,
          })
          .select()
          .single()
      }
      await nextLogin()
    }
  }
  else {
    isLoading.value = false
    hideLoader()
  }
}

// eslint-disable-next-line regexp/no-unused-capturing-group
const mfaRegex = /(((\d){6})|((\d){3} (\d){3}))$/
const mfa_code_validation = function (node: { value: any }) {
  return Promise.resolve(mfaRegex.test(node.value))
}

async function goback() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    toast.error(t('cannots-sign-off'))
    console.error('cannot log of', error)
    return
  }

  mfaChallangeId.value = ''
  mfaLoginFactor.value = null
  stauts.value = 'login'
}
onMounted(checkLogin)
</script>

<template>
  <!-- component -->
  <section class="flex w-full h-full py-10 my-auto overflow-y-auto lg:py-2 sm:py-8">
    <div class="px-4 mx-auto my-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="max-w-2xl mx-auto text-center">
        <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded invert dark:invert-0">
        <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
          {{ t('welcome-to') }} <p class="inline font-prompt">
            Capgo
          </p> !
        </h1>
        <p class="max-w-xl mx-auto mt-4 text-base leading-relaxed text-gray-600 dark:text-gray-300">
          {{ t('login-to-your-accoun') }}
        </p>
      </div>

      <div v-if="stauts === 'login'" class="relative max-w-md mx-auto mt-8 md:mt-4">
        <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
          <div class="px-4 py-6 text-gray-500 sm:px-8 sm:py-7">
            <FormKit id="login-account" type="form" :actions="false" @submit="submit">
              <div class="space-y-5">
                <FormKit
                  type="email" name="email" :disabled="isLoading" enterkeyhint="next"
                  :prefix-icon="iconEmail" inputmode="email" :label="t('email')" autocomplete="email"
                  validation="required:trim"
                />

                <div>
                  <FormKit
                    id="passwordInput" type="password" :placeholder="t('password')"
                    name="password" :label="t('password')" :prefix-icon="iconPassword" :disabled="isLoading"
                    validation="required:trim" enterkeyhint="send" autocomplete="current-password"
                  />
                </div>
                <div v-if="!!captchaKey">
                  <VueTurnstile v-model="turnstileToken" size="flexible" :site-key="captchaKey" />
                </div>
                <FormKitMessages />
                <div>
                  <div class="inline-flex items-center justify-center w-full">
                    <svg
                      v-if="isLoading" class="inline-block w-5 h-5 mr-3 -ml-1 text-gray-900 align-middle dark:text-white animate-spin"
                      xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    >
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path
                        class="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <button
                      v-if="!isLoading" type="submit"
                      class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 rounded-md bg-muted-blue-700 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none"
                    >
                      {{ t('log-in') }}
                    </button>
                  </div>
                </div>

                <div class="text-center">
                  <p class="pt-2 text-gray-300">
                    {{ version }}
                  </p>
                  <div class="">
                    <router-link
                      to="/resend_email"
                      class="text-sm font-medium text-orange-500 transition-all duration-200 focus:text-orange-600 hover:text-orange-600 hover:underline"
                    >
                      {{ t('resend-confirm') }}
                    </router-link>
                  </div>
                  <div class="">
                    <a
                      :href="`${registerWebsiteDomain()}/register/`"
                      class="text-sm font-medium text-orange-500 transition-all duration-200 focus:text-orange-600 hover:text-orange-600 hover:underline"
                    >
                      {{ t('create-a-free-accoun') }}
                    </a>
                  </div>
                  <div class="">
                    <router-link
                      to="/forgot_password"
                      class="text-sm font-medium text-orange-500 transition-all duration-200 focus:text-orange-600 hover:text-orange-600 hover:underline"
                    >
                      {{ t('forgot') }} {{ t('password') }} ?
                    </router-link>
                  </div>
                </div>
              </div>
            </FormKit>
          </div>
        </div>
        <section class="flex flex-col items-center mt-6">
          <div class="mx-auto">
            <LangSelector />
          </div>
          <button class="p-2 mt-3 text-gray-500 rounded-md hover:bg-gray-300" @click="openSupport">
            {{ t("support") }}
          </button>
        </section>
      </div>
      <div v-else class="relative max-w-md mx-auto mt-8 md:mt-4">
        <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
          <div class="px-4 py-6 sm:px-8 sm:py-7">
            <FormKit id="2fa-account" type="form" :actions="false" autocapitalize="off" @submit="submit">
              <div class="space-y-5 text-gray-500">
                <FormKit
                  type="text" name="code" :disabled="isLoading"
                  :prefix-icon="mfaIcon" inputmode="text" :label="t('2fa-code')"
                  :validation-rules="{ mfa_code_validation }"
                  :validation-messages="{
                    mfa_code_validation: '2FA authentication code is not formated properly',
                  }"
                  placeholder="xxx xxx"
                  autocomplete="off"
                  validation="required|mfa_code_validation"
                  validation-visibility="live"
                />
                <FormKitMessages />
                <div>
                  <div class="inline-flex items-center justify-center w-full">
                    <svg
                      v-if="isLoading" class="inline-block w-5 h-5 mr-3 -ml-1 text-gray-900 align-middle dark:text-white animate-spin"
                      xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    >
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path
                        class="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <button
                      v-if="!isLoading" type="submit"
                      class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 rounded-md bg-muted-blue-700 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none"
                    >
                      {{ t('verify') }}
                    </button>
                  </div>
                </div>

                <div class="text-center">
                  <p class="text-base text-gray-600" /><p class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline" @click="goback()">
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
      </div>
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
