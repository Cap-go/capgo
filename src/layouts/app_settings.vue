<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useI18n } from 'petite-vue-i18n'
import { useDisplayStore } from '~/stores/display'
import IconAcount from '~icons/mdi/user'
import type { Tab } from '~/components/comp_def'

const { t } = useI18n()
const route = useRoute()
const displayStore = useDisplayStore()
const ActiveTab = ref(`/app/p/${route.params.p}/settings`)

const tabs = ref<Tab[]>([
  {
    label: 'general',
    icon: shallowRef(IconAcount),
    key: `/app/p/${route.params.p}/settings`,
  },
])

displayStore.NavTitle = t('settings')
</script>

<template>
  <main class="w-full h-full overflow-hidden">
    <TabSidebar v-model:active-tab="ActiveTab" :tabs="tabs" class="w-full h-full mx-auto md:px-4 md:py-8 lg:px-8 max-w-9xl">
      <template #default>
        <RouterView class="h-full overflow-y-auto" />
      </template>
    </TabSidebar>
  </main>
</template>
