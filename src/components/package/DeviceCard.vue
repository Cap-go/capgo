<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  kListItem,
} from 'konsta/vue'
import { formatDate } from '~/services/date'
import type { Database } from '~/types/supabase.types'
import { appIdToUrl } from '~/services/conversion'

const props = defineProps<{
  device: Database['public']['Tables']['devices']['Row']
}>()
const router = useRouter()

async function openDevice() {
  console.log('openDevice', props.device)

  router.push(`/app/p/${appIdToUrl(props.device.app_id)}/d/${props.device.device_id}`)
}
</script>

<template>
  <!-- Row -->
  <tr class="hidden cursor-pointer text-slate-800 md:table-row dark:text-white" @click="openDevice()">
    <td class="p-2">
      <div class="text-left">
        {{ props.device.device_id }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-left">
        {{ props.device.platform }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-left">
        {{ formatDate(props.device.updated_at || "") }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-left">
        {{ props.device.version.name }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-left">
        {{ props.device.custom_id || '-' }}
      </div>
    </td>
  </tr>
  <!-- Mobile -->
  <k-list-item
    link
    class="md:hidden"
    :title="props.device.device_id"
    :subtitle="props.device.platform || ''"
    @click="openDevice()"
  />
</template>
