import type { Tab } from '~/components/comp_def'
import IconBuilding from '~icons/heroicons/building-office'
import IconUser from '~icons/heroicons/user'

export const settingsTabs: Tab[] = [
  { label: 'account', key: '/settings/account', icon: IconUser },
  { label: 'organization', key: '/settings/organization', icon: IconBuilding },
]
