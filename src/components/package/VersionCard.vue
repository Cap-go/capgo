<script setup lang="ts">
import { ref, watchEffect } from 'vue'
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
import { appIdToUrl, bytesToMbText } from '~/services/conversion'

const props = defineProps<{
  version: Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row']
}>()
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

async function loadData() {
  if (!props.version) {
    try {
      const date_id = new Date().toISOString().slice(0, 7)
      const { data, error } = await supabase
        .from('app_stats')
        .select()
        .eq('app_id', props.version)
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

function showSize() {
  if (props.version.size)
    return bytesToMbText(props.version.size)
  else if (props.version.external_url)
    return t('stored-externally')
  else
    return t('package.size-not-found')
}

async function deleteVersion(version: Database['public']['Tables']['app_versions']['Row']) {
  if (await didCancel(t('version')))
    return
  try {
    const { data: channelFound, error: errorChannel } = await supabase
      .from('channels')
      .select()
      .eq('app_id', version.app_id)
      .eq('version', version.id)
    if ((channelFound && channelFound.length) || errorChannel) {
      toast.error(`${t('version')} ${version.app_id}@${version.name} ${t('bundle-is-linked-channel')}`)
      return
    }
    const { data: deviceFound, error: errorDevice } = await supabase
      .from('devices_override')
      .select()
      .eq('app_id', version.app_id)
      .eq('version', version.id)
    if ((deviceFound && deviceFound.length) || errorDevice) {
      toast.error(`${t('version')} ${version.app_id}@${version.name} ${t('bundle-is-linked-device')}`)
      return
    }
    const { error: delError } = await supabase
      .storage
      .from('apps')
      .remove([`${version.user_id}/${version.app_id}/versions/${version.bucket_id}`])
    const { error: delAppError } = await supabase
      .from('app_versions')
      .update({ deleted: true })
      .eq('app_id', version.app_id)
      .eq('id', version.id)
    if (delAppError || delError) {
      toast.error(t('cannot-delete-bundle'))
    }
    else {
      toast.success(t('bundle-deleted'))
      await refreshData()
    }
  }
  catch (error) {
    toast.error(t('cannot-delete-bundle'))
  }
}

function openVersion(version: Database['public']['Tables']['app_versions']['Row']) {
  console.log('openVersion', version)
  router.push(`/app/p/${appIdToUrl(props.version.app_id)}/bundle/${version.id}`)
}

watchEffect(async () => {
  if (route.path.endsWith('/app/home'))
    await refreshData()
})
</script>

<template>
  <!-- Row -->
  <tr class="hidden cursor-pointer text-slate-800 md:table-row dark:text-white" @click="openVersion(props.version)">
    <td class="p-2">
      <div class="text-left">
        {{ props.version.name }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-left">
        {{ formatDate(props.version.created_at || "") }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-left">
        {{ showSize() }}
      </div>
    </td>
    <td class="" @click.stop="deleteVersion(props.version)">
      <div class="text-left">
        <IconTrash class="text-lg text-red-600" />
      </div>
    </td>
  </tr>
  <!-- Mobile -->
  <k-list-item
    class="md:hidden"
    :title="props.version.name"
    :subtitle="formatDate(props.version.created_at || '')"
    @click="openVersion(props.version)"
  >
    <template #after>
      <IconTrash class="text-lg text-red-600" @click.stop="deleteVersion(props.version)" />
    </template>
  </k-list-item>
</template>
