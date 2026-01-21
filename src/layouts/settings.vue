<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tab } from '~/components/comp_def'
import { Capacitor } from '@capacitor/core'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IconBilling from '~icons/mingcute/bill-fill'
import AdminOnlyModal from '~/components/AdminOnlyModal.vue'
import FailedCard from '~/components/FailedCard.vue'
import Tabs from '~/components/Tabs.vue'
import { accountTabs } from '~/constants/accountTabs'
import { organizationTabs as baseOrgTabs } from '~/constants/organizationTabs'
import { settingsTabs } from '~/constants/settingsTabs'
import { openPortal } from '~/services/stripe'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const router = useRouter()
const route = useRoute()

// Modal state for non-admin billing access (triggered by billing tab click)
const showBillingModal = ref(false)

// Routes that require super_admin access
const adminOnlyRoutes = [
  '/settings/organization/usage',
  '/settings/organization/plans',
  '/settings/organization/credits',
  '/settings/organization/audit-logs',
  '/settings/organization/auditlogs',
  '/settings/organization/security',
]

// Check if user is super_admin
const isSuperAdmin = computed(() => {
  return organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
})

// Check if current route is admin-only and user is not admin
const isOnAdminOnlyRoute = computed(() => {
  const path = route.path.replace(/\/$/, '')
  return adminOnlyRoutes.some(r => path === r || path.startsWith(`${r}/`))
})

// Show admin-only modal when non-admin is on admin-only route
const showAdminOnlyModal = computed(() => {
  return !isSuperAdmin.value && isOnAdminOnlyRoute.value
})

// Check if user needs to setup 2FA or update password for organization access
const needsSecurityCompliance = computed(() => {
  const org = organizationStore.currentOrganization
  const needs2FA = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const needsPassword = org?.password_policy_config?.enabled && org?.password_has_access === false
  return needs2FA || needsPassword
})

// Only block organization settings, not account settings (user needs access to account to fix the issue)
const shouldBlockContent = computed(() => {
  return needsSecurityCompliance.value && route.path.startsWith('/settings/organization')
})

// keep Tab icon typing (including ShallowRef) instead of Vue's UnwrapRef narrowing
const organizationTabs = ref<Tab[]>([...baseOrgTabs]) as Ref<Tab[]>

watchEffect(() => {
  // Billing tab - always show on web, with different behavior for non-admins
  if (!Capacitor.isNativePlatform() && !organizationTabs.value.find(tab => tab.key === '/billing')) {
    organizationTabs.value.push({
      label: 'billing',
      icon: IconBilling,
      key: '/billing',
      onClick: () => {
        // Check permissions at click time to handle role changes
        if (organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])) {
          openPortal(organizationStore.currentOrganization?.gid ?? '', t)
        }
        else {
          showBillingModal.value = true
        }
      },
    })
  }
})

const activePrimary = computed(() => {
  const path = route.path
  if (path.startsWith('/settings/organization'))
    return '/settings/organization'
  return '/settings/account'
})

const secondaryTabs = computed(() => {
  return activePrimary.value === '/settings/organization' ? organizationTabs.value : accountTabs
})

const activeSecondary = computed(() => {
  const tabs = secondaryTabs.value
  const path = route.path.replace(/\/$/, '')

  // Prefer the most specific match (longest path) so nested routes like
  // `/settings/organization/members` don't get claimed by the parent
  // `/settings/organization` tab.
  const ordered = [...tabs].sort((a, b) => b.key.length - a.key.length)

  const match = ordered.find((t) => {
    const key = t.key.replace(/\/$/, '')
    return path === key || path.startsWith(`${key}/`)
  })

  return match?.key ?? tabs[0]?.key
})

function handlePrimary(val: string) {
  // Clicking primary switches to the root of that section
  router.push(val === '/settings/organization' ? '/settings/organization' : '/settings/account')
}
function handleSecondary(val: string) {
  const tab = secondaryTabs.value.find(t => t.key === val)
  if (tab?.onClick) {
    tab.onClick(val)
    return
  }
  router.push(val)
}
</script>

<template>
  <div class="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
    <Tabs
      :tabs="settingsTabs"
      :active-tab="activePrimary"
      :secondary-tabs="shouldBlockContent ? [] : secondaryTabs"
      :secondary-active-tab="activeSecondary"
      no-wrap
      @update:active-tab="handlePrimary"
      @update:secondary-active-tab="handleSecondary"
    />
    <main class="flex relative flex-1 w-full min-h-0 mt-0 overflow-hidden bg-blue-50 dark:bg-slate-800/40">
      <div
        class="flex-1 w-full min-h-0 px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-16 lg:px-8 max-w-9xl"
        :class="{ 'blur-sm pointer-events-none select-none': showAdminOnlyModal }"
      >
        <!-- Show FailedCard instead of normal content when security compliance is required -->
        <FailedCard v-if="shouldBlockContent" />
        <RouterView v-else class="w-full" />
      </div>
      <!-- Admin-only modal for admin-only routes -->
      <AdminOnlyModal v-if="showAdminOnlyModal" />
      <!-- Admin-only modal for billing tab click -->
      <AdminOnlyModal v-if="showBillingModal" @click="showBillingModal = false" />
    </main>
  </div>
</template>
