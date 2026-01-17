import type { Tab } from '~/components/comp_def'
import IconArrowPath from '~icons/heroicons/arrow-path'
import IconBanknotes from '~icons/heroicons/banknotes'
import IconChart from '~icons/heroicons/chart-bar'
import IconCircleStack from '~icons/heroicons/circle-stack'
import IconClock from '~icons/heroicons/clock'
import IconPuzzle from '~icons/heroicons/puzzle-piece'
import IconUsers from '~icons/heroicons/user-group'

export const adminTabs: Tab[] = [
  { label: 'overview', icon: IconChart, key: '' },
  { label: 'updates', icon: IconArrowPath, key: '/updates' },
  { label: 'performance', icon: IconClock, key: '/performance' },
  { label: 'replication', icon: IconCircleStack, key: '/replication' },
  { label: 'plugins', icon: IconPuzzle, key: '/plugins' },
  { label: 'users', icon: IconUsers, key: '/users' },
  { label: 'revenue', icon: IconBanknotes, key: '/revenue' },
]
