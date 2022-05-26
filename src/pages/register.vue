<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonInput,
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
  first_name: { required, minLength: minLength(3) },
  last_name: { required, minLength: minLength(3) },
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
  console.log('submit')
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect) {
    isLoading.value = false
    return
  }
  const { error } = await supabase.auth.signUp(
    {
      email: form.email,
      password: form.password,
    },
    {
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
      redirectTo: `${import.meta.env.VITE_APP_URL}/onboarding/verify_email`,
    },
    // supabase auth config
    // http://localhost:3334/onboarding/verify_email,http://localhost:3334/forgot_password?step=2,https://capgo.app/onboarding/verify_email,https://capgo.app/forgot_password?step=2,https://capgo.app/onboarding/first_password,https://development.capgo.app/onboarding/verify_email,https://development.capgo.app/forgot_password?step=2
  )
  isLoading.value = false
  if (error) {
    errorMessage.value = error.message
    return
  }

  router.push('/onboarding/confirm_email')
}
</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="grid lg:w-1/2 mx-auto w-full h-full min-h-screen p-8">
        <div class="w-full">
          <h1 class="text-3xl font-bold text-left">
            {{ t("register.heading") }}
          </h1>
          <p class="mt-1 text-pumpkin-orange-500 text-left font-bold text-sm">
            {{ t("register.desc") }}
          </p>
        </div>
        <form class="mt-2 relative" @submit.prevent="submit">
          <p v-if="errorMessage" class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
            {{ errorMessage }}
          </p>
          <div class="mx-auto max-w-lg grid item-cente">
            <div class="py-1">
              <IonInput
                v-model="form.first_name"
                autofocus
                required
                class="z-0 text-left border-b-2 ion-padding-start"
                :placeholder="t('register.first-name')"
                type="text"
              />

              <div v-for="(error, index) of v$.first_name.$errors" :key="index">
                <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                  {{ t("register.first-name") }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="py-1">
              <IonInput
                v-model="form.last_name"
                required
                class="z-0 text-left border-b-2 ion-padding-start"
                :placeholder="t('register.last-name')"
                type="text"
              />
              <div v-for="(error, index) of v$.last_name.$errors" :key="index">
                <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                  {{ t("register.last-name") }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="py-1">
              <IonInput
                v-model="form.email"
                required
                inputmode="email"
                class="text-left border-b-2 z-0 ion-padding-start"
                :placeholder="t('register.email')"
                type="email"
              />
              <div v-for="(error, index) of v$.email.$errors" :key="index">
                <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                  {{ t("register.email") }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="py-1">
              <IonInput
                v-model="form.password"
                required
                class="text-left border-b-2 z-0 ion-padding-start"
                :placeholder="t('register.password')"
                type="password"
              />
              <div v-for="(error, index) of v$.password.$errors" :key="index">
                <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                  {{ t("register.password") }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="py-1">
              <IonInput
                v-model="form.repeatPassword"
                required
                class="text-left border-b-2 z-0 ion-padding-start"
                :placeholder="t('register.confirm-password')"
                type="password"
              />
              <div v-for="(error, index) of v$.repeatPassword.$errors" :key="index">
                <p class="text-xs italic mt-2 mb-4">
                  {{ t("register.confirm-password") }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <p
              class="font-light text-azure-500 text-left text-sm font-semibold"
            >
              {{ t("register.password-hint") }}
            </p>
            <IonButton
              color="secondary"
              shape="round"
              :disabled="isLoading"
              type="submit"
              class="ion-margin-top w-45 mx-auto font-semibold"
            >
              <span v-if="!isLoading" class="rounded-4xl">
                {{ t("register.next") }}
              </span>
              <IonSpinner v-else name="crescent" color="light" />
            </IonButton>
            <a
              class="block text-center text-sm text-muted-blue-500 underline mt-4"
              href="/login"
            >
              {{ t("register.already-account") }}
            </a>
          </div>
        </form>
      </div>
    </IonContent>
  </IonPage>
</template>
