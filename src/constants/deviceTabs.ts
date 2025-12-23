import type { Tab } from '~/components/comp_def'
import IconHistory from '~icons/heroicons/clock'
import IconCube from '~icons/heroicons/cube'
import IconInfo from '~icons/heroicons/information-circle'

export const deviceTabs: Tab[] = [
  { label: 'info', icon: IconInfo, key: '' },
  { label: 'deployments', icon: IconCube, key: '/deployments' },
  { label: 'logs', icon: IconHistory, key: '/logs' },
]
