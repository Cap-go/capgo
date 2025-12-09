import type { Tab } from '~/components/comp_def'
import IconChart from '~icons/heroicons/chart-bar'
import IconPlan from '~icons/heroicons/credit-card'
import IconInfo from '~icons/heroicons/information-circle'
import IconUsers from '~icons/heroicons/users'
import IconCredits from '~icons/heroicons/currency-dollar'

export const organizationTabs: Tab[] = [
  { label: 'general', key: '/settings/organization', icon: IconInfo },
  { label: 'members', key: '/settings/organization/members', icon: IconUsers },
  { label: 'plans', key: '/settings/organization/plans', icon: IconPlan },
  { label: 'usage', key: '/settings/organization/usage', icon: IconChart },
  { label: 'credits', key: '/settings/organization/credits', icon: IconCredits },
]
