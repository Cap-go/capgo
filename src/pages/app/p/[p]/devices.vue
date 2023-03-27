<!-- eslint-disable @typescript-eslint/no-use-before-define -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { urlToAppId } from '~/services/conversion'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const route = useRoute()
const appId = ref('')
const displayStore = useDisplayStore()

watch(
  route,
  async () => {
    if (route.path.endsWith('/devices')) {
      appId.value = route.params.p as string
      appId.value = urlToAppId(appId.value)
      displayStore.NavTitle = t('devices')
      displayStore.defaultBack = `/app/package/${route.params.p}`
    }
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <div>
    <div class="h-full overflow-y-scroll md:py-4">
      <div id="versions" class="mx-auto flex flex-col overflow-y-scroll border border-slate-200 rounded-lg shadow-lg md:mt-5 md:w-2/3 dark:border-slate-900 dark:bg-gray-800">
        <DeviceTable class="p-3" :app-id="appId" />
      </div>
    </div>
  </div>
</template>
