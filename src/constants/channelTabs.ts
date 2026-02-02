import type { Tab } from '~/components/comp_def'
import IconChartBar from '~icons/heroicons/chart-bar'
import IconHistory from '~icons/heroicons/clock'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconInfo from '~icons/heroicons/information-circle'

export const channelTabs: Tab[] = [
  { label: 'dashboard', icon: IconChartBar, key: '/statistics' },
  { label: 'info', icon: IconInfo, key: '' },
  { label: 'devices', icon: IconDevice, key: '/devices' },
  { label: 'history', icon: IconHistory, key: '/history' },
]
