<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  kListItem,
} from 'konsta/vue'
import IconTrash from '~icons/heroicons/trash'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'

const props = defineProps<{
  app: Database['public']['Tables']['apps']['Row']
  channel: string
}>()
const emit = defineEmits(['reload'])
const displayStore = useDisplayStore()
const route = useRoute()
const router = useRouter()
const supabase = useSupabase()

const isLoading = ref(true)
const devicesNb = ref(0)
const { t } = useI18n()

const didCancel = async (name: string) => {
  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message: `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

const deleteApp = async (app: Database['public']['Tables']['apps']['Row']) => {
  // console.log('deleteApp', app)
  if (await didCancel(t('app')))
    return
  try {
    const { error: errorIcon } = await supabase.storage
      .from(`images/${app.user_id}`)
      .remove([app.app_id])
    if (errorIcon)
      displayStore.messageToast.push(t('cannot-delete-app-icon'))

    const { data, error: vError } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)

    if (data && data.length) {
      const filesToRemove = (data as Database['public']['Tables']['app_versions']['Row'][]).map(x => `${app.user_id}/${app.app_id}/versions/${x.bucket_id}`)
      const { error: delError } = await supabase
        .storage
        .from('apps')
        .remove(filesToRemove)
      if (delError) {
        displayStore.messageToast.push(t('cannot-delete-app-version'))
        return
      }
    }

    const { error: dbAppError } = await supabase
      .from('apps')
      .delete()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)
    if (vError || dbAppError) {
      displayStore.messageToast.push(t('cannot-delete-app'))
    }
    else {
      displayStore.messageToast.push(t('app-deleted'))
      await emit('reload')
    }
  }
  catch (error) {
    displayStore.messageToast.push(t('cannot-delete-app'))
  }
}

const loadData = async () => {
  if (!props.channel) {
    try {
      const date_id = new Date().toISOString().slice(0, 7)
      const { data, error } = await supabase
        .from('app_stats')
        .select()
        .eq('app_id', props.app.app_id)
        .eq('date_id', date_id)
        .single()
      if (!data || error)
        return
      devicesNb.value = data?.devices
    }
    catch (error) {
      console.error(error)
    }
  }
}

const refreshData = async () => {
  isLoading.value = true
  try {
    devicesNb.value = 0
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

const openPackage = (appId: string) => {
  router.push(`/app/package/${appId.replace(/\./g, '--')}`)
}

watchEffect(async () => {
  if (route.path.endsWith('/app/home'))
    await refreshData()
})
</script>

<template>
  <!-- Row -->
  <tr class="hidden text-gray-500 cursor-pointer md:table-row dark:text-gray-400" @click="openPackage(app.app_id)">
    <td class="p-2">
      <div class="flex flex-wrap items-center text-slate-800 dark:text-white">
        <img :src="app.icon_url" :alt="`App icon ${app.name}`" class="mr-2 rounded shrink-0 sm:mr-3" width="36" height="36">
        <div class="max-w-max">
          {{ props.app.name }}
        </div>
      </div>
    </td>
    <td class="p-2">
      <div class="text-center">
        {{ props.app.last_version }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-center">
        {{ formatDate(props.app.updated_at || "") }}
      </div>
    </td>
    <td class="p-2">
      <div v-if="!isLoading && !props.channel" class="text-center">
        {{ devicesNb }}
      </div>
      <div v-else class="text-center">
        {{ props.channel }}
      </div>
    </td>
    <td v-if="!channel" class="p-2" @click.stop="deleteApp(app)">
      <div class="text-center">
        <IconTrash class="text-lg text-red-600" />
      </div>
    </td>
  </tr>
  <!-- Mobile -->
  <k-list-item
    class="md:hidden"
    :title="props.app.name || ''"
    :subtitle="formatDate(props.app.updated_at || '')"
    @click="openPackage(app.app_id)"
  >
    <template #media>
      <img :src="app.icon_url" :alt="`App icon ${app.name}`" class="mr-2 rounded shrink-0 sm:mr-3" width="36" height="36">
    </template>
    <template #after>
      <IconTrash class="text-lg text-red-600" @click.stop="deleteApp(app)" />
    </template>
  </k-list-item>
</template>
