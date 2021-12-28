<script setup lang="ts">
import { IonButton, IonContent, IonPage, IonSpinner, IonToggle, isPlatform } from '@ionic/vue'
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

const submit = async() => {
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
    <IonContent :fullscreen="true">
      <form class="grid mx-auto w-full lg:w-1/2 p-8" @submit.prevent="submit">
        <TitleHead :big="true" :title="t('activation.heading')" />
        <p class="mt-12 mb-6 text-sweet-pink-500 text-left text-lg font-medium leading-snug">
          {{ t('activation.desc') }}
        </p>
        <div class="w-full mt-6 mb-8 mx-auto">
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
        <IonButton :disabled="isLoading || !form.legal" type="submit" color="secondary" shape="round" class="w-1/2 mx-auto text-white text-center uppercase">
          <span v-if="!isLoading">
            {{ t('activation.validate') }}
          </span>
          <IonSpinner v-else name="crescent" color="light" />
        </IonButton>
      </form>
    </IonContent>
  </IonPage>
</template>
