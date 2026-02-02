<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tab } from '~/components/comp_def'
import { Capacitor } from '@capacitor/core'
import { computedAsync } from '@vueuse/core'
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
import { checkPermissions } from '~/services/permissions'
import { openPortal } from '~/services/stripe'
import { stripeEnabled } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const router = useRouter()
const route = useRoute()

// Modal state for non-admin billing access (triggered by billing tab click)
const showBillingModal = ref(false)

// Routes that require super_admin access (security-sensitive settings)
const adminOnlyRoutes = [
  '/settings/organization/audit-logs',
  '/settings/organization/auditlogs',
  '/settings/organization/security',
]

// Check if user is super_admin
const isSuperAdmin = computed(() => {
  const orgId = organizationStore.currentOrganization?.gid
  return organizationStore.hasPermissionsInRole('super_admin', ['org_super_admin'], orgId)
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

const canReadBilling = computedAsync(async () => {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId)
    return false
  return await checkPermissions('org.read_billing', { orgId })
}, false)

const canUpdateBilling = computedAsync(async () => {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId)
    return false
  return await checkPermissions('org.update_billing', { orgId })
}, false)

const canReadAuditLogs = computedAsync(async () => {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId)
    return false
  return await checkPermissions('org.read_audit', { orgId })
}, false)

const canManageSecurity = computedAsync(async () => {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId)
    return false
  return await checkPermissions('org.update_settings', { orgId })
}, false)

watchEffect(() => {
  if (!stripeEnabled.value) {
    const path = route.path.replace(/\/$/, '')
    const billingPaths = [
      '/settings/organization/usage',
      '/settings/organization/credits',
      '/settings/organization/plans',
      '/billing',
    ]
    if (billingPaths.some(p => path === p || path.startsWith(`${p}/`)))
      router.replace('/settings/organization')
  }
})

watchEffect(() => {
  const billingEnabled = stripeEnabled.value
  // ensure usage/plans tabs based on permissions (keeps icons from base)
  const needsUsage = billingEnabled && canReadBilling.value
  const hasUsage = organizationTabs.value.find(tab => tab.key === '/settings/organization/usage')
  if (needsUsage && !hasUsage) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/usage')
    if (base)
      organizationTabs.value.push({ ...base })
  }
  if (!needsUsage && hasUsage)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/usage')

  const needsCredits = billingEnabled && canUpdateBilling.value
  const hasCredits = organizationTabs.value.find(tab => tab.key === '/settings/organization/credits')

  if (needsCredits && !hasCredits) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/credits')
    if (base)
      organizationTabs.value.push({ ...base })
  }

  if (!needsCredits && hasCredits)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/credits')

  const needsPlans = billingEnabled && canUpdateBilling.value
  const hasPlans = organizationTabs.value.find(tab => tab.key === '/settings/organization/plans')
  if (needsPlans && !hasPlans) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/plans')
    if (base)
      organizationTabs.value.push({ ...base })
  }
  if (!needsPlans && hasPlans)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/plans')

  // Audit logs - visible only to super_admins
  const needsAuditLogs = canReadAuditLogs.value
  const hasAuditLogs = organizationTabs.value.find(tab => tab.key === '/settings/organization/audit-logs')
  if (needsAuditLogs && !hasAuditLogs) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/audit-logs')
    if (base)
      organizationTabs.value.push({ ...base })
  }
  if (!needsAuditLogs && hasAuditLogs)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/audit-logs')

  // Security - visible only to super_admins
  const needsSecurity = canManageSecurity.value
  const hasSecurity = organizationTabs.value.find(tab => tab.key === '/settings/organization/security')
  if (needsSecurity && !hasSecurity) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/security')
    if (base)
      organizationTabs.value.push({ ...base })
  }
  if (!needsSecurity && hasSecurity)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/security')

  // Check billing access - users with org.read_billing permission can access billing
  if (!Capacitor.isNativePlatform()
    && billingEnabled
    && canReadBilling.value
    && !organizationTabs.value.find(tab => tab.key === '/billing')) {
    organizationTabs.value.push({
      label: 'billing',
      icon: IconBilling,
      key: '/billing',
      onClick: () => {
        // Check permissions at click time to handle role changes
        if (organizationStore.hasPermissionsInRole('super_admin', ['org_super_admin'], organizationStore.currentOrganization?.gid)) {
          openPortal(organizationStore.currentOrganization?.gid ?? '', t)
        }
        else {
          showBillingModal.value = true
        }
      },
    })
  }
  else if (!canReadBilling.value || !billingEnabled) {
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/billing')
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
