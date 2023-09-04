<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'vue-router'
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
import { openPortal } from '~/services/stripe'

const { t } = useI18n()
const main = useMainStore()
const sidebarOpen = ref(false)
const displayStore = useDisplayStore()
const ActiveTab = ref('')

const tabs = ref<Tab[]>([
  {
    label: 'account',
    icon: shallowRef(IconAcount),
    key: '/dashboard/settings/account',
  },
  {
    label: 'password',
    icon: shallowRef(IconPassword),
    key: '/dashboard/settings/changepassword',
  },
  {
    label: 'notifications',
    icon: shallowRef(IconNotification),
    key: '/dashboard/settings/notifications',
  },
  {
    label: 'plans',
    icon: shallowRef(IconPlans),
    key: '/dashboard/settings/plans',
  },
])

const organizationTabs = ref<Tab[]>([
  {
    label: t('general-information'),
    icon: shallowRef(IconAcount),
    key: '/dashboard/settings/organization/general',
  },
  {
    label: t('members'),
    icon: shallowRef(IconPassword),
    key: '/dashboard/settings/organization/members',
  },
  {
    label: t('api-keys'),
    icon: shallowRef(IconNotification),
    key: '/dashboard/settings/organization/api-keys',
  },
  {
    label: t('billing'),
    icon: shallowRef(IconPlans),
    key: '/dashboard/settings/organization/billing',
  },
])

const type: 'user' | 'organization' = ref('user')
const router = useRouter()

watch(type, (val) => {
  let key
  if (val === 'user')
    key = tabs.value[0].key

  else
    key = organizationTabs.value[0].key

  router.push(key)
})

if (!Capacitor.isNativePlatform()) {
  tabs.value.push({
    label: 'billing',
    icon: shallowRef(IconBilling) as any,
    key: '/billing',
    onClick: openPortal,
  })
}
if (main.user?.id) {
  isAdmin(main.user?.id).then((res) => {
    if (!!res || isSpoofed()) {
      tabs.value.push({
        label: 'admin',
        icon: shallowRef(IconAdmin) as any,
        key: '/dashboard/settings/admin',
      })
    }
  })
}

displayStore.NavTitle = t('settings')
</script>

<template>
  <div class="flex h-full overflow-hidden pt-safe safe-areas">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />
    <!-- Content area -->
    <div class="flex flex-col flex-1 h-full overflow-hidden">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <div class="text-sm font-medium text-center text-gray-500 border-b border-gray-200 dark:text-gray-400 dark:border-gray-700">
        <ul class="flex flex-wrap -mb-px">
          <li class="mr-2">
            <a
              href="#" class="inline-block p-4 border-b-2 rounded-t-lg"
              :class="type === 'user' ? 'text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500' : 'dark:hover:text-gray-300'"
              aria-current="page"
              @click="type = 'user'"
            >Your settings</a>
          </li>
          <li class="mr-2">
            <a
              href="#" class="inline-block p-4 border-b-2 rounded-t-lg"
              :class="type === 'organization' ? 'text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500' : 'dark:hover:text-gray-300'"
              aria-current="page"
              @click="type = 'organization'"
            >{{ currentOrganization ? `${currentOrganization.name}'s settings'` : 'Organization settings' }} </a>
          </li>
        </ul>
      </div>
      <main class="w-full h-full overflow-hidden">
        <TabSidebar v-model:active-tab="ActiveTab" :tabs="type === 'user' ? tabs : organizationTabs" class="w-full h-full mx-auto md:px-4 md:py-8 lg:px-8 max-w-9xl">
          <template #default>
            <RouterView class="h-full" />
          </template>
        </TabSidebar>
      </main>
    </div>
  </div>
</template>
