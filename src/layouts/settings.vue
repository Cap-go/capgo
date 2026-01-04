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
  // Rebuild tabs array in correct order based on permissions
  const newTabs: Tab[] = []

  // Always show general and members
  const general = baseOrgTabs.find(t => t.key === '/settings/organization')
  const members = baseOrgTabs.find(t => t.key === '/settings/organization/members')
  if (general)
    newTabs.push({ ...general })

  // Add SSO after general if user is super_admin
  const needsSSO = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  if (needsSSO) {
    const sso = baseOrgTabs.find(t => t.key === '/settings/organization/sso')
    if (sso)
      newTabs.push({ ...sso })
  }

  // Add members
  if (members)
    newTabs.push({ ...members })

  // Add plans if super_admin
  const needsPlans = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  if (needsPlans) {
    const plans = baseOrgTabs.find(t => t.key === '/settings/organization/plans')
    if (plans)
      newTabs.push({ ...plans })
  }

  // Add usage if super_admin
  const needsUsage = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  if (needsUsage) {
    const usage = baseOrgTabs.find(t => t.key === '/settings/organization/usage')
    if (usage)
      newTabs.push({ ...usage })
  }

  // Add credits if super_admin
  const needsCredits = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  if (needsCredits) {
    const credits = baseOrgTabs.find(t => t.key === '/settings/organization/credits')
    if (credits)
      newTabs.push({ ...credits })
  }

  // Add audit logs if super_admin
  const needsAuditLogs = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  if (needsAuditLogs) {
    const auditLogs = baseOrgTabs.find(t => t.key === '/settings/organization/audit-logs')
    if (auditLogs)
      newTabs.push({ ...auditLogs })
  }

  // Add security if super_admin
  const needsSecurity = organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
  if (needsSecurity) {
    const security = baseOrgTabs.find(t => t.key === '/settings/organization/security')
    if (security)
      newTabs.push({ ...security })
  }

  // Add billing if super_admin and not native platform
  if (!Capacitor.isNativePlatform()
    && organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])) {
    newTabs.push({
      label: 'billing',
      icon: IconBilling,
      key: '/billing',
      onClick: () => openPortal(organizationStore.currentOrganization?.gid ?? '', t),
    })
  }

  organizationTabs.value = newTabs
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
