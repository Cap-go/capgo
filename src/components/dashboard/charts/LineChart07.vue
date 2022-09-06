<template>
  <canvas ref="canvas" :data="data" :width="width" :height="height"></canvas>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Chart, LineController, LineElement, Filler, PointElement, LinearScale, CategoryScale, Tooltip,
} from 'chart.js'
import 'chartjs-adapter-dayjs'

// Import utilities
import { formatValue } from '../../../utils/Utils'

Chart.register(LineController, LineElement, Filler, PointElement, LinearScale, CategoryScale, Tooltip)

export default {
  name: 'LineChart07',
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
          layout: {
            padding: {
              top: 12,
              bottom: 16,
              left: 20,
              right: 20,
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                drawBorder: false,
              },
              ticks: {
                maxTicksLimit: 7,
                callback: (value) => formatValue(value),
              },
            },
            x: {
              grid: {
                display: false,
                drawBorder: false,
              },
              ticks: {
                autoSkipPadding: 48,
                maxRotation: 0,
                align: 'end',
              },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: () => false, // Disable tooltip title
                label: (context) => formatValue(context.parsed.y),
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