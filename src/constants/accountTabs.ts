import type { Tab } from '~/components/comp_def'
import IconBell from '~icons/heroicons/bell'
import IconInfo from '~icons/heroicons/information-circle'
import IconLock from '~icons/heroicons/lock-closed'

export const accountTabs: Tab[] = [
  { label: 'general', key: '/settings/account', icon: IconInfo },
  { label: 'notifications', key: '/settings/account/notifications', icon: IconBell },
  { label: 'change-password', key: '/settings/account/change-password', icon: IconLock },
]
