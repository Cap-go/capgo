import type { Tab } from '~/components/comp_def'
import IconChart from '~icons/heroicons/chart-bar'
import IconHistory from '~icons/heroicons/clock'
import IconCog from '~icons/heroicons/cog-6-tooth'
import IconCube from '~icons/heroicons/cube'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconShield from '~icons/heroicons/shield-check'
import IconChannel from '~icons/heroicons/signal'
import IconBuild from '~icons/heroicons/wrench-screwdriver'

export const appTabs: Tab[] = [
  { label: 'dashboard', icon: IconChart, key: '' },
  { label: 'info', icon: IconCog, key: '/info' },
  { label: 'bundles', icon: IconCube, key: '/bundles' },
  { label: 'channels', icon: IconChannel, key: '/channels' },
  { label: 'devices', icon: IconDevice, key: '/devices' },
  { label: 'logs', icon: IconHistory, key: '/logs' },
  { label: 'builds', icon: IconBuild, key: '/builds' },
  { label: 'access', icon: IconShield, key: '/access' },
]
