<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useI18n } from 'petite-vue-i18n'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const supabase = useSupabase()
const form = reactive({
  enableNotifications: false,
  legal: false,
  optForNewsletters: false,
})

const isLoading = ref(false)
const errorMessage = ref('')

const router = useRouter()
const displayStore = useDisplayStore()

const { t } = useI18n()
displayStore.defaultBack = '/login'
displayStore.NavTitle = t('activation-heading')

async function submit() {
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
  if (error) {
    errorMessage.value = error.message
  }
  else {
    router.push('/app')
    window.location.href = '/app'
  }
}
</script>

<template>
  <div>
    <Navbar />
    <section class="flex w-full h-full py-10 my-auto overflow-y-auto lg:py-16 sm:py-8">
      <div class="px-4 mx-auto my-auto max-w-7xl lg:px-8 sm:px-6">
        <div class="max-w-2xl mx-auto text-center">
          <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded-sm invert dark:invert-0">
          <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
            {{ t('terms-of-use') }}
          </h1>
          <p class="max-w-xl mx-auto mt-4 text-base leading-relaxed text-gray-600 dark:text-gray-300">
            {{ t('please-choose-your-p') }}
          </p>
        </div>

        <div class="relative max-w-md mx-auto mt-2 md:mt-8">
          <div class="overflow-hidden bg-white rounded-md shadow-md">
            <div class="px-4 py-6 sm:px-8 sm:py-7">
              <form @submit.prevent="submit">
                <div class="w-full mx-auto">
                  <div class="flex items-center justify-between mb-2">
                    <label for="notification" class="text-lg font-medium justify-self-start">{{ t('activation-notification') }}</label>
                    <Toggle
                      :disabled="isLoading"
                      :value="form.enableNotifications"
                      @change="form.enableNotifications = !form.enableNotifications"
                    />
                  </div>
                  <p class="col-span-2 text-sm text-left text-grey">
                    {{ t('activation-notification-desc') }}
                  </p>
                  <div class="flex items-center justify-between mt-6 mb-2">
                    <label for="legal" class="text-lg font-medium justify-self-start">{{ t('activation-legal') }}</label>
                    <Toggle
                      :disabled="isLoading"
                      :value="form.legal"
                      @change="form.legal = !form.legal"
                    />
                  </div>
                  <p class="col-span-2 text-sm text-left text-grey">
                    {{ t('activation-legal-desc') }}
                  </p>
                  <div class="flex items-center justify-between mt-6 mb-2">
                    <label for="doi" class="text-lg font-medium justify-self-start">{{ t('activation-doi') }}</label>
                    <Toggle
                      :disabled="isLoading"
                      :value="form.optForNewsletters"
                      @change="form.optForNewsletters = !form.optForNewsletters"
                    />
                  </div>
                  <p class="col-span-2 text-sm text-left text-grey">
                    {{ t('activation-doi-desc') }}
                  </p>
                </div>
                <button :disabled="isLoading || !form.legal" type="submit" class="inline-flex items-center justify-center w-full px-4 py-4 mt-10 text-base font-semibold text-white transition-all duration-200 border border-transparent rounded-md bg-muted-blue-700 disabled:bg-muted-blue-50 focus:bg-blue-700 hover:bg-blue-700 focus:outline-hidden">
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
  </div>
</template>
