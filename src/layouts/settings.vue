<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import { Capacitor } from '@capacitor/core'
import { ref, shallowRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IconNotification from '~icons/heroicons/bell'
import IconBilling from '~icons/heroicons/building-library'
import IconUsage from '~icons/heroicons/chart-pie'
import IconPlans from '~icons/heroicons/credit-card'
import IconCredits from '~icons/heroicons/currency-dollar'
import IconPassword from '~icons/heroicons/lock-closed'
import IconAccount from '~icons/heroicons/user'
import { openPortal } from '~/services/stripe'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const router = useRouter()
const creditsV2Enabled = import.meta.env.VITE_FEATURE_CREDITS_V2
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
    icon: shallowRef(IconAccount),
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
    icon: shallowRef(IconAccount),
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
  const hasSuperAdminRights = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])

  if (hasSuperAdminRights && (!organizationTabs.value.find((tab: Tab) => tab.label === 'usage'))) {
    // push it 2 before the last tab
    organizationTabs.value.push({
      label: 'usage',
      icon: shallowRef(IconUsage) as any,
      key: '/settings/organization/usage',
    })
  }
  else if (organizationTabs.value.find((tab: Tab) => tab.label === 'usage')) {
    organizationTabs.value = organizationTabs.value.filter((tab: Tab) => tab.label !== 'usage')
  }
  console.log('creditsV2Enabled', creditsV2Enabled)
  console.log('hasSuperAdminRights', hasSuperAdminRights)
  if (creditsV2Enabled && hasSuperAdminRights && !organizationTabs.value.find((tab: Tab) => tab.label === 'credits')) {
    const insertIndex = organizationTabs.value.findIndex((tab: Tab) => tab.label === 'members') + 1
    const creditsTab = {
      label: 'credits',
      icon: shallowRef(IconCredits) as any,
      key: '/settings/organization/credits',
    } satisfies Tab
    if (insertIndex > 0)
      organizationTabs.value.splice(insertIndex, 0, creditsTab)
    else
      organizationTabs.value.push(creditsTab)
  }
  else if ((!creditsV2Enabled || !hasSuperAdminRights) && organizationTabs.value.find((tab: Tab) => tab.label === 'credits')) {
    organizationTabs.value = organizationTabs.value.filter((tab: Tab) => tab.label !== 'credits')
  }
  if (hasSuperAdminRights && !organizationTabs.value.find((tab: Tab) => tab.label === 'plans')) {
    organizationTabs.value.push(
      {
        label: 'plans',
        icon: shallowRef(IconPlans) as any,
        key: '/settings/organization/plans',
      },
    )
  }
  else if (!hasSuperAdminRights) {
    organizationTabs.value = organizationTabs.value.filter((tab: Tab) => tab.label !== 'plans')
  }

  if (!Capacitor.isNativePlatform()
    && hasSuperAdminRights
    && !organizationTabs.value.find((tab: Tab) => tab.label === 'billing')) {
    organizationTabs.value.push({
      label: 'billing',
      icon: shallowRef(IconBilling) as any,
      key: '/billing',
      onClick: () => openPortal(organizationStore.currentOrganization?.gid ?? '', t),
    })
  }
  else if (!hasSuperAdminRights) {
    organizationTabs.value = organizationTabs.value.filter((tab: Tab) => tab.label !== 'billing')
  }
})

async function gotoOrgSettings() {
  type.value = 'organization'
}

function gotoMainSettings() {
  type.value = 'user'
}
</script>

<template>
  <div class="flex overflow-hidden flex-col flex-1 h-full">
    <div class="text-center text-gray-500 bg-gray-200 dark:text-gray-400 dark:bg-gray-800">
      <ul class="flex flex-wrap -mb-px">
        <li class="mr-2">
          <a
            class="inline-block p-1 rounded-t-lg cursor-pointer md:p-4"
            :class="{ 'border-b-2 text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500': type === 'user', 'dark:hover:text-gray-300 dark:hover:bg-gray-700 hover:text-gray-600 hover:bg-gray-300': type !== 'user' }"
            aria-current="page"
            @click="gotoMainSettings"
          >{{ t('your-settings') }}</a>
        </li>
        <li class="mr-2">
          <a
            class="inline-block p-1 rounded-t-lg cursor-pointer md:p-4"
            :class="{ 'border-b-2 text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500': type === 'organization', 'dark:hover:text-gray-300 dark:hover:bg-gray-700 hover:text-gray-600 hover:bg-gray-300': type !== 'organization' }"
            aria-current="page"
            @click="gotoOrgSettings"
          >{{ t('organization-settings') }} </a>
        </li>
      </ul>
    </div>
    <main class="overflow-hidden w-full h-full">
      <TabSidebar v-model:active-tab="ActiveTab" :tabs="type === 'user' ? tabs : organizationTabs" class="mx-auto w-full h-full md:py-8 md:px-4 lg:px-8 max-w-9xl">
        <template #default>
          <RouterView class="overflow-y-auto h-full grow" />
        </template>
      </TabSidebar>
    </main>
  </div>
</template>
