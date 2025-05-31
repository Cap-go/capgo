<script setup lang="ts">
import type { FunctionalComponent, SVGAttributes } from 'vue'
import type { Tab } from '~/components/comp_def'
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { h, ref, shallowRef, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import CurrencyIcon from '~icons/heroicons/currency-euro'
import IconPlans from '~icons/material-symbols/price-change'
import IconNotification from '~icons/mdi/message-notification'
import IconPassword from '~icons/mdi/password'
import IconAcount from '~icons/mdi/user'
import IconBilling from '~icons/mingcute/bill-fill'
import { openPortal } from '~/services/stripe'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const router = useRouter()
function getCurrentTab() {
  // look the path and set the active tab
  const path = router.currentRoute.value.path
  if (path.includes('/settings/account'))
    return '/settings/account'
  else if (path.includes('/settings/organization'))
    return '/settings/organization'
  else if (path.includes('/settings/organization/plans'))
    return '/settings/organization/plans'
  return '/settings/account'
}

const ActiveTab = ref(getCurrentTab())

const tabs = ref<Tab[]>([
  {
    label: 'account',
    icon: shallowRef(IconAcount),
    key: '/settings/account',
  },
  {
    label: 'password',
    icon: shallowRef(IconPassword),
    key: '/settings/changepassword',
  },
  {
    label: 'notifications',
    icon: shallowRef(IconNotification),
    key: '/settings/notifications',
  },
])

const organizationTabs = ref<Tab[]>([
  {
    label: 'general-information',
    icon: shallowRef(IconAcount),
    key: '/settings/organization/',
  },
  {
    label: 'members',
    icon: shallowRef(IconPassword),
    key: '/settings/organization/members',
  },
])

const type = ref<'user' | 'organization'>(router.currentRoute.value.path.includes('organization') ? 'organization' : 'user')

watch(type, (val) => {
  let key
  if (val === 'user')
    key = tabs.value[0].key

  else
    key = organizationTabs.value[0].key

  router.push(key)
})

watchEffect(() => {
  if (organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])
    && !organizationTabs.value.find(tab => tab.label === 'plans')) {
    organizationTabs.value.push(
      {
        label: 'plans',
        icon: shallowRef(IconPlans) as any,
        key: '/settings/organization/plans',
      },
    )
  }
  else if (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])) {
    organizationTabs.value = organizationTabs.value.filter(tab => tab.label !== 'plans')
  }
  if (organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])
    && !organizationTabs.value.find(tab => tab.label === 'tokens')) {
    organizationTabs.value.push(
      {
        label: 'tokens',
        icon: CurrencyIcon,
        key: '/settings/organization/tokens',
      },
    )
  }
  else if (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])) {
    organizationTabs.value = organizationTabs.value.filter(tab => tab.label !== 'tokens')
  }
  if (!Capacitor.isNativePlatform()
    && organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])
    && !organizationTabs.value.find(tab => tab.label === 'billing')) {
    organizationTabs.value.push({
      label: 'billing',
      icon: shallowRef(IconBilling) as any,
      key: '/billing',
      onClick: () => openPortal(organizationStore.currentOrganization?.gid || '', t),
    })
  }
  else if (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])) {
    organizationTabs.value = organizationTabs.value.filter(tab => tab.label !== 'billing')
  }

  if (organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])
    && (!organizationTabs.value.find(tab => tab.label === 'usage'))) {
    // push it 2 before the last tab
    organizationTabs.value.splice(tabs.value.length - 2, 0, {
      label: 'usage',
      icon: shallowRef(IconPlans) as any,
      key: '/settings/organization/usage',
    })
  }
  else if (organizationTabs.value.find(tab => tab.label === 'usage')) {
    organizationTabs.value = organizationTabs.value.filter(tab => tab.label !== 'usage')
  }
})

async function gotoOrgSettings() {
  type.value = 'organization'
}

function gotoMainSettings() {
  type.value = 'user'
}

displayStore.NavTitle = t('settings')
</script>

<template>
  <div class="flex flex-col flex-1 h-full overflow-hidden">
    <div class="text-center text-gray-500 bg-gray-200 dark:bg-gray-800 dark:text-gray-400">
      <ul class="flex flex-wrap -mb-px">
        <li class="mr-2">
          <a
            class="inline-block p-4 rounded-t-lg cursor-pointer"
            :class="{ 'border-b-2 text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500': type === 'user', 'dark:hover:text-gray-300 dark:hover:bg-gray-700 hover:text-gray-600 hover:bg-gray-300': type !== 'user' }"
            aria-current="page"
            @click="gotoMainSettings"
          >{{ t('your-settings') }}</a>
        </li>
        <li class="mr-2">
          <a
            class="inline-block p-4 rounded-t-lg cursor-pointer"
            :class="{ 'border-b-2 text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500': type === 'organization', 'dark:hover:text-gray-300 dark:hover:bg-gray-700 hover:text-gray-600 hover:bg-gray-300': type !== 'organization' }"
            aria-current="page"
            @click="gotoOrgSettings"
          >{{ t('organization-settings') }} </a>
        </li>
      </ul>
    </div>
    <main class="w-full h-full overflow-hidden">
      <TabSidebar v-model:active-tab="ActiveTab" :tabs="type === 'user' ? tabs : organizationTabs" class="w-full h-full mx-auto md:px-4 md:py-8 lg:px-8 max-w-9xl">
        <template #default>
          <RouterView class="h-full overflow-y-auto grow" />
        </template>
      </TabSidebar>
    </main>
  </div>
</template>
