<template>
  <div class="grow flex flex-col justify-center">
    <div>
      <canvas ref="canvas" :data="data" :width="width" :height="height"></canvas>
    </div>
    <div class="px-5 py-4">
      <ul ref="legend" class="flex flex-wrap justify-center -m-1"></ul>
    </div>
  </div>  
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Chart, PieController, ArcElement, TimeScale, Tooltip,
} from 'chart.js'
import 'chartjs-adapter-dayjs'

// Import utilities
import { tailwindConfig } from '../../../utils/Utils'

Chart.register(PieController, ArcElement, TimeScale, Tooltip)

export default {
  name: 'PieChart',
  props: ['data', 'width', 'height'],
  setup(props) {

    const canvas = ref(null)
    const legend = ref(null)
    let chart = null
    
    onMounted(() => {
      const ctx = canvas.value
      chart = new Chart(ctx, {
        type: 'pie',
        data: props.data,
        options: {
          layout: {
            padding: {
              top: 4,
              bottom: 4,
              left: 24,
              right: 24,
            },
          },
          plugins: {
            legend: {
              display: false,
            },
          },
          interaction: {
            intersect: false,
            mode: 'nearest',
          },
          animation: {
            duration: 200,
          },
          maintainAspectRatio: false,
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
              li.style.margin = tailwindConfig().theme.margin[1.5]
              // Button element
              const button = document.createElement('button')
              button.style.display = 'inline-flex'
              button.style.alignItems = 'center'
              button.style.opacity = item.hidden ? '.3' : ''
              button.onclick = () => {
                c.toggleDataVisibility(item.index, !item.index)
                c.update()
              }
              // Color box
              const box = document.createElement('span')
              box.style.display = 'block'
              box.style.width = tailwindConfig().theme.width[3]
              box.style.height = tailwindConfig().theme.height[3]
              box.style.borderRadius = tailwindConfig().theme.borderRadius.full
              box.style.marginRight = tailwindConfig().theme.margin[1.5]
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