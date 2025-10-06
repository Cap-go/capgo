<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const main = useMainStore()
const supabase = useSupabase()
const isLoading = ref(false)
const enableNotifications = ref(main.user?.enable_notifications ?? true)
const optForNewsletters = ref(main.user?.opt_for_newsletters ?? true)
const displayStore = useDisplayStore()
displayStore.NavTitle = t('notifications')

async function submitNotif() {
  if (!main.user?.id)
    return

  isLoading.value = true
  enableNotifications.value = !enableNotifications.value
  const { data, error } = await supabase
    .from('users')
    .update({
      enable_notifications: enableNotifications.value,
    })
    .eq('id', main.user.id)
    .select()
    .single()
  if (!error && data)
    main.user = data
  isLoading.value = false
}
async function submitDoi() {
  if (!main.user?.id)
    return

  isLoading.value = true

  optForNewsletters.value = !optForNewsletters.value
  const { data, error } = await supabase
    .from('users')
    .update({
      opt_for_newsletters: optForNewsletters.value,
    })
    .eq('id', main.user.id)
    .select()
    .single()
  if (!error && data)
    main.user = data
  isLoading.value = false
}
</script>

<template>
  <div>
    <div class="grow">
      <!-- Panel body -->
      <div class="p-6 space-y-6">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white">
          {{ t('my-notifications') }}
        </h2>

        <div class="w-full mx-auto dark:text-white">
          <dl class="divide-y dark:divide-slate-500 divide-slate-200">
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
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
      </route>
