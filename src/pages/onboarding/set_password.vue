<script setup lang="ts">
import { helpers, minLength, required, sameAs } from '@vuelidate/validators'
import { useVuelidate } from '@vuelidate/core'
import { computed, reactive, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const isLoading = ref(false)
const supabase = useSupabase()
const errorMessage = ref('')
const form = reactive({
  password: '',
  confirmPassword: '',
})
const containsUppercase = helpers.regex(/[A-Z]/)
const containsLowercase = helpers.regex(/[a-z]/)
const containsSpecial = helpers.regex(/[#?!@$%^&*-]/)

const { t } = useI18n()

const rules = computed(() => ({
  password: {
    required,
    minLength: minLength(6),
    containsUppercase: helpers.withMessage(t('upperCaseError'), containsUppercase),
    containsLowercase: helpers.withMessage(t('lowerCaseError'), containsLowercase),
    containsSpecial: helpers.withMessage(t('specialError'), containsSpecial),
  },
  confirmPassword: {
    required,
    minLength: minLength(6),
    sameAsPassword: sameAs(form.password),
  },
}))

const v$ = useVuelidate(rules, form)
const displayStore = useDisplayStore()
const router = useRouter()
const route = useRoute()

const signInUser = async () => {
  if (!route.hash) {
    router.push('/login')
    return
  }
  const queryString = route.hash.replace('#', '')
  const urlParams = new URLSearchParams(queryString)
  const refresh_token = urlParams.get('refresh_token')
  if (!refresh_token) {
    router.push('/login')
    return
  }
  await supabase.auth.refreshSession({
    refresh_token: refresh_token || '',
  })
}

const submit = async () => {
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect) {
    isLoading.value = false
    return
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: form.password })
  isLoading.value = false
  if (updateError)
    errorMessage.value = updateError.message
  else
    displayStore.messageToast.push(t('changed-password-suc'))
  router.push('/onboarding/activation')
}

watchEffect(async () => {
  if (route && route.path === '/onboarding/set_password')
    await signInUser()
})
</script>

<template>
  <section v-if="isLoading" class="flex justify-center">
    <Spinner size="w-40 h-40" class="my-auto" />
  </section>
  <div v-else>
    <section class="flex w-full h-full py-10 my-auto overflow-y-scroll sm:py-8 lg:py-2">
      <div class="px-4 mx-auto my-auto max-w-7xl sm:px-6 lg:px-8">
        <div class="max-w-2xl mx-auto text-center">
          <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded">
          <h1 class="text-3xl font-bold leading-tight text-black dark:text-white sm:text-4xl lg:text-5xl">
            {{ t('password-heading') }}
          </h1>
          <p>
            {{ t('enter-your-new-passw') }}
          </p>
        </div>

        <div class="relative max-w-md mx-auto mt-8 md:mt-4">
          <div class="overflow-hidden bg-white rounded-md shadow-md">
            <div class="px-4 py-6 sm:px-8 sm:py-7">
              <form @submit.prevent="submit">
                <div class="space-y-5">
                  <p v-if="errorMessage" class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                    {{ errorMessage }}
                  </p>

                  <div>
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
                        id="passwordInput" v-model="form.password" autocomplete="current-password" name="password" enterkeyhint="send" :disabled="isLoading" type="password" :placeholder="t('password') " :required="true"
                        class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-blue-600 caret-blue-600"
                      >
                    </div>
                    <div>
                      <div v-for="(error, index) of v$.password?.$errors" :key="index">
                        <p class="mt-2 mb-4 text-xs italic text-muted-blue-500">
                          {{ t('password') }}: {{ error.$message }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
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
                        id="passwordInput2" v-model="form.confirmPassword" autocomplete="current-password" name="password2" enterkeyhint="send" :disabled="isLoading" type="password" :placeholder="t('confirm-password') " :required="true"
                        class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-blue-600 caret-blue-600"
                      >
                    </div>
                    <div>
                      <div v-for="(error, index) of v$.confirmPassword?.$errors" :key="index">
                        <p class="mt-2 mb-4 text-xs italic text-muted-blue-500">
                          {{ t('password') }}: {{ error.$message }}
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
                      <button v-if="!isLoading" type="submit" class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 border border-transparent rounded-md bg-muted-blue-700 focus:outline-none hover:bg-blue-700 focus:bg-blue-700">
                        {{ t('validate') }}
                      </button>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
          <div class="flex flex-row justify-center w-full mt-5">
            <router-link to="/login" class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline">
              {{ t('back-to-login-page') }}
            </router-link>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
