<script setup lang="ts">
import { useVuelidate } from '@vuelidate/core'
import { email, required } from '@vuelidate/validators'
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { autoAuth, useSupabase } from '~/services/supabase'
import { hideLoader } from '~/services/loader'
import { useDisplayStore } from '~/stores/display'

const route = useRoute()
const displayStore = useDisplayStore()
const supabase = useSupabase()
const isLoading = ref(false)
const router = useRouter()
const { t } = useI18n()

const version = import.meta.env.VITE_APP_VERSION

const form = reactive({
  email: '',
  password: '',
})

const showPassword = ref(false)

const rules = {
  email: { required, email },
  password: { required },

}
const v$ = useVuelidate(rules as any, form)
const showToastMessage = async (message: string) => {
  displayStore.messageToast.push(message)
}

const nextLogin = async () => {
  router.push('/app/home')
  setTimeout(async () => {
    isLoading.value = false
  }, 500)
}

const submit = async () => {
  v$.value.$touch()
  if (!v$.value.$invalid) {
    isLoading.value = true
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    isLoading.value = false
    if (error) {
      console.error('error', error)
      showToastMessage(t('invalid-auth'))
    }
    else {
      await nextLogin()
    }
  }
}

const fixIOS = () => {
  // fix: https://github.com/ionic-team/ionic-framework/issues/23335
  if (Capacitor.getPlatform() === 'ios') {
    const emailInput = document.getElementById('emailInput')
    const passwordInput = document.getElementById('passwordInput')
    if (emailInput) {
      emailInput.addEventListener('change', (ev: Event) => {
        requestAnimationFrame(() => {
          form.email = (ev.target as HTMLInputElement).value
        })
      })
    }
    if (passwordInput) {
      passwordInput.addEventListener('change', (ev: Event) => {
        requestAnimationFrame(() => {
          form.password = (ev.target as HTMLInputElement).value
        })
      })
    }
  }
}

const checkLogin = async () => {
  isLoading.value = true
  const resUser = await supabase.auth.getUser()
  const user = resUser?.data.user
  const resSession = await supabase.auth.getSession()!
  let session = resSession?.data.session
  if (user) {
    await nextLogin()
  }
  else if (!session && route.hash) {
    const logSession = await autoAuth(route)
    if (!logSession)
      return
    if (logSession.session)
      session = logSession.session
    if (logSession.user)
      await nextLogin()
  }
  else {
    isLoading.value = false
    hideLoader()
    fixIOS()
  }
}

onMounted(checkLogin)
</script>

<template>
  <!-- component -->
  <section class="flex w-full h-full py-10 my-auto sm:py-8 lg:py-2">
    <div class="px-4 mx-auto my-auto max-w-7xl sm:px-6 lg:px-8">
      <div class="max-w-2xl mx-auto text-center">
        <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded">
        <h1 class="text-3xl font-bold leading-tight text-black dark:text-white sm:text-4xl lg:text-5xl">
          {{ t('welcome-to') }} <p class="inline font-prompt">
            Capgo
          </p> !
        </h1>
        <p class="max-w-xl mx-auto mt-4 text-base leading-relaxed text-gray-600">
          {{ t('login-to-your-accoun') }}
        </p>
      </div>

      <div class="relative max-w-md mx-auto mt-8 md:mt-4">
        <div class="overflow-hidden bg-white rounded-md shadow-md">
          <div class="px-4 py-6 sm:px-8 sm:py-7">
            <form @submit.prevent="submit">
              <div class="space-y-5">
                <div>
                  <label for="" class="text-base font-medium text-gray-900"> Email address </label>
                  <div class="mt-2.5 relative text-gray-400 focus-within:text-gray-600">
                    <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    </div>

                    <input
                      id="emailInput"
                      v-model="form.email"
                      inputmode="email" autocomplete="email"
                      name="email"
                      type="email"
                      :disabled="isLoading"
                      :placeholder="t('login.email')"
                      :required="true"
                      class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-blue-600 caret-blue-600"
                    >
                    <div v-for="(error, index) of v$.email.$errors" :key="index">
                      <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                        {{ t('login.email') }}: {{ error.$message }}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between">
                    <label for="" class="text-base font-medium text-gray-900"> {{ t('register.password') }} </label>
                    <router-link
                      to="/forgot_password"
                      class="text-sm font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 focus:text-orange-600 hover:underline"
                    >
                      {{ t('login.forgot') }} {{ t('login.password') }} ?
                    </router-link>
                  </div>
                  <div class="mt-2.5 relative text-gray-400 focus-within:text-gray-600">
                    <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                        />
                      </svg>
                    </div>

                    <input
                      id="passwordInput" v-model="form.password" autocomplete="current-password" name="password" enterkeyhint="send" :disabled="isLoading" :type="showPassword ? 'text' : 'password'" :placeholder="t('login.password') " :required="true"
                      class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-blue-600 caret-blue-600"
                    >
                  </div>
                  <div>
                    <div v-for="(error, index) of v$.password.$errors" :key="index">
                      <p class="mt-2 mb-4 text-xs italic text-muted-blue-500">
                        {{ t('login.password') }}: {{ error.$message }}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <button type="submit" class="inline-flex items-center justify-center w-full">
                    <svg v-if="isLoading" class="inline-block w-5 h-5 mr-3 -ml-1 text-gray-900 align-middle animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <button v-if="!isLoading" type="submit" class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 rounded-md bg-muted-blue-700 hover:bg-blue-700 focus:bg-blue-700 focus:outline-none">
                      {{ t('log-in') }}
                    </button>
                  </button>
                </div>

                <div class="text-center">
                  <p class="text-base text-gray-600">
                    {{ t('dont-have-an-account') }} <br> <router-link to="/register" class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline">
                      {{ t('create-a-free-accoun') }}
                    </router-link>
                  </p>
                  <p class="pt-2 text-gray-300">
                    {{ version }}
                  </p>
                </div>
              </div>
            </form>
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
