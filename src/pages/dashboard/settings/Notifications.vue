<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { ref } from 'vue'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const main = useMainStore()
const supabase = useSupabase()
const isLoading = ref(false)
const enableNotifications = ref(false)
const optForNewsletters = ref(false)

enableNotifications.value = main.auth?.user_metadata?.activation?.enableNotifications || false
optForNewsletters.value = main.auth?.user_metadata?.activation?.optForNewsletters || false

console.log('enableNotifications', enableNotifications.value)
console.log('optForNewsletters', optForNewsletters.value)

async function submitNotif() {
  isLoading.value = true
  console.log('submitNotif')
  enableNotifications.value = !enableNotifications.value
  console.log('enableNotifications', enableNotifications.value)
  console.log('optForNewsletters', optForNewsletters.value)
  const activation = main.auth?.user_metadata?.activation || {}
  const { data, error } = await supabase.auth.updateUser({
    data: {
      activation: {
        ...activation,
        enableNotifications: enableNotifications.value,
      },
    },
  })
  if (!error && data)
    main.auth = data.user
  isLoading.value = false
}
async function submitDoi() {
  isLoading.value = true
  console.log('submitDoi')

  optForNewsletters.value = !optForNewsletters.value
  console.log('enableNotifications', enableNotifications.value)
  console.log('optForNewsletters', optForNewsletters.value)
  const activation = main.auth?.user_metadata?.activation || {}
  const { data, error } = await supabase.auth.updateUser({
    data: {
      activation: {
        ...activation,
        optForNewsletters: optForNewsletters.value,
      },
    },
  })
  if (!error && data)
    main.auth = data.user
  console.log('main.auth', data)
  isLoading.value = false
}
</script>

<template>
  <div class="grow">
    <!-- Panel body -->
    <div class="p-6 space-y-6">
      <h2 class="text-2xl font-bold text-slate-800 dark:text-white">
        {{ t('my-notifications') }}
      </h2>

      <div class="w-full mx-auto dark:text-white">
        <dl class="divide-y dark:divide-slate-200 dark:divide-slate-500">
          <InfoRow :label="t('activation-notification')" :editable="false" :value="t('activation-notification-desc')">
            <Toggle
              :value="enableNotifications"
              @change="submitNotif()"
            />
          </InfoRow>
          <InfoRow :label="t('activation-doi')" :editable="false" :value="t('activation-doi-desc')">
            <Toggle
              :value="optForNewsletters"
              @change="submitDoi()"
            />
          </InfoRow>
        </dl>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
      </route>
