<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'
import Plus from '~icons/heroicons/plus'

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

async function addNewApiKey() {
  if (await showAddNewKeyModal())
    return

  const keyType = displayStore.lastButtonRole

  let databaseKeyType: 'read' | 'write' | 'all' | 'upload'

  switch (keyType) {
    case 'cancel':
    case '':
      return
    case 'read-button':
      databaseKeyType = 'read'
      break
    case 'upload-button':
      databaseKeyType = 'upload'
      break
    case 'all-button':
      databaseKeyType = 'all'
      break
    default:
      return
  }

  const newApiKey = crypto.randomUUID()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.log('Not logged in, cannot regenerate API key')
    return
  }

  const { data, error } = await supabase
    .from('apikeys')
    .upsert({ user_id: user.id, key: newApiKey, mode: databaseKeyType })
    .select()

  if (error)
    throw error

  apps.value?.push(data[0])
  toast.success(t('add-api-key'))
}

async function showAddNewKeyModal() {
  displayStore.dialogOption = {
    header: t('alert-add-new-key'),
    message: t('alert-generate-new-key'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('key-read'),
        id: 'read-button',
      },
      {
        text: t('key-upload'),
        id: 'upload-button',
      },
      {
        text: t('key-all'),
        id: 'all-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

function deleteApiKey(key: string) {
  apps.value = apps.value?.filter(filterKey => filterKey.key !== key)
}
</script>

<template>
  <div class="w-full h-full px-4 py-8 mx-auto max-w-9xl lg:px-8 sm:px-6">
    <!-- Page header -->
    <div class="mb-6 flex flex-row w-[66.666667%] ml-auto mr-auto">
      <!-- Title -->
      <h1 class="ml-2 text-2xl font-bold text-slate-800 md:text-3xl dark:text-white">
        {{ t('api-keys') }}
      </h1>
      <button class=" ml-auto mr-2" @click="addNewApiKey()">
        <Plus class=" text-green-500" />
      </button>
    </div>
    <div class="flex flex-col">
      <div class="flex flex-col overflow-y-scroll bg-white shadow-lg border-slate-200 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
        <dl class="divide-y divide-gray-500">
          <InfoRow v-for="app in apps" :key="app.id" :label="app.mode.toUpperCase()" :value="app.key" :is-link="true" @delete="deleteApiKey" />
        </dl>
      </div>
    </div>
  </div>
</template>
