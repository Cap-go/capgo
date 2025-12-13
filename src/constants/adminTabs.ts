import type { Tab } from '~/components/comp_def'
import IconArrowPath from '~icons/heroicons/arrow-path'
import IconChart from '~icons/heroicons/chart-bar'
import IconClock from '~icons/heroicons/clock'
import IconUsers from '~icons/heroicons/user-group'

export const adminTabs: Tab[] = [
  { label: 'overview', icon: IconChart, key: '' },
  { label: 'updates', icon: IconArrowPath, key: '/updates' },
  { label: 'performance', icon: IconClock, key: '/performance' },
  { label: 'users-and-revenue', icon: IconUsers, key: '/users' },
]
