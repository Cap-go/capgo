<template>
  <div class="px-5 py-3">
    <div class="flex flex-wrap justify-between items-center">
      <div class="flex items-center">
        <div class="text-3xl font-bold text-slate-800 mr-2">$1,347.09</div>
        <div class="text-sm">Net</div>
      </div>
      <div class="grow ml-2">
        <ul ref="legend" class="flex flex-wrap justify-end"></ul>
      </div>
    </div>
  </div>
  <div class="grow">
    <canvas ref="canvas" :data="data" :width="width" :height="height"></canvas>
  </div>  
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Chart, BarController, BarElement, LinearScale, TimeScale, Tooltip, Legend,
} from 'chart.js'
import 'chartjs-adapter-dayjs'

// Import utilities
import { tailwindConfig, formatValue } from '../../../utils/Utils'

Chart.register(BarController, BarElement, LinearScale, TimeScale, Tooltip, Legend)

export default {
  name: 'BarChart05',
  props: ['data', 'width', 'height'],
  setup(props) {

    const canvas = ref(null)
    const legend = ref(null)
    let chart = null
    
    onMounted(() => {
      const ctx = canvas.value
      chart = new Chart(ctx, {
        type: 'bar',
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
              grid: {
                drawBorder: false,
              },
              ticks: {
                maxTicksLimit: 5,
                callback: (value) => formatValue(value),
              },
            },
            x: {
              type: 'time',
              time: {
                parser: 'MM-DD-YYYY',
                unit: 'month',
                displayFormats: {
                  month: 'MMM YY',
                },
              },
              grid: {
                display: false,
                drawBorder: false,
              },
            },
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                title: () => false, // Disable tooltip title
                label: (context) => formatValue(context.parsed.y),
              },
            },
          },
          interaction: {
            intersect: false,
            mode: 'nearest',
          },
          animation: {
            duration: 500,
          },
          maintainAspectRatio: false,
          resizeDelay: 200,
        },
        plugins: [{
          id: 'htmlLegend',
          afterUpdate(c, args, options) {
            const ul = legend.value
            if (!ul) return
            // Remove old legend items
            while (ul.firstChild) {
              ul.firstChild.remove()
            }
            // Reuse the built-in legendItems generator
            const items = c.options.plugins.legend.labels.generateLabels(c)
            items.forEach((item) => {
              const li = document.createElement('li')
              li.style.marginRight = tailwindConfig().theme.margin[4]
              // Button element
              const button = document.createElement('button')
              button.style.display = 'inline-flex'
              button.style.alignItems = 'center'
              button.style.opacity = item.hidden ? '.3' : ''
              button.onclick = () => {
                c.setDatasetVisibility(item.datasetIndex, !c.isDatasetVisible(item.datasetIndex))
                c.update()
              }
              // Color box
              const box = document.createElement('span')
              box.style.display = 'block'
              box.style.width = tailwindConfig().theme.width[3]
              box.style.height = tailwindConfig().theme.height[3]
              box.style.borderRadius = tailwindConfig().theme.borderRadius.full
              box.style.marginRight = tailwindConfig().theme.margin[2]
              box.style.borderWidth = '3px'
              box.style.borderColor = item.fillStyle
              box.style.pointerEvents = 'none'
              // Label
              const label = document.createElement('span')
              label.style.color = tailwindConfig().theme.colors.slate[500]
              label.style.fontSize = tailwindConfig().theme.fontSize.sm[0]
              label.style.lineHeight = tailwindConfig().theme.fontSize.sm[1].lineHeight
              const labelText = document.createTextNode(item.text)
              label.appendChild(labelText)
              li.appendChild(button)
              button.appendChild(box)
              button.appendChild(label)
              ul.appendChild(li)
            })
          },
        }],        
      })
    })

    onUnmounted(() => chart.destroy())

    return {
      canvas,
      legend,
    }
  }
}
</script>