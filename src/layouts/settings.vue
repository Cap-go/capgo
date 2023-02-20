<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import Sidebar from '../components/Sidebar.vue'
import Navbar from '../components/Navbar.vue'
import { useDisplayStore } from '~/stores/display'
import IconAcount from '~icons/mdi/user'
import IconPassword from '~icons/mdi/password'
import IconPlans from '~icons/material-symbols/price-change'
import IconBilling from '~icons/mingcute/bill-fill'
import IconNotification from '~icons/mdi/message-notification'
import IconAdmin from '~icons/eos-icons/admin'
import type { Tab } from '~/components/comp_def'
import { isAdmin, isSpoofed } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const main = useMainStore()
const sidebarOpen = ref(false)
const displayStore = useDisplayStore()
const ActiveTab = ref('/dashboard/settings/account')

const tabs = ref<Tab[]>([
  {
    label: t('account'),
    icon: shallowRef(IconAcount),
    key: '/dashboard/settings/account',
  },
  {
    label: t('password'),
    icon: shallowRef(IconPassword),
    key: '/dashboard/settings/changepassword',
  },
  {
    label: t('notifications'),
    icon: shallowRef(IconNotification),
    key: '/dashboard/settings/notifications',
  },
  {
    label: t('plans'),
    icon: shallowRef(IconPlans),
    key: '/dashboard/settings/plans',
  },
])
if (!Capacitor.isNativePlatform()) {
  tabs.value.push({
    label: t('billing'),
    icon: shallowRef(IconBilling) as any,
    key: '/billing',
  })
}
if (main.user?.id) {
  isAdmin(main.user?.id).then((res) => {
    if (!!res || isSpoofed()) {
      tabs.value.push({
        label: t('admin'),
        icon: shallowRef(IconAdmin) as any,
        key: '/dashboard/settings/admin',
      })
    }
  })
}

displayStore.NavTitle = t('settings')
</script>

<template>
  <div class="flex h-full overflow-hidden bg-white pt-safe dark:bg-gray-900/90 safe-areas">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />
    <!-- Content area -->
    <div class="flex flex-col flex-1 h-full overflow-hidden">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <main class="w-full h-full overflow-hidden">
        <TabSidebar v-model:active-tab="ActiveTab" :tabs="tabs" class="w-full h-full mx-auto md:px-4 md:py-8 lg:px-8 max-w-9xl">
          <template #default>
            <RouterView class="h-full overflow-y-scroll" />
          </template>
        </TabSidebar>
      </main>
    </div>
  </div>
</template>
