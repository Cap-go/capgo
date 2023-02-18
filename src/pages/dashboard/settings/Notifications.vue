<script setup lang="ts">
import { kListItem, kToggle } from 'konsta/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const submitNotif = async () => {
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
const submitDoi = async () => {
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
      <h2 class="text-2xl font-bold text-slate-800 dark:text-white ">
        {{ t('my-notifications') }}
      </h2>

      <div class="w-full mx-auto dark:text-white">
        <div class="px-6 py-4 list-none">
          <k-list-item label :title="t('activation-notification')" :subtitle="t('activation-notification-desc')">
            <template #after>
              <k-toggle
                component="div"
                class="k-color-success"
                :checked="enableNotifications"
                @change="submitNotif()"
              />
            </template>
          </k-list-item>
          <k-list-item label :title="t('activation-doi')" :subtitle="t('activation-doi-desc')">
            <template #after>
              <k-toggle
                component="div"
                class="k-color-success"
                :checked="optForNewsletters"
                @change="submitDoi()"
              />
            </template>
          </k-list-item>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
      </route>
