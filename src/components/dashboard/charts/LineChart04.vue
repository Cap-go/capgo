<template>
  <canvas ref="canvas" :data="data" :width="width" :height="height"></canvas>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Chart, LineController, LineElement, Filler, PointElement, LinearScale, TimeScale, Tooltip,
} from 'chart.js'
import 'chartjs-adapter-dayjs'

// Import utilities
import { tailwindConfig, formatThousands } from '../../../utils/Utils'

Chart.register(LineController, LineElement, Filler, PointElement, LinearScale, TimeScale, Tooltip)

export default {
  name: 'LineChart04',
  props: ['data', 'width', 'height'],
  setup(props) {

    const canvas = ref(null)
    let chart = null
    
    onMounted(() => {
      const ctx = canvas.value
      chart = new Chart(ctx, {
        type: 'line',
        data: props.data,
        options: {
          chartArea: {
            backgroundColor: tailwindConfig().theme.colors.slate[50],
          },
          layout: {
            padding: {
              left: 20,
              right: 20,
            },
          },
          scales: {
            y: {
              display: false,
              beginAtZero: true,
            },
            x: {
              type: 'time',
              time: {
                parser: 'MM-DD-YYYY',
                unit: 'month',
              },
              display: false,
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: () => false, // Disable tooltip title
                label: (context) => formatThousands(context.parsed.y),
              },
            },
            legend: {
              display: false,
            },
          },
          interaction: {
            intersect: false,
            mode: 'nearest',
          },
          maintainAspectRatio: false,
        },
      })
    })

    onUnmounted(() => chart.destroy())

    return {
      canvas,
    }
  }
}
</script>