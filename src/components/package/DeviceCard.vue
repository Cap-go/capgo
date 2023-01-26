<script setup lang="ts">
import { useRouter } from 'vue-router'
import { formatDate } from '~/services/date'
import type { Database } from '~/types/supabase.types'

const props = defineProps<{
  device: Database['public']['Tables']['devices']['Row']
}>()
const router = useRouter()

const openDevice = async () => {
  console.log('openDevice', props.device)

  router.push(`/app/p/${props.device.app_id.replace(/\./g, '--')}/d/${props.device.device_id}`)
}
</script>

<template>
  <!-- Row -->
  <tr class="cursor-pointer text-slate-800 dark:text-white" @click="openDevice()">
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
        {{ props.device.custom_id }}
      </div>
    </td>
  </tr>
</template>

<style>
  #confirm-button {
    background-color: theme('colors.red.500');
    color: theme('colors.white');
  }
</style>
