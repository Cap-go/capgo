import type { Tab } from '~/components/comp_def'
import IconChartBar from '~icons/heroicons/chart-bar'
import IconHistory from '~icons/heroicons/clock'

export const logTabs: Tab[] = [
  { label: 'raw-logs', icon: IconHistory, key: '' },
  { label: 'log-insights', icon: IconChartBar, key: '/insights' },
]
