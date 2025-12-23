import type { Tab } from '~/components/comp_def'
import IconHistory from '~icons/heroicons/clock'
import IconInfo from '~icons/heroicons/information-circle'

export const bundleTabs: Tab[] = [
  { label: 'info', icon: IconInfo, key: '' },
  { label: 'history', icon: IconHistory, key: '/history' },
]
