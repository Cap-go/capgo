import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'

import type { UserModule } from '~/types'

export const install: UserModule = () => {
  Chart.register(...registerables)
  Chart.register(annotationPlugin)
}
