import type { Tab } from '~/components/comp_def'
import IconChart from '~icons/heroicons/chart-bar'
import IconAudit from '~icons/heroicons/clipboard-document-list'
import IconPlan from '~icons/heroicons/credit-card'
import IconCredits from '~icons/heroicons/currency-dollar'
import IconWebhook from '~icons/heroicons/globe-alt'
import IconInfo from '~icons/heroicons/information-circle'
import IconSecurity from '~icons/heroicons/shield-check'
import IconShield from '~icons/heroicons/shield-exclamation'
import IconUsers from '~icons/heroicons/users'

export const organizationTabs: Tab[] = [
  { label: 'general', key: '/settings/organization', icon: IconInfo },
  { label: 'sso', key: '/settings/organization/sso', icon: IconShield },
  { label: 'members', key: '/settings/organization/members', icon: IconUsers },
  // Security tab is added dynamically in settings.vue for super_admins only
  { label: 'security', key: '/settings/organization/security', icon: IconSecurity },
  { label: 'audit-logs', key: '/settings/organization/auditlogs', icon: IconAudit },
  { label: 'plans', key: '/settings/organization/plans', icon: IconPlan },
  { label: 'usage', key: '/settings/organization/usage', icon: IconChart },
  { label: 'credits', key: '/settings/organization/credits', icon: IconCredits },
  { label: 'webhooks', key: '/settings/organization/webhooks', icon: IconWebhook },
]
