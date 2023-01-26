<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ChannelCard from './ChannelCard.vue'
import type { Database } from '~/types/supabase.types'

const props = defineProps<{
  channels: (Database['public']['Tables']['channels']['Row'])[]
}>()
const emit = defineEmits(['reload'])
const { t } = useI18n()
</script>

<template>
  <div id="channels" class="bg-white border md:mx-3 rounded-sm shadow-lg border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <header class="px-5 py-4 border-b border-slate-100">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ t('package.channels') }}
      </h2>
    </header>
    <div class="p-3">
      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full table-auto" aria-label="Table with your apps">
          <!-- Table header -->
          <thead class="text-xs uppercase rounded-sm text-slate-400 dark:text-white bg-slate-50 dark:bg-gray-800">
            <tr>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('name') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('last-version') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('last-upload') }}
                </div>
              </th>
              <th class="p-2" />
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-100">
            <!-- Row -->
            <ChannelCard v-for="(channel, i) in props.channels" :key="channel.name + i" :channel="channel" @reload="emit('reload')" />
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
