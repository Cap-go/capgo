<!-- eslint-disable @typescript-eslint/no-use-before-define -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const route = useRoute()
const appId = ref('')
const displayStore = useDisplayStore()

onMounted(async () => {
  if (route.path.endsWith('/bundles')) {
    appId.value = route.params.p as string
    appId.value = appId.value.replace(/--/g, '.')
    displayStore.NavTitle = t('bundles')
    displayStore.defaultBack = `/app/package/${route.params.p}`
  }
})
</script>

<template>
  <div>
    <div class="h-full overflow-y-scroll md:py-4">
      <div id="versions" class="flex flex-col mx-auto overflow-y-scroll border rounded-lg shadow-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <BundleTable class="p-3" :app-id="appId" />
      </div>
    </div>
  </div>
</template>
