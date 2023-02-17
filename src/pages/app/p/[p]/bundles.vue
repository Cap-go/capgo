<!-- eslint-disable @typescript-eslint/no-use-before-define -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const appId = ref('')

onMounted(async () => {
  if (route.path.endsWith('/bundles')) {
    appId.value = route.params.p as string
    appId.value = appId.value.replace(/--/g, '.')
  }
})
</script>

<template>
  <div>
    <TitleHead :title="t('package.versions')" color="warning" :default-back="`/app/package/${route.params.p}`" />
    <div class="h-full overflow-y-scroll md:py-4">
      <div id="versions" class="flex flex-col mx-auto overflow-y-scroll border rounded-lg shadow-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <BundleTable class="p-3" :app-id="appId" />
      </div>
    </div>
  </div>
</template>
