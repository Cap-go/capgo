<!-- eslint-disable @typescript-eslint/no-use-before-define -->
<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { urlToAppId } from '~/services/conversion'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const route = useRoute('/app/p/[p]/devices')
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
    <div class="h-full overflow-y-auto md:py-4">
      <div id="versions" class="flex flex-col mx-auto overflow-y-auto bg-white border rounded-lg shadow-lg border-slate-300 md:mt-5 md:w-2/3 dark:border-slate-900 dark:bg-gray-800">
        <DeviceTable :app-id="appId" />
      </div>
    </div>
  </div>
</template>
