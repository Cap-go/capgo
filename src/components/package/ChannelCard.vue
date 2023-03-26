<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  kListItem,
} from 'konsta/vue'
import { toast } from 'sonner'
import IconTrash from '~icons/heroicons/trash'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import { appIdToUrl } from '~/services/conversion'

const props = defineProps<{
  channel: Database['public']['Tables']['channels']['Row']
}>()
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

const loadData = async () => {
  if (!props.channel) {
    try {
      const date_id = new Date().toISOString().slice(0, 7)
      const { data, error } = await supabase
        .from('app_stats')
        .select()
        .eq('app_id', props.channel)
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

const deleteChannel = async (channel: Database['public']['Tables']['channels']['Row']) => {
  if (await didCancel(t('channel')))
    return
  try {
    const { error: delChanError } = await supabase
      .from('channels')
      .delete()
      .eq('app_id', channel.app_id)
      .eq('id', channel.id)
    if (delChanError) {
      toast.error(t('cannot-delete-channel'))
    }
    else {
      await refreshData()
      toast.success(t('channel-deleted'))
    }
  }
  catch (error) {
    toast.error(t('cannot-delete-channel'))
  }
}

const openChannel = (channel: Database['public']['Tables']['channels']['Row']) => {
  router.push(`/app/p/${appIdToUrl(channel.app_id)}/channel/${channel.id}`)
}

watchEffect(async () => {
  if (route.path.endsWith('/app/home'))
    await refreshData()
})
</script>

<template>
  <!-- Row -->
  <tr class="hidden cursor-pointer md:table-row text-slate-800 dark:text-white" @click="openChannel(props.channel)">
    <td class="p-2">
      <div class="text-left">
        {{ props.channel.name }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-left">
        {{ props.channel.version.name }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-left">
        {{ formatDate(props.channel.updated_at || "") }}
      </div>
    </td>

    <td class="" @click.stop="deleteChannel(props.channel)">
      <div class="text-left">
        <IconTrash class="text-lg text-red-600" />
      </div>
    </td>
  </tr>
  <!-- Mobile -->
  <k-list-item
    class="md:hidden"
    :title="props.channel.name"
    :subtitle="formatDate(props.channel.updated_at || '')"
    @click="openChannel(props.channel)"
  >
    <template #after>
      <IconTrash class="text-lg text-red-600" @click.stop="deleteChannel(props.channel)" />
    </template>
  </k-list-item>
</template>
