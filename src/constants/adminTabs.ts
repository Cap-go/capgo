import type { Tab } from '~/components/comp_def'
import IconArrowPath from '~icons/heroicons/arrow-path'
import IconBanknotes from '~icons/heroicons/banknotes'
import IconBuildingOffice from '~icons/heroicons/building-office-2'
import IconChart from '~icons/heroicons/chart-bar'
import IconCircleStack from '~icons/heroicons/circle-stack'
import IconCurrencyDollar from '~icons/heroicons/currency-dollar'
import IconPuzzle from '~icons/heroicons/puzzle-piece'
import IconUsers from '~icons/heroicons/user-group'
import IconCube from '~icons/heroicons/cube'

export const adminTabs: Tab[] = [
  { label: 'overview', icon: IconChart, key: '' },
  { label: 'updates', icon: IconArrowPath, key: '/updates' },
  { label: 'replication', icon: IconCircleStack, key: '/replication' },
  { label: 'plugins', icon: IconPuzzle, key: '/plugins' },
  { label: 'users', icon: IconUsers, key: '/users' },
  { label: 'admin-organizations', icon: IconBuildingOffice, key: '/organizations' },
  { label: 'revenue', icon: IconBanknotes, key: '/revenue' },
  { label: 'credits', icon: IconCurrencyDollar, key: '/credits' },
  { label: 'builder', icon: IconCube, key: '/builder' },
]
