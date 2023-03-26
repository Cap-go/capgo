<script setup lang="ts">
import { ref } from 'vue'
import copy from 'copy-text-to-clipboard'
import { useI18n } from 'vue-i18n'
import { toast } from 'sonner'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const displayStore = useDisplayStore()
const main = useMainStore()
const isLoading = ref(false)
const supabase = useSupabase()
const apps = ref<Database['public']['Tables']['apikeys']['Row'][]>()
const copyKey = async (app: Database['public']['Tables']['apikeys']['Row']) => {
  copy(app.key)
  console.log('displayStore.messageToast', displayStore.messageToast)
  toast.success(t('key-copied'))
}
const geKeys = async (retry = true): Promise<void> => {
  isLoading.value = true
  const { data } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', main.user?.id)
  if (data && data.length)
    apps.value = data

  else if (retry && main.user?.id)
    return geKeys(false)

  isLoading.value = false
}
displayStore.NavTitle = ''
geKeys()
</script>

<template>
  <div class="w-full h-full px-4 py-8 mx-auto sm:px-6 lg:px-8 max-w-9xl">
    <!-- Page header -->
    <div class="mb-8">
      <!-- Title -->
      <h1 class="text-2xl font-bold md:text-3xl text-slate-800 dark:text-white">
        {{ t('api-keys') }}
      </h1>
    </div>
    <div class="flex flex-col">
      <div class="flex flex-col overflow-y-scroll shadow-lg md:mx-auto md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <dl class="divide-y divide-gray-500">
          <InfoRow v-for="app in apps" :key="app.id" :label="app.mode.toUpperCase()" :value="app.key" :is-link="true" @click="copyKey(app)" />
        </dl>
      </div>
    </div>
  </div>
</template>
