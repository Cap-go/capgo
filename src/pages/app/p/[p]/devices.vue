<!-- eslint-disable @typescript-eslint/no-use-before-define -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const appId = ref('')

watch(
  route,
  async () => {
    if (route.path.endsWith('/devices')) {
      appId.value = route.params.p as string
      appId.value = appId.value.replace(/--/g, '.')
    }
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <div>
    <TitleHead :title="t('devices')" :default-back="`/app/package/${route.params.p}`" />
    <div class="h-full overflow-y-scroll md:py-4">
      <div id="versions" class="flex flex-col mx-auto overflow-y-scroll border rounded-lg shadow-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <DeviceTable class="p-3" :app-id="appId" />
      </div>
    </div>
  </div>
</template>
