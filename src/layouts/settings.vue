<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tab } from '~/components/comp_def'
import { Capacitor } from '@capacitor/core'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IconBilling from '~icons/mingcute/bill-fill'
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
  // ensure usage/plans tabs based on permissions (keeps icons from base)
  const needsUsage = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  const hasUsage = organizationTabs.value.find(tab => tab.key === '/settings/organization/usage')
  if (needsUsage && !hasUsage) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/usage')
    if (base)
      organizationTabs.value.push({ ...base })
  }
  if (!needsUsage && hasUsage)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/usage')

  const needsCredits = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  const hasCredits = organizationTabs.value.find(tab => tab.key === '/settings/organization/credits')

  if (needsCredits && !hasCredits) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/credits')
    if (base)
      organizationTabs.value.push({ ...base })
  }

  if (!needsCredits && hasCredits)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/credits')

  const needsPlans = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  const hasPlans = organizationTabs.value.find(tab => tab.key === '/settings/organization/plans')
  if (needsPlans && !hasPlans) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/plans')
    if (base)
      organizationTabs.value.push({ ...base })
  }
  if (!needsPlans && hasPlans)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/plans')

  // Audit logs - visible only to super_admins
  const needsAuditLogs = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  const hasAuditLogs = organizationTabs.value.find(tab => tab.key === '/settings/organization/audit-logs')
  if (needsAuditLogs && !hasAuditLogs) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/audit-logs')
    if (base)
      organizationTabs.value.push({ ...base })
  }
  if (!needsAuditLogs && hasAuditLogs)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/audit-logs')

  // Security - visible only to super_admins
  const needsSecurity = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  const hasSecurity = organizationTabs.value.find(tab => tab.key === '/settings/organization/security')
  if (needsSecurity && !hasSecurity) {
    const base = baseOrgTabs.find(t => t.key === '/settings/organization/security')
    if (base)
      organizationTabs.value.push({ ...base })
  }
  if (!needsSecurity && hasSecurity)
    organizationTabs.value = organizationTabs.value.filter(tab => tab.key !== '/settings/organization/security')

  if (!Capacitor.isNativePlatform()
    && organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
    && !organizationTabs.value.find(tab => tab.key === '/billing')) {
    organizationTabs.value.push({
      label: 'billing',
      icon: IconBilling,
      key: '/billing',
      onClick: () => openPortal(organizationStore.currentOrganization?.gid ?? '', t),
    })
  }
  else if (!organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])) {
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
    <main class="flex flex-1 w-full min-h-0 mt-0 overflow-hidden bg-blue-50 dark:bg-slate-800/40">
      <div class="flex-1 w-full min-h-0 px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-16 lg:px-8 max-w-9xl">
        <!-- Show FailedCard instead of normal content when security compliance is required -->
        <FailedCard v-if="shouldBlockContent" />
        <RouterView v-else class="w-full" />
      </div>
    </main>
  </div>
</template>
