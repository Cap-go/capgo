<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  kListItem,
} from 'konsta/vue'
import { toast } from 'vue-sonner'
import IconTrash from '~icons/heroicons/trash'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import { appIdToUrl } from '~/services/conversion'

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

async function didCancel(name: string) {
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

async function deleteApp(app: Database['public']['Tables']['apps']['Row']) {
  // console.log('deleteApp', app)
  if (await didCancel(t('app')))
    return
  try {
    const { error: errorIcon } = await supabase.storage
      .from(`images/${app.user_id}`)
      .remove([app.app_id])
    if (errorIcon)
      toast.error(t('cannot-delete-app-icon'))

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
        toast.error(t('cannot-delete-app-version'))
        return
      }
    }

    const { error: dbAppError } = await supabase
      .from('apps')
      .delete()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)
    if (vError || dbAppError) {
      toast.error(t('cannot-delete-app'))
    }
    else {
      toast.success(t('app-deleted'))
      await emit('reload')
    }
  }
  catch (error) {
    toast.error(t('cannot-delete-app'))
  }
}

async function loadData() {
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

async function refreshData() {
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

function openPackage(appId: string) {
  router.push(`/app/package/${appIdToUrl(appId)}`)
}

const acronym = computed(() => {
  const words = props.app.name?.split(' ') || []
  let res = props.app.name?.slice(0, 2) || 'AP'
  if (words?.length > 2)
    res = words[0][0] + words[1][0]
  else if (words?.length > 1)
    res = words[0][0] + words[1][0]
  return res.toUpperCase()
})

watchEffect(async () => {
  if (route.path.endsWith('/app/home'))
    await refreshData()
})
</script>

<template>
  <!-- Row -->
  <tr class="hidden text-gray-500 cursor-pointer md:table-row dark:text-gray-400" @click="openPackage(app.app_id)">
    <td class="w-1/4 p-2">
      <div class="flex flex-wrap items-center text-slate-800 dark:text-white">
        <img v-if="app.icon_url" :src="app.icon_url" :alt="`App icon ${app.name}`" class="mr-2 rounded shrink-0 sm:mr-3" width="36" height="36">
        <div v-else class="flex items-center justify-center w-8 h-8 border border-black rounded-lg dark:border-white sm:mr-3">
          <p>{{ acronym }}</p>
        </div>
        <div class="max-w-max">
          {{ props.app.name }}
        </div>
      </div>
    </td>
    <td class="w-1/4 p-2">
      <div class="text-center">
        {{ props.app.last_version }}
      </div>
    </td>
    <td class="w-1/4 p-2">
      <div class="text-center">
        {{ formatDate(props.app.updated_at || "") }}
      </div>
    </td>
    <td class="w-1/4 p-2">
      <div v-if="!isLoading && !props.channel" class="text-center">
        {{ devicesNb }}
      </div>
      <div v-else class="text-center">
        {{ props.channel }}
      </div>
    </td>
    <td class="w-1/4 p-2" @click.stop="deleteApp(app)">
      <div class="text-center">
        <IconTrash v-if="!channel" class="mr-4 text-lg text-red-600" />
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
