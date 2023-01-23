<script setup lang="ts">
import {
  IonContent,
  IonPage,
  IonSpinner,
} from '@ionic/vue'
import { useVuelidate } from '@vuelidate/core'
import { email, helpers, minLength, required, sameAs } from '@vuelidate/validators'
import { useRouter } from 'vue-router'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'

const router = useRouter()
const supabase = useSupabase()
const { t } = useI18n()
const form = reactive({
  first_name: '',
  last_name: '',
  countryCode: '+33',
  phone: '',
  email: '',
  repeatPassword: '',
  password: '',
  parent: 'dad',
})

const isLoading = ref(false)
const errorMessage = ref('')

const containsUppercase = helpers.regex(/[A-Z]/)
const containsLowercase = helpers.regex(/[a-z]/)
const containsSpecial = helpers.regex(/[#?!@$%^&*-]/)

const rules = computed(() => ({
  first_name: { required, minLength: minLength(2) },
  last_name: { required, minLength: minLength(2) },
  email: { required, email },
  password: {
    required,
    minLength: minLength(6),
    containsUppercase: helpers.withMessage(t('register.upperCaseError'), containsUppercase),
    containsLowercase: helpers.withMessage(t('register.lowerCaseError'), containsLowercase),
    containsSpecial: helpers.withMessage(t('register.specialError'), containsSpecial),
  },
  repeatPassword: {
    required,
    minLength: minLength(6),
    sameAsPassword: sameAs(form.password),
  },
}))

const v$ = useVuelidate(rules, form)

const submit = async () => {
  // console.log('submit')
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect) {
    isLoading.value = false
    return
  }
  const { data: user, error } = await supabase.auth.signUp(
    {
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          activation: {
            formFilled: true,
            enableNotifications: false,
            legal: false,
            optForNewsletters: false,
          },
        },
        emailRedirectTo: `${import.meta.env.VITE_APP_URL}/onboarding/verify_email`,
      },
    },
    // supabase auth config
    // http://localhost:3334/onboarding/verify_email,http://localhost:3334/forgot_password?step=2,https://capgo.app/onboarding/verify_email,https://capgo.app/forgot_password?step=2,https://capgo.app/onboarding/first_password,https://development.capgo.app/onboarding/verify_email,https://development.capgo.app/forgot_password?step=2
  )
  isLoading.value = false
  if (error || !user) {
    errorMessage.value = error?.message || 'user not found'
    return
  }
  router.push('/onboarding/confirm_email')
}
</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <section class="flex w-full min-h-screen py-10 my-auto sm:py-8 lg:py-8">
        <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div class="max-w-2xl mx-auto text-center">
            <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded">

            <h1 class="text-3xl font-bold leading-tight text-black dark:text-white sm:text-4xl lg:text-5xl">
              {{ t("register.heading") }}
            </h1>
          </div>

          <div class="relative max-w-2xl mx-auto mt-4 md:mt-8">
            <div class="overflow-hidden bg-white rounded-md shadow-md">
              <div class="px-4 py-6 sm:px-8 sm:py-7">
                <form @submit.prevent="submit">
                  <p v-if="errorMessage" class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                    {{ errorMessage }}
                  </p>
                  <div class="space-y-2 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
                    <div>
                      <label for="" class="text-base font-medium text-gray-900"> First name </label>
                      <div class="mt-2.5 relative text-gray-400 focus-within:text-gray-600">
                        <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>

                        <input
                          v-model="form.first_name"
                          required
                          type="text"
                          :placeholder="t('register.first-name')"
                          class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                        >
                      </div>
                      <div v-for="(error, index) of v$.first_name.$errors" :key="index">
                        <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                          {{ t("register.first-name") }}: {{ error.$message }}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label for="" class="text-base font-medium text-gray-900"> Last name </label>
                      <div class="mt-2.5 relative text-gray-400 focus-within:text-gray-600">
                        <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>

                        <input
                          v-model="form.last_name"
                          required
                          type="text"
                          :placeholder="t('register.last-name')"
                          class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                        >
                      </div>
                      <div v-for="(error, index) of v$.last_name.$errors" :key="index">
                        <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                          {{ t("register.last-name") }}: {{ error.$message }}
                        </p>
                      </div>
                    </div>

                    <div class="col-span-2 ">
                      <label for="" class="text-base font-medium text-gray-900"> Email address </label>
                      <div class="mt-2.5 relative text-gray-400 focus-within:text-gray-600">
                        <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                          </svg>
                        </div>

                        <input
                          v-model="form.email"
                          required
                          inputmode="email"
                          :placeholder="t('register.email')"
                          type="email"
                          class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                        >
                      </div>
                      <div v-for="(error, index) of v$.email.$errors" :key="index">
                        <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                          {{ t("register.email") }}: {{ error.$message }}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label for="" class="text-base font-medium text-gray-900"> Password </label>
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
                          v-model="form.password"
                          required
                          :placeholder="t('register.password')"
                          type="password"
                          class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                        >
                      </div>
                      <div v-for="(error, index) of v$.password.$errors" :key="index">
                        <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                          {{ t("register.password") }}: {{ error.$message }}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label for="" class="text-base font-medium text-gray-900"> Confirm password </label>
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
                          v-model="form.repeatPassword"
                          required
                          :placeholder="t('register.confirm-password')"
                          type="password"
                          class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                        >
                      </div>
                      <div v-for="(error, index) of v$.repeatPassword.$errors" :key="index">
                        <p class="mt-2 mb-4 text-xs italic">
                          {{ t("register.confirm-password") }}: {{ error.$message }}
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center col-span-2">
                      <span class="text-sm font-medium text-gray-500">
                        {{ t("register.password-hint") }}
                      </span>
                    </div>

                    <div class="w-1/2 col-span-2 mx-auto">
                      <button
                        :disabled="isLoading" type="submit" class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 border border-transparent rounded-md bg-muted-blue-600 focus:outline-none hover:bg-blue-700 focus:bg-blue-700"
                      >
                        <span v-if="!isLoading" class="rounded-4xl">
                          {{ t("register.next") }}
                        </span>
                        <IonSpinner v-else name="crescent" color="light" />
                      </button>
                    </div>

                    <div class="col-span-2 text-center">
                      <p class="text-base text-gray-600">
                        <a href="/login" title="" class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline">{{ t("register.already-account") }}</a>
                      </p>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </IonContent>
  </IonPage>
</template>
