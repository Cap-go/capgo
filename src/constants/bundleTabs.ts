import type { Tab } from '~/components/comp_def'
import IconManifest from '~icons/heroicons/clipboard-document-list'
import IconHistory from '~icons/heroicons/clock'
import IconEye from '~icons/heroicons/eye'
import IconInfo from '~icons/heroicons/information-circle'
import IconPuzzle from '~icons/heroicons/puzzle-piece'

export const bundleTabs: Tab[] = [
  { label: 'info', icon: IconInfo, key: '' },
  { label: 'manifest', icon: IconManifest, key: '/manifest' },
  { label: 'dependencies', icon: IconPuzzle, key: '/dependencies' },
  { label: 'history', icon: IconHistory, key: '/history' },
  { label: 'preview-tab', icon: IconEye, key: '/preview' },
]
