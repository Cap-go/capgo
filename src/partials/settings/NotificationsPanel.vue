<script setup lang="ts">
import { IonToggle } from '@ionic/vue'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'

const { t } = useI18n()
const supabase = useSupabase()
const isLoading = ref(false)
const form = reactive({
  enableNotifications: false,
  optForNewsletters: false,
})

let user = supabase.auth.user()

form.enableNotifications = !!user?.user_metadata?.activation?.enableNotifications
form.optForNewsletters = !!user?.user_metadata?.activation?.optForNewsletters

const submitNotif = async () => {
  isLoading.value = true
  const activation = user?.user_metadata?.activation || {}
  const { data, error } = await supabase.auth.update({
    data: {
      activation: {
        ...activation,
        enableNotifications: form.enableNotifications,
      },
    },
  })
  if (!error && data)
    user = data
  isLoading.value = false
}
const submitDoi = async () => {
  isLoading.value = true
  const activation = user?.user_metadata?.activation || {}
  const { data, error } = await supabase.auth.update({
    data: {
      activation: {
        ...activation,
        optForNewsletters: form.optForNewsletters,
      },
    },
  })
  if (!error && data)
    user = data
  isLoading.value = false
}
</script>

<template>
  <div class="grow">
    <!-- Panel body -->
    <div class="p-6 space-y-6">
      <h2 class="text-2xl text-slate-800 font-bold ">
        My Notifications
      </h2>

      <div class="mx-auto w-full">
        <div class="py-4 px-6">
          <div class="flex justify-between items-center my-2">
            <label for="notification" class="justify-self-start text-xl">{{ t('activation.notification') }}</label>
            <IonToggle v-model="form.enableNotifications" color="success" @ion-change="submitNotif()" />
          </div>
          <p class="col-span-2 text-left">
            {{ t('activation.notification-desc') }}
          </p>
          <div class="flex justify-between items-center mb-2 mt-4">
            <label for="notification" class="justify-self-start text-xl w-64">{{ t('activation.doi') }}</label>
            <IonToggle v-model="form.optForNewsletters" color="success" @ion-change="submitDoi()" />
          </div>
          <p class="col-span-2 text-left">
            {{ t('activation.doi-desc') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
