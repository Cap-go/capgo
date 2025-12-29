import type { Tab } from '~/components/comp_def'
import IconHistory from '~icons/heroicons/clock'
import IconInfo from '~icons/heroicons/information-circle'
import IconPuzzle from '~icons/heroicons/puzzle-piece'

export const bundleTabs: Tab[] = [
  { label: 'info', icon: IconInfo, key: '' },
  { label: 'dependencies', icon: IconPuzzle, key: '/dependencies' },
  { label: 'history', icon: IconHistory, key: '/history' },
]
