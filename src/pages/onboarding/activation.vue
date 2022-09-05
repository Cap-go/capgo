<script setup lang="ts">
import { IonContent, IonPage, IonSpinner, IonToggle, isPlatform } from '@ionic/vue'
import { PushNotifications } from '@capacitor/push-notifications'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'

const supabase = useSupabase()
const form = reactive({
  enableNotifications: false,
  legal: false,
  optForNewsletters: false,
})

const isLoading = ref(false)
const errorMessage = ref('')

const router = useRouter()

const { t } = useI18n()

const submit = async () => {
  isLoading.value = true
  if (isPlatform('capacitor') && form.enableNotifications)
    await PushNotifications.requestPermissions()

  const { error } = await supabase.auth.update({
    data: {
      activation: {
        formFilled: true,
        enableNotifications: form.enableNotifications,
        legal: form.legal,
        optForNewsletters: form.optForNewsletters,
      },
    },
  })
  isLoading.value = false
  if (error)
    errorMessage.value = error.message
  else
    router.push('/app/home')
}
</script>

<template>
  <IonPage>
    <TitleHead :big="true" :title="t('activation.heading')" />
    <IonContent :fullscreen="true">
      <section class="w-full h-full flex my-auto py-10 sm:py-8 lg:py-16">
        <div class="px-4 mx-auto my-auto max-w-7xl sm:px-6 lg:px-8">
          <div class="max-w-2xl mx-auto text-center">
            <img src="/capgo.png" alt="logo" class="mx-auto rounded w-1/6 mb-6">
            <h1 class="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl">
              Terms of Use
            </h1>
            <p class="max-w-xl mx-auto mt-4 text-base leading-relaxed text-gray-600">
              Please choose your preferences
            </p>
          </div>

          <div class="relative max-w-md mx-auto mt-2 md:mt-8">
            <div class="overflow-hidden bg-white rounded-md shadow-md">
              <div class="px-4 py-6 sm:px-8 sm:py-7">
                <form @submit.prevent="submit">
                  <div class="w-full mx-auto">
                    <div class="flex justify-between items-center mb-2">
                      <label for="notification" class="justify-self-start text-lg font-medium">{{ t('activation.notification') }}</label>
                      <IonToggle v-model="form.enableNotifications" :disabled="isLoading" color="success" />
                    </div>
                    <p class="col-span-2 text-left text-grey text-sm">
                      {{ t('activation.notification-desc') }}
                    </p>
                    <div class="flex justify-between items-center mb-2 mt-6">
                      <label for="legal" class="justify-self-start text-lg font-medium">{{ t('activation.legal') }}</label>
                      <IonToggle v-model="form.legal" :disabled="isLoading" color="success" />
                    </div>
                    <p class="col-span-2 text-left text-grey text-sm">
                      {{ t('activation.legal-desc') }}
                    </p>
                    <div class="flex justify-between items-center mb-2 mt-6">
                      <label for="doi" class="justify-self-start text-lg font-medium">{{ t('activation.doi') }}</label>
                      <IonToggle v-model="form.optForNewsletters" :disabled="isLoading" color="success" />
                    </div>
                    <p class="col-span-2 text-left text-grey text-sm">
                      {{ t('activation.doi-desc') }}
                    </p>
                  </div>
                  <button :disabled="isLoading || !form.legal" type="submit" class="mt-10 inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 bg-muted-blue-700 border border-transparent rounded-md focus:outline-none hover:bg-blue-700 focus:bg-blue-700 disabled:bg-muted-blue-50">
                    <span v-if="!isLoading">
                      {{ t('activation.validate') }}
                    </span>
                    <IonSpinner v-else name="crescent" color="light" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </IonContent>
  </IonPage>
</template>
