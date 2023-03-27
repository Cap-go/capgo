<script setup lang="ts">
import { PushNotifications } from '@capacitor/push-notifications'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
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
  if (isLoading.value)
    return
  isLoading.value = true
  if (Capacitor.isNativePlatform() && form.enableNotifications)
    await PushNotifications.requestPermissions()

  const { error } = await supabase.auth.updateUser({
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
  <TitleHead :big="true" :title="t('activation-heading')" />
  <section class="my-auto h-full w-full flex overflow-y-scroll py-10 lg:py-16 sm:py-8">
    <div class="mx-auto my-auto max-w-7xl px-4 lg:px-8 sm:px-6">
      <div class="mx-auto max-w-2xl text-center">
        <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded">
        <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
          {{ t('terms-of-use') }}
        </h1>
        <p class="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-300">
          {{ t('please-choose-your-p') }}
        </p>
      </div>

      <div class="relative mx-auto mt-2 max-w-md md:mt-8">
        <div class="overflow-hidden rounded-md bg-white shadow-md">
          <div class="px-4 py-6 sm:px-8 sm:py-7">
            <form @submit.prevent="submit">
              <div class="mx-auto w-full">
                <div class="mb-2 flex items-center justify-between">
                  <label for="notification" class="justify-self-start text-lg font-medium">{{ t('activation-notification') }}</label>
                  <Toggle
                    :disabled="isLoading"
                    :value="form.enableNotifications"
                    @change="form.enableNotifications = !form.enableNotifications"
                  />
                </div>
                <p class="col-span-2 text-left text-sm text-grey">
                  {{ t('activation-notification-desc') }}
                </p>
                <div class="mb-2 mt-6 flex items-center justify-between">
                  <label for="legal" class="justify-self-start text-lg font-medium">{{ t('activation-legal') }}</label>
                  <Toggle
                    :disabled="isLoading"
                    :value="form.legal"
                    @change="form.legal = !form.legal"
                  />
                </div>
                <p class="col-span-2 text-left text-sm text-grey">
                  {{ t('activation-legal-desc') }}
                </p>
                <div class="mb-2 mt-6 flex items-center justify-between">
                  <label for="doi" class="justify-self-start text-lg font-medium">{{ t('activation-doi') }}</label>
                  <Toggle
                    :disabled="isLoading"
                    :value="form.optForNewsletters"
                    @change="form.optForNewsletters = !form.optForNewsletters"
                  />
                </div>
                <p class="col-span-2 text-left text-sm text-grey">
                  {{ t('activation-doi-desc') }}
                </p>
              </div>
              <button :disabled="isLoading || !form.legal" type="submit" class="mt-10 w-full inline-flex items-center justify-center border border-transparent rounded-md bg-muted-blue-700 px-4 py-4 text-base font-semibold text-white transition-all duration-200 disabled:bg-muted-blue-50 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none">
                <span v-if="!isLoading">
                  {{ t('activation-validate') }}
                </span>
                <Spinner v-else size="w-8 h-8" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
