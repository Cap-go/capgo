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
      <section class="flex w-full h-full py-10 my-auto sm:py-8 lg:py-16">
        <div class="px-4 mx-auto my-auto max-w-7xl sm:px-6 lg:px-8">
          <div class="max-w-2xl mx-auto text-center">
            <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded">
            <h1 class="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl">
              {{ t('terms-of-use') }}
            </h1>
            <p class="max-w-xl mx-auto mt-4 text-base leading-relaxed text-gray-600">
              {{ t('please-choose-your-p') }}
            </p>
          </div>

          <div class="relative max-w-md mx-auto mt-2 md:mt-8">
            <div class="overflow-hidden bg-white rounded-md shadow-md">
              <div class="px-4 py-6 sm:px-8 sm:py-7">
                <form @submit.prevent="submit">
                  <div class="w-full mx-auto">
                    <div class="flex items-center justify-between mb-2">
                      <label for="notification" class="text-lg font-medium justify-self-start">{{ t('activation.notification') }}</label>
                      <IonToggle v-model="form.enableNotifications" :disabled="isLoading" color="success" />
                    </div>
                    <p class="col-span-2 text-sm text-left text-grey">
                      {{ t('activation.notification-desc') }}
                    </p>
                    <div class="flex items-center justify-between mt-6 mb-2">
                      <label for="legal" class="text-lg font-medium justify-self-start">{{ t('activation.legal') }}</label>
                      <IonToggle v-model="form.legal" :disabled="isLoading" color="success" />
                    </div>
                    <p class="col-span-2 text-sm text-left text-grey">
                      {{ t('activation.legal-desc') }}
                    </p>
                    <div class="flex items-center justify-between mt-6 mb-2">
                      <label for="doi" class="text-lg font-medium justify-self-start">{{ t('activation.doi') }}</label>
                      <IonToggle v-model="form.optForNewsletters" :disabled="isLoading" color="success" />
                    </div>
                    <p class="col-span-2 text-sm text-left text-grey">
                      {{ t('activation.doi-desc') }}
                    </p>
                  </div>
                  <button :disabled="isLoading || !form.legal" type="submit" class="inline-flex items-center justify-center w-full px-4 py-4 mt-10 text-base font-semibold text-white transition-all duration-200 border border-transparent rounded-md bg-muted-blue-700 focus:outline-none hover:bg-blue-700 focus:bg-blue-700 disabled:bg-muted-blue-50">
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
