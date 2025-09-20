import type { Chart, TooltipItem as ChartTooltipItem, TooltipLabelStyle, TooltipModel } from 'chart.js'
import { useDark } from '@vueuse/core'

const registeredCharts = new Set<Chart>()
const canvasListeners = new WeakMap<HTMLCanvasElement, {
  mouseleave: EventListener
  touchend: EventListener
  touchcancel: EventListener
}>()

let globalDismissListener: ((event: Event) => void) | null = null

function hideTooltip(chart: Chart) {
  const tooltip = chart.tooltip
  if (tooltip) {
    tooltip.setActiveElements([], { x: 0, y: 0 })
    chart.update('none')
  }

  const tooltipEl = chart.canvas.parentNode?.querySelector('.chartjs-tooltip') as HTMLElement | null
  if (tooltipEl)
    tooltipEl.style.opacity = '0'
}

function ensureCanvasListeners(chart: Chart) {
  const canvas = chart.canvas
  if (!canvas || canvasListeners.has(canvas))
    return

  const onMouseLeave: EventListener = () => hideTooltip(chart)
  const onTouchEnd: EventListener = () => hideTooltip(chart)
  const onTouchCancel: EventListener = () => hideTooltip(chart)

  canvas.addEventListener('mouseleave', onMouseLeave)
  canvas.addEventListener('touchend', onTouchEnd)
  canvas.addEventListener('touchcancel', onTouchCancel)

  canvasListeners.set(canvas, {
    mouseleave: onMouseLeave,
    touchend: onTouchEnd,
    touchcancel: onTouchCancel,
  })
}

function detachCanvasListeners(chart: Chart) {
  const canvas = chart.canvas
  if (!canvas)
    return
  const listeners = canvasListeners.get(canvas)
  if (!listeners)
    return

  canvas.removeEventListener('mouseleave', listeners.mouseleave)
  canvas.removeEventListener('touchend', listeners.touchend)
  canvas.removeEventListener('touchcancel', listeners.touchcancel)
  canvasListeners.delete(canvas)
}

function ensureGlobalDismissListener() {
  if (typeof window === 'undefined' || globalDismissListener)
    return

  globalDismissListener = (event: Event) => {
    const target = event.target as HTMLElement | null
    if (!target)
      return

    if (target.closest('.chartjs-tooltip'))
      return

    for (const chart of registeredCharts) {
      const canvas = chart.canvas
      if (canvas && (canvas === target || canvas.contains(target)))
        return
    }

    for (const chart of registeredCharts)
      hideTooltip(chart)
  }

  document.addEventListener('touchstart', globalDismissListener)
  document.addEventListener('click', globalDismissListener)
}

function removeGlobalDismissListener() {
  if (typeof window === 'undefined' || !globalDismissListener)
    return

  document.removeEventListener('touchstart', globalDismissListener)
  document.removeEventListener('click', globalDismissListener)
  globalDismissListener = null
}

interface TooltipContext {
  chart: Chart
  tooltip: TooltipModel<'bar' | 'line'>
}

interface ProcessedTooltipItem {
  body: string[]
  value: number
  colors: TooltipLabelStyle
}

/**
 * Creates a custom Chart.js tooltip with smart positioning and scrollable content
 * @param context Chart.js tooltip context
 * @param isAccumulated Whether the chart is in accumulated mode
 * @param hasMultipleDatasets Whether the chart has multiple datasets (apps)
 */
export function createCustomTooltip(context: TooltipContext, isAccumulated: boolean = false, hasMultipleDatasets: boolean = true) {
  const { chart, tooltip } = context
  const { canvas } = chart
  const isDark = useDark()

  // Get or create tooltip element
  let tooltipEl = chart.canvas.parentNode?.querySelector('.chartjs-tooltip') as HTMLElement | null
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'chartjs-tooltip'
    tooltipEl.style.opacity = '0'
    tooltipEl.style.position = 'absolute'
    tooltipEl.style.background = isDark.value ? 'rgba(17, 24, 39, 0.97)' : 'rgba(255, 255, 255, 1)'
    tooltipEl.style.backdropFilter = 'blur(12px)'
    tooltipEl.style.borderRadius = '8px'
    tooltipEl.style.color = isDark.value ? 'white' : 'black'
    tooltipEl.style.border = isDark.value ? '1px solid rgba(55, 65, 81, 0.6)' : '1px solid rgba(209, 213, 219, 0.8)'
    tooltipEl.style.pointerEvents = 'none'
    tooltipEl.style.transform = 'translate(-50%, 0)'
    tooltipEl.style.transition = 'all .1s ease'
    tooltipEl.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)'
    tooltipEl.style.zIndex = '1000'
    tooltipEl.style.fontSize = '12px'
    tooltipEl.style.maxHeight = '60vh'
    tooltipEl.style.overflowY = 'auto'
    tooltipEl.style.minWidth = '200px'
    tooltipEl.style.maxWidth = '300px'
    chart.canvas.parentNode?.appendChild(tooltipEl)
  }

  // Hide if no tooltip
  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = '0'
    return
  }

  // Set content
  if (tooltip.body) {
    const titleLines = tooltip.title || []
    const bodyLines = tooltip.body.map(b => b.lines)

    // Create an array of items with their values, colors, and labels
    const items: ProcessedTooltipItem[] = bodyLines.map((body: string[], i: number) => {
      // Extract the numeric value from the label (format: "value - Label")
      const bodyText = body[0] || ''
      const match = bodyText.match(/^(\d+(?:\.\d+)?)/)
      const value = match ? Number.parseFloat(match[1]) : 0

      return {
        body,
        value,
        colors: tooltip.labelColors[i],
      }
    }).filter(item => item.value !== 0) // Filter out zero values

    // Sort by value in descending order (highest to lowest)
    items.sort((a, b) => b.value - a.value)

    // Calculate total value based on mode - matching UsageCard logic
    let totalValue: number
    const isSingleApp = !hasMultipleDatasets

    if (isSingleApp) {
      if (isAccumulated) {
        // Single app cumulative mode: for the tooltip at a specific point,
        // we show the accumulated value at that point (which is already calculated in the data)
        const cumulativeValues = tooltip.dataPoints?.map((point: any) => point.parsed.y) || []
        totalValue = cumulativeValues.length > 0 ? cumulativeValues[0] : 0
      }
      else {
        // Single app daily mode: show the raw daily value
        totalValue = items.reduce((sum, item) => sum + item.value, 0)
      }
    }
    else {
      // Multi-app view
      if (isAccumulated) {
        // Multi-app cumulative mode: sum all accumulated values from all apps
        const cumulativeValues = tooltip.dataPoints?.map((point: any) => point.parsed.y) || []
        totalValue = cumulativeValues.reduce((sum: number, val: number) => sum + (Number.isNaN(val) ? 0 : val), 0)
      }
      else {
        // Multi-app daily mode: sum all daily values from different apps
        totalValue = items.reduce((sum, item) => sum + item.value, 0)
      }
    }

    const titleColor = isDark.value ? '#e5e7eb' : '#374151'
    const totalColor = isDark.value ? '#60a5fa' : '#2563eb'
    let innerHtml = '<div style="padding: 12px;">'

    // Add title
    if (titleLines.length) {
      innerHtml += `<div style="font-weight: 600; margin-bottom: 4px; color: ${titleColor};">${titleLines[0]}</div>`
    }

    // Add total value
    if (items.length > 1) {
      innerHtml += `<div style="font-weight: 600; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid ${isDark.value ? 'rgba(75, 85, 99, 0.3)' : 'rgba(209, 213, 219, 0.3)'}; color: ${totalColor};">Total: ${totalValue.toLocaleString()}</div>`
    }

    // Add body with scrollable content (now sorted)
    innerHtml += '<div style="max-height: 40vh; overflow-y: auto;">'
    items.forEach((item) => {
      // Convert color to string if it's not already
      const bgColor = typeof item.colors.backgroundColor === 'string' ? item.colors.backgroundColor : '#666'
      const borderColor = typeof item.colors.borderColor === 'string' ? item.colors.borderColor : '#999'

      const colorIndicator = `<div style="width: 12px; height: 12px; background-color: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 2px; margin-right: 8px; flex-shrink: 0;"></div>`
      // Join multiple lines if they exist (for accumulated mode with daily + cumulative)
      const textContent = `<span style="font-size: 11px;">${item.body.join(' ')}</span>`

      innerHtml += `<div style="display: flex; align-items: center; margin-bottom: 4px;">${colorIndicator}${textContent}</div>`
    })
    innerHtml += '</div></div>'

    tooltipEl.innerHTML = innerHtml
  }

  // Position tooltip with smart viewport bounds checking
  positionTooltip(tooltipEl, canvas, tooltip)
}

/**
 * Positions the tooltip element with intelligent viewport bounds checking
 * @param tooltipEl The tooltip DOM element
 * @param canvas The chart canvas element
 * @param tooltip Chart.js tooltip object
 */
function positionTooltip(tooltipEl: HTMLElement, canvas: HTMLCanvasElement, tooltip: any) {
  const canvasPosition = canvas.getBoundingClientRect()
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

  // Calculate preferred position
  let left = canvasPosition.left + scrollLeft + tooltip.caretX
  let top = canvasPosition.top + scrollTop + tooltip.caretY

  // Adjust position to keep tooltip in viewport
  const tooltipRect = tooltipEl.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Horizontal positioning
  if (left + tooltipRect.width / 2 > viewportWidth - 10) {
    left = viewportWidth - tooltipRect.width - 10
    tooltipEl.style.transform = 'translate(0, 0)'
  }
  else if (left - tooltipRect.width / 2 < 10) {
    left = 10
    tooltipEl.style.transform = 'translate(0, 0)'
  }
  else {
    tooltipEl.style.transform = 'translate(-50%, 0)'
  }

  // Vertical positioning
  if (top + tooltipRect.height > scrollTop + viewportHeight - 10) {
    top = canvasPosition.top + scrollTop + tooltip.caretY - tooltipRect.height - 10
  }

  // Apply position
  tooltipEl.style.left = `${left}px`
  tooltipEl.style.top = `${top}px`
  tooltipEl.style.opacity = '1'
}

/**
 * Plugin to draw vertical line at tooltip position
 */
export const verticalLinePlugin = {
  id: 'verticalLine',
  afterDatasetsDraw(chart: Chart) {
    const active = chart.tooltip?.getActiveElements()
    if (chart.tooltip && active && active.length > 0) {
      const activePoint = active[0]
      const ctx = chart.ctx
      const x = activePoint.element.x
      const topY = chart.scales.y.top
      const bottomY = chart.scales.y.bottom

      // Save context state
      ctx.save()

      // Set higher z-index by drawing last
      ctx.globalCompositeOperation = 'source-over'

      // Draw vertical line with more visibility
      ctx.beginPath()
      ctx.moveTo(x, topY)
      ctx.lineTo(x, bottomY)
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)' // White with good opacity
      ctx.setLineDash([8, 4]) // Longer dash pattern for better visibility
      ctx.stroke()

      // Draw a subtle glow effect for better visibility
      ctx.beginPath()
      ctx.moveTo(x, topY)
      ctx.lineTo(x, bottomY)
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)' // Wider, more transparent white glow
      ctx.setLineDash([8, 4])
      ctx.stroke()

      // Restore context state
      ctx.restore()
    }
  },
}

export const tooltipCleanupPlugin = {
  id: 'tooltipCleanup',
  beforeInit(chart: Chart) {
    registeredCharts.add(chart)
    ensureCanvasListeners(chart)
    ensureGlobalDismissListener()
  },
  afterInit(chart: Chart) {
    ensureCanvasListeners(chart)
  },
  afterEvent(chart: Chart, args: { event?: { type?: string } }) {
    const eventType = args.event?.type
    if (eventType === 'mouseout')
      hideTooltip(chart)
  },
  beforeDestroy(chart: Chart) {
    registeredCharts.delete(chart)
    detachCanvasListeners(chart)
    const tooltipEl = chart.canvas.parentNode?.querySelector('.chartjs-tooltip') as HTMLElement | null
    if (tooltipEl)
      tooltipEl.remove()

    if (registeredCharts.size === 0)
      removeGlobalDismissListener()
  },
}

/**
 * Creates tooltip configuration for Chart.js options
 * @param hasMultipleDatasets Whether the chart has multiple datasets (apps)
 * @param isAccumulated Whether the chart is in accumulated/cumulative mode
 * @returns Chart.js tooltip configuration object
 */
export function createTooltipConfig(hasMultipleDatasets: boolean, isAccumulated: boolean = false) {
  return {
    mode: 'index' as const,
    intersect: false,
    position: 'nearest' as const,
    external: hasMultipleDatasets ? (context: TooltipContext) => createCustomTooltip(context, isAccumulated, hasMultipleDatasets) : undefined,
    enabled: !hasMultipleDatasets, // Disable default tooltip when using custom
    callbacks: {
      title(tooltipItems: ChartTooltipItem<any>[]) {
        // Format the title to show "Day X" instead of just the number
        const day = tooltipItems[0].label
        return `Day ${day}`
      },
      label(context: ChartTooltipItem<any>) {
        if (isAccumulated && !hasMultipleDatasets) {
          // For single dataset in accumulated mode, show total
          return `Total: ${context.parsed.y}`
        }
        else if (hasMultipleDatasets) {
          // Format as "value - label" for better readability
          return `${context.parsed.y} - ${context.dataset.label}`
        }
        // For single dataset in daily mode, use default formatting
        return undefined
      },
      afterLabel(context: ChartTooltipItem<any>) {
        // In accumulated mode, show the daily value in parentheses
        if (isAccumulated && context.parsed.y > 0) {
          const dataIndex = context.dataIndex
          const currentValue = context.parsed.y
          const previousValue = dataIndex > 0 ? context.dataset.data[dataIndex - 1] : 0
          const dailyValue = currentValue - previousValue
          return dailyValue > 0 ? `(+${dailyValue} today)` : undefined
        }
        return undefined
      },
    },
  }
}
