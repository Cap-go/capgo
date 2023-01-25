<script setup lang="ts">
import { kToggle } from 'konsta/vue'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TitleHead from '~/components/TitleHead.vue'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const supabase = useSupabase()
const main = useMainStore()
const isLoading = ref(false)
const form = reactive({
  enableNotifications: false,
  optForNewsletters: false,
})

form.enableNotifications = !!main.auth?.user_metadata?.activation?.enableNotifications
form.optForNewsletters = !!main.auth?.user_metadata?.activation?.optForNewsletters

const submitNotif = async () => {
  isLoading.value = true
  const activation = main.auth?.user_metadata?.activation || {}
  const { data, error } = await supabase.auth.updateUser({
    data: {
      activation: {
        ...activation,
        enableNotifications: form.enableNotifications,
      },
    },
  })
  if (!error && data.user)
    main.auth = data.user
  isLoading.value = false
}
const submitDoi = async () => {
  isLoading.value = true
  const activation = main.auth?.user_metadata?.activation || {}
  const { data, error } = await supabase.auth.updateUser({
    data: {
      activation: {
        ...activation,
        optForNewsletters: form.optForNewsletters,
      },
    },
  })
  if (!error && data.user)
    main.auth = data.user
  isLoading.value = false
}
</script>

<template>
  <TitleHead :title="t('notificationSettings.heading')" />
  <div class="w-full mx-auto lg:w-1/2">
    <div class="px-6 py-16">
      <div class="flex items-center justify-between my-2">
        <label for="notification" class="text-xl justify-self-start">{{ t('activation.notification') }}</label>
        <k-toggle
          component="div"
          class="k-color-success"
          :checked="form.enableNotifications"
          @change="submitNotif()"
        />
      </div>
      <p class="col-span-2 text-left">
        {{ t('activation.notification-desc') }}
      </p>
      <div class="flex items-center justify-between mt-4 mb-2">
        <label for="notification" class="w-64 text-xl justify-self-start">{{ t('activation.doi') }}</label>
        <k-toggle
          component="div"
          class="k-color-success"
          :checked="form.optForNewsletters"
          @change="submitDoi()"
        />
      </div>
      <p class="col-span-2 text-left">
        {{ t('activation.doi-desc') }}
      </p>
    </div>
  </div>
</template>
