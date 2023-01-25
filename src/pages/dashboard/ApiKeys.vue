<script setup lang="ts">
import { ref } from 'vue'
import copy from 'copy-text-to-clipboard'
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
const copyKey = async (app: Database['public']['Tables']['apikeys']['Row']) => {
  copy(app.key)
  console.log('displayStore.messageToast', displayStore.messageToast)
  displayStore.messageToast.push(t('apikeys.keyCopied'))
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
geKeys()
</script>

<template>
  <div class="w-full px-4 py-8 mx-auto sm:px-6 lg:px-8 max-w-9xl">
    <!-- Page header -->
    <div class="mb-8">
      <!-- Title -->
      <h1 class="text-2xl font-bold md:text-3xl text-slate-800 dark:text-white">
        {{ t('api-keys') }} 🔑
      </h1>
    </div>

    <!-- Content -->
    <div class="mb-8 bg-white rounded-sm shadow-lg dark:bg-gray-800 dark:text-white">
      <div class="flex flex-col md:flex-row md:-mr-px">
        <div class="grow">
          <!-- Panel body -->
          <div class="p-6 space-y-6">
            <!-- API Keys -->
            <section>
              <div v-for="app in apps" :key="app.id" class="mb-2 space-y-2 cursor-pointer" @click="copyKey(app)">
                <div>
                  <label class="block mb-1 text-lg font-medium" for="location">{{ app.mode.toUpperCase() }} :</label>
                  <p class="font-bold">
                    {{ app.key }}
                  </p>
                </div>
                <hr class="border-muted-blue-600 dark:border-white">
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
