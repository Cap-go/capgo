<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDisplayStore } from '~/stores/display'
import { urlToAppId } from '~/services/conversion'

const route = useRoute()
const displayStore = useDisplayStore()
const appId = ref('')
const { t } = useI18n()

watchEffect(async () => {
  if (route.path.endsWith('/channels')) {
    appId.value = route.params.p as string
    appId.value = urlToAppId(appId.value)
    displayStore.NavTitle = t('channels')
    displayStore.defaultBack = `/app/package/${route.params.p}`
  }
})
</script>

<template>
  <div>
    <div class="h-full overflow-y-scroll md:py-4">
      <div id="versions" class="mx-auto flex flex-col overflow-y-scroll border border-slate-200 rounded-lg shadow-lg md:mt-5 md:w-2/3 dark:border-slate-900 dark:bg-gray-800">
        <ChannelTable class="p-3" :app-id="appId" />
      </div>
    </div>
  </div>
</template>
