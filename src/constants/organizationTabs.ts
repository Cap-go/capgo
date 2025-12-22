import type { Tab } from '~/components/comp_def'
import IconChart from '~icons/heroicons/chart-bar'
import IconPlan from '~icons/heroicons/credit-card'
import IconCredits from '~icons/heroicons/currency-dollar'
import IconInfo from '~icons/heroicons/information-circle'
import IconShield from '~icons/heroicons/shield-check'
import IconUserGroup from '~icons/heroicons/user-group'
import IconUsers from '~icons/heroicons/users'

export const organizationTabs: Tab[] = [
  { label: 'general', key: '/settings/organization', icon: IconInfo },
  { label: 'members', key: '/settings/organization/members', icon: IconUsers },
  { label: 'groups', key: '/settings/organization/groups', icon: IconUserGroup },
  { label: 'role-assignments', key: '/settings/organization/role-assignments', icon: IconShield },
  { label: 'plans', key: '/settings/organization/plans', icon: IconPlan },
  { label: 'usage', key: '/settings/organization/usage', icon: IconChart },
  { label: 'credits', key: '/settings/organization/credits', icon: IconCredits },
]
