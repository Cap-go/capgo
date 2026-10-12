<script setup lang="ts">
import type { DeviceDataCollection, DeviceDataCollectionKey } from '~/services/deviceDataCollection'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import IconEyeOff from '~icons/lucide/eye-off'

const props = defineProps<{
  appId: string
  collection: DeviceDataCollection
  requires: DeviceDataCollectionKey[]
}>()

const { t } = useI18n()

const missing = computed(() => props.requires.filter(key => !props.collection[key]))
const missingLabels = computed(() => missing.value.map(key => t(`collect-${key.replaceAll('_', '-')}`)).join(', '))
const settingsLink = computed(() => `/app/${encodeURIComponent(props.appId)}/settings`)
</script>

<template>
  <div v-if="missing.length === 0" class="contents">
    <slot />
  </div>
  <div v-else class="relative min-h-40" data-test="device-data-collection-gate">
    <div class="pointer-events-none select-none blur-sm" aria-hidden="true" inert>
      <slot />
    </div>
    <div class="absolute inset-0 flex items-center justify-center p-4">
      <div class="max-w-sm p-4 text-center bg-white border rounded-lg shadow-lg border-slate-200 dark:bg-slate-900 dark:border-slate-700">
        <IconEyeOff class="w-5 h-5 mx-auto mb-2 text-slate-500 dark:text-slate-400" aria-hidden="true" />
        <p class="text-sm font-semibold text-slate-900 dark:text-white">
          {{ t('device-data-collection-gate-title') }}
        </p>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {{ t('device-data-collection-gate-body', { fields: missingLabels }) }}
        </p>
        <RouterLink
          :to="settingsLink"
          class="inline-block mt-3 text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
        >
          {{ t('device-data-collection-gate-cta') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
