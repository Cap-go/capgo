<script setup lang="ts">
import { ref, shallowRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'vue-router'
import { useDisplayStore } from '~/stores/display'
import IconAcount from '~icons/mdi/user'
import IconPassword from '~icons/mdi/password'
import IconPlans from '~icons/material-symbols/price-change'
import IconBilling from '~icons/mingcute/bill-fill'
import IconNotification from '~icons/mdi/message-notification'
import IconAdmin from '~icons/eos-icons/admin'
import type { Tab } from '~/components/comp_def'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { openPortal } from '~/services/stripe'
import { isSpoofed } from '~/services/supabase'

// import ky from 'ky'
// import MdiInvoiceListOutline from '~icons/mdi/invoice-list-outline';
// import { toast } from 'vue-sonner'

const { t } = useI18n()
const main = useMainStore()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
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
])

const organizationTabs = ref<Tab[]>([
  {
    label: 'general-information',
    icon: shallowRef(IconAcount),
    key: '/dashboard/settings/organization/general',
  },
  {
    label: 'members',
    icon: shallowRef(IconPassword),
    key: '/dashboard/settings/organization/members',
  },
])

const router = useRouter()
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
        icon: shallowRef(IconPlans),
        key: '/dashboard/settings/plans',
      },
    )
  }
  else if (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])) {
    organizationTabs.value = organizationTabs.value.filter(tab => tab.label !== 'plans')
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
  // if (!Capacitor.isNativePlatform()
  //   && organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])
  //   && !organizationTabs.value.find(tab => tab.label === 'invoices')) {
  //     organizationTabs.value.push(
  //     {
  //       label: 'invoices',
  //       icon: shallowRef(MdiInvoiceListOutline),
  //       key: '/invoices',
  //       onClick: async() => {
  //         // post on that and display a popup to say check your mailbox
  //         // https://zenvoice.io/api/invoices/send?userId=65e615635afbec6a6d29f6df&email=paul@kick.com
  //         if (!main.user?.email) return
  //         ky.get(`https://zenvoice.io/api/invoices/send?userId=65e615635afbec6a6d29f6df&email=${main.user?.email}`, {
  //           // searchParams: {
  //           //   userId: '5e615635afbec6a6d29f6df',
  //           //   email: main.user?.email
  //           // }
  //         })
  //         .then(()=> {
  //           // check your mailbox toast
  //           toast.info('Check your email to access to the link')
  //         })
  //         .catch(() => {
  //           toast.error('Cannot find any invoices')
  //         })

  //         // openBlank(`https://zenvoice.io/p/65e615635afbec6a6d29f6df?email=${main.user?.email}`) old code
  //       }
  //     },
  //   )
  // }
  // else {
  //   organizationTabs.value = organizationTabs.value.filter(tab => tab.label !== 'invoices')
  // }

  // TODO: reenable after we fix usage
  if (organizationStore.currentOrganization?.paying
    && organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])
    && (!organizationTabs.value.find(tab => tab.label === 'usage'))) {
    // push it 2 before the last tab
    organizationTabs.value.splice(tabs.value.length - 2, 0, {
      label: 'usage',
      icon: shallowRef(IconPlans) as any,
      key: '/dashboard/settings/usage',
    })
  }
  else if (organizationTabs.value.find(tab => tab.label === 'usage')) {
    organizationTabs.value = organizationTabs.value.filter(tab => tab.label !== 'usage')
  }
  if ((main.isAdmin || isSpoofed()) && !tabs.value.find(tab => tab.label === 'admin')) {
    tabs.value.push({
      label: 'admin',
      icon: shallowRef(IconAdmin) as any,
      key: '/dashboard/settings/admin',
    })
  }
  else if (!main.isAdmin && tabs.value.find(tab => tab.label === 'admin')) {
    tabs.value = tabs.value.filter(tab => tab.label !== 'admin')
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
    <div class="text-sm font-medium text-center text-gray-500 border-b border-gray-200 dark:text-gray-400 dark:border-gray-700">
      <ul class="flex flex-wrap -mb-px">
        <li class="mr-2">
          <a
            class="inline-block p-4 border-b-2 rounded-t-lg cursor-pointer"
            :class="type === 'user' ? 'text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500' : 'dark:hover:text-gray-300'"
            aria-current="page"
            @click="gotoMainSettings"
          >{{ t('your-settings') }}</a>
        </li>
        <li class="mr-2">
          <a
            class="inline-block p-4 border-b-2 rounded-t-lg cursor-pointer"
            :class="type === 'organization' ? 'text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500' : 'dark:hover:text-gray-300'"
            aria-current="page"
            @click="gotoOrgSettings"
          >{{ t('organization-settings') }} </a>
        </li>
      </ul>
    </div>
    <main class="w-full h-full overflow-hidden">
      <TabSidebar v-model:active-tab="ActiveTab" :tabs="type === 'user' ? tabs : organizationTabs" class="w-full h-full mx-auto md:px-4 md:py-8 lg:px-8 max-w-9xl">
        <template #default>
          <RouterView class="h-full overflow-y-auto" />
        </template>
      </TabSidebar>
    </main>
  </div>
</template>
