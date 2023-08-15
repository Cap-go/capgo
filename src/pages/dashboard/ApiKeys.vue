<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
async function getKeys(retry = true): Promise<void> {
  isLoading.value = true
  const { data } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', main.user?.id)
  if (data && data.length)
    apps.value = data

  else if (retry && main.user?.id)
    return getKeys(false)

  isLoading.value = false
}
displayStore.NavTitle = ''
getKeys()
</script>

<template>
  <div class="w-full h-full px-4 py-8 mx-auto max-w-9xl lg:px-8 sm:px-6">
    <!-- Page header -->
    <div class="mb-8">
      <!-- Title -->
      <h1 class="text-2xl font-bold text-slate-800 md:text-3xl dark:text-white">
        {{ t('api-keys') }}
      </h1>
    </div>
    <div class="flex flex-col">
      <div class="flex flex-col overflow-y-scroll bg-white shadow-lg border-slate-200 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
        <dl class="divide-y divide-gray-500">
          <InfoRow v-for="app in apps" :key="app.id" :label="app.mode.toUpperCase()" :value="app.key" :is-link="true" />
        </dl>
      </div>
    </div>
  </div>
</template>
