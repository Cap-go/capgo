import { Chart, registerables } from 'chart.js'
import type { UserModule } from '~/types'

export const install: UserModule = () => {
  Chart.register(...registerables)
}
