import type { Chart, TooltipItem as ChartTooltipItem, TooltipLabelStyle, TooltipModel } from 'chart.js'
import { useDark } from '@vueuse/core'

interface TooltipContext {
  chart: Chart
  tooltip: TooltipModel<'bar' | 'line'>
}

interface ProcessedTooltipItem {
  body: string[]
  value: number
  colors: TooltipLabelStyle
}

function formatTooltipValue(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value))
    return '0'

  const rounded = Number(value.toFixed(1))
  return Number.isInteger(rounded) ? Math.trunc(rounded).toString() : rounded.toFixed(1)
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Calculate the actual date from the chart data index
 * @param dataIndex The index in the chart data array
 * @param dateStartOrUseBillingPeriod Either a Date for billing start, or boolean (false = last 30 days mode)
 */
function getDateFromIndex(dataIndex: number, dateStartOrUseBillingPeriod?: Date | boolean): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (dateStartOrUseBillingPeriod instanceof Date) {
    // Billing period mode: start from billing start date
    const date = new Date(dateStartOrUseBillingPeriod)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + dataIndex)
    return date
  }

  // Last 30 days mode (dateStartOrUseBillingPeriod is false or undefined)
  const date = new Date(today)
  date.setDate(date.getDate() - 29 + dataIndex) // 29 days ago + index
  return date
}

/**
 * Format a date for tooltip display (e.g., "December 10")
 */
function formatDateForTooltip(date: Date): string {
  const monthName = MONTH_NAMES[date.getMonth()]
  const day = date.getDate()
  return `${monthName} ${day}`
}

function getDatasetBaseValue(chart: Chart | undefined, dataset: any, datasetIndex: number, dataIndex: number, parsedY: unknown) {
  const metaValues = Array.isArray(dataset?.metaBaseValues) ? dataset.metaBaseValues as Array<number | null> : null
  if (metaValues) {
    const candidate = metaValues[dataIndex]
    if (typeof candidate === 'number' && Number.isFinite(candidate))
      return candidate
    return null
  }

  if (typeof parsedY !== 'number' || Number.isNaN(parsedY))
    return null

  if (!chart || datasetIndex <= 0)
    return parsedY

  const previousDataset: any = chart.data?.datasets?.[datasetIndex - 1]
  const previousRaw = Array.isArray(previousDataset?.data) ? previousDataset.data[dataIndex] : undefined
  const previousValue = typeof previousRaw === 'number' && Number.isFinite(previousRaw) ? previousRaw : 0
  return parsedY - previousValue
}

/**
 * Creates a custom Chart.js tooltip with smart positioning and scrollable content
 * @param context Chart.js tooltip context
 * @param isAccumulated Whether the chart is in accumulated mode
 * @param hasMultipleDatasets Whether the chart has multiple datasets (apps)
 * @param dateStartOrUseBillingPeriod Either a Date for billing start, or boolean for mode
 */
export function createCustomTooltip(context: TooltipContext, isAccumulated: boolean = false, hasMultipleDatasets: boolean = true, dateStartOrUseBillingPeriod?: Date | boolean) {
  const { chart, tooltip } = context
  const { canvas } = chart
  const isDark = useDark()
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0

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

    // Add touch event listener for mobile to dismiss tooltip
    if (isMobile) {
      const dismissTooltip = (e: TouchEvent) => {
        // Check if the touch is not on the chart canvas
        if (!canvas.contains(e.target as Node)) {
          tooltipEl!.style.opacity = '0'
          chart.setActiveElements([])
          chart.update('none')
        }
      }

      // Store the listener reference to remove it later if needed
      (tooltipEl as any).dismissListener = dismissTooltip
      document.addEventListener('touchstart', dismissTooltip, { passive: true })
    }
  }

  // Clear any existing auto-hide timer
  if ((tooltipEl as any).hideTimer) {
    clearTimeout((tooltipEl as any).hideTimer)
  }

  // Hide if no tooltip
  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = '0'
    return
  }

  // Auto-hide on mobile after 3 seconds
  if (isMobile) {
    (tooltipEl as any).hideTimer = setTimeout(() => {
      tooltipEl.style.opacity = '0'
      // Trigger chart update to clear tooltip
      chart.setActiveElements([])
      chart.update('none')
    }, 3000)
  }

  // Set content
  if (tooltip.body) {
    const dataPoints = tooltip.dataPoints || []

    // Calculate the formatted date title from the data index
    const dataIndex = dataPoints[0]?.dataIndex ?? 0
    const tooltipDate = getDateFromIndex(dataIndex, dateStartOrUseBillingPeriod)
    const formattedTitle = formatDateForTooltip(tooltipDate)

    // Create an array of items with their values, colors, and labels
    const items: ProcessedTooltipItem[] = dataPoints.map((dataPoint, index) => {
      const datasetIndex = dataPoint.datasetIndex ?? 0
      const dataIndex = dataPoint.dataIndex ?? 0
      const dataset = dataPoint.dataset as any
      const baseValue = getDatasetBaseValue(chart, dataset, datasetIndex, dataIndex, dataPoint.parsed?.y)
      const numericValue = typeof baseValue === 'number' && Number.isFinite(baseValue) ? baseValue : 0

      return {
        body: [`${formatTooltipValue(numericValue)} - ${dataset?.label ?? ''}`],
        value: numericValue,
        colors: tooltip.labelColors[index],
      }
    }).filter(item => item.value !== 0)

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
      totalValue = items.reduce((sum, item) => sum + item.value, 0)
    }

    const titleColor = isDark.value ? '#e5e7eb' : '#374151'
    const totalColor = isDark.value ? '#60a5fa' : '#2563eb'
    let innerHtml = '<div style="padding: 12px;">'

    // Add title with formatted date
    innerHtml += `<div style="font-weight: 600; margin-bottom: 4px; color: ${titleColor};">${formattedTitle}</div>`

    // Add total value
    if (items.length > 1) {
      innerHtml += `<div style="font-weight: 600; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid ${isDark.value ? 'rgba(75, 85, 99, 0.3)' : 'rgba(209, 213, 219, 0.3)'}; color: ${totalColor};">Total: ${formatTooltipValue(totalValue)}</div>`
    }

    // Add body with scrollable content (now sorted)
    innerHtml += '<div style="max-height: 40vh; overflow-y: auto;">'
    items.forEach((item) => {
      // Convert color to string if it's not already
      const bgColor = typeof item.colors.backgroundColor === 'string' ? item.colors.backgroundColor : '#666'
      const borderColor = typeof item.colors.borderColor === 'string' ? item.colors.borderColor : '#999'

      const colorIndicator = `<div style="width: 12px; height: 12px; background-color: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 2px; margin-right: 8px; shrink: 0;"></div>`
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
interface VerticalLinePluginOptions {
  color?: string
  glowColor?: string
  lineWidth?: number
  glowWidth?: number
  dash?: number[]
  glowDash?: number[]
}

function isDarkMode() {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
    return true

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
    return window.matchMedia('(prefers-color-scheme: dark)').matches

  return false
}

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
      const pluginOptions = (chart.options?.plugins as any)?.verticalLine as VerticalLinePluginOptions | undefined
      const dark = isDarkMode()

      const lineColor = pluginOptions?.color ?? (dark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(49, 70, 87, 0.6)')
      const glowColor = pluginOptions?.glowColor ?? (dark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(129, 140, 248, 0.25)')
      const lineWidth = pluginOptions?.lineWidth ?? 2
      const glowWidth = pluginOptions?.glowWidth ?? 4
      const dash = pluginOptions?.dash ?? [8, 4]
      const glowDash = pluginOptions?.glowDash ?? dash

      // Save context state
      ctx.save()

      // Set higher z-index by drawing last
      ctx.globalCompositeOperation = 'source-over'

      // Draw vertical line with more visibility
      ctx.beginPath()
      ctx.moveTo(x, topY)
      ctx.lineTo(x, bottomY)
      ctx.lineWidth = lineWidth
      ctx.strokeStyle = lineColor
      ctx.setLineDash(dash)
      ctx.stroke()

      if (glowWidth > 0 && glowColor) {
        // Draw a subtle glow effect for better visibility
        ctx.beginPath()
        ctx.moveTo(x, topY)
        ctx.lineTo(x, bottomY)
        ctx.lineWidth = glowWidth
        ctx.strokeStyle = glowColor
        ctx.setLineDash(glowDash)
        ctx.stroke()
      }

      // Restore context state
      ctx.restore()
    }
  },
}

interface TodayLinePluginOptions {
  enabled?: boolean
  xIndex?: number
  label?: string
  color?: string
  glowColor?: string
  badgeFill?: string
  textColor?: string
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)

  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function resolveScale(chart: Chart, axisId: 'x' | 'y') {
  const scale = (chart.scales as Record<string, any>)[axisId]
  if (scale)
    return scale

  // Fallback to first matching axis for legacy ids
  const fallbackKey = Object.keys(chart.scales).find(key => key.toLowerCase().startsWith(axisId))
  return fallbackKey ? (chart.scales as Record<string, any>)[fallbackKey] : undefined
}

export const todayLinePlugin = {
  id: 'todayLine',
  afterDatasetsDraw(chart: Chart, _args: unknown, pluginOptions?: TodayLinePluginOptions) {
    const options = pluginOptions ?? {}
    if (!options.enabled)
      return

    const xScale = resolveScale(chart, 'x')
    const yScale = resolveScale(chart, 'y')
    if (!xScale || !yScale)
      return

    const index = typeof options.xIndex === 'number' ? options.xIndex : -1
    if (index < 0)
      return

    const x = typeof xScale.getPixelForValue === 'function'
      ? xScale.getPixelForValue(index)
      : undefined

    if (typeof x !== 'number' || Number.isNaN(x))
      return

    const ctx = chart.ctx
    const topY = yScale.top ?? chart.chartArea?.top
    const bottomY = yScale.bottom ?? chart.chartArea?.bottom
    if (typeof topY !== 'number' || typeof bottomY !== 'number')
      return

    const strokeColor = options.color ?? 'rgba(99, 102, 241, 0.6)'
    const glowColor = options.glowColor ?? 'rgba(159, 168, 255, 0.25)'

    ctx.save()
    ctx.globalCompositeOperation = 'source-over'

    ctx.beginPath()
    ctx.moveTo(x, topY)
    ctx.lineTo(x, bottomY)
    ctx.lineWidth = 2
    ctx.strokeStyle = strokeColor
    ctx.setLineDash([8, 4])
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x, topY)
    ctx.lineTo(x, bottomY)
    ctx.lineWidth = 4
    ctx.strokeStyle = glowColor
    ctx.setLineDash([8, 4])
    ctx.stroke()

    ctx.setLineDash([])

    if (options.label) {
      const badgeFill = options.badgeFill ?? 'rgba(199, 210, 254, 0.85)'
      const textColor = options.textColor ?? '#312e81'
      const fontSize = 12
      const paddingX = 10
      const paddingY = 6
      const badgeY = (chart.chartArea?.top ?? topY) + 8

      ctx.font = `${fontSize}px sans-serif`
      const labelWidth = ctx.measureText(options.label).width
      const badgeWidth = labelWidth + paddingX * 2
      const badgeHeight = fontSize + paddingY

      let badgeX = x - badgeWidth / 2
      const chartLeft = chart.chartArea?.left ?? 0
      const chartRight = chart.chartArea?.right ?? chart.width

      if (badgeX < chartLeft + 4)
        badgeX = chartLeft + 4
      if (badgeX + badgeWidth > chartRight - 4)
        badgeX = chartRight - badgeWidth - 4

      drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 6)
      ctx.fillStyle = badgeFill
      ctx.fill()

      ctx.lineWidth = 1
      ctx.strokeStyle = strokeColor
      ctx.stroke()

      ctx.fillStyle = textColor
      ctx.fillText(options.label, badgeX + paddingX, badgeY + badgeHeight - paddingY / 2)
    }

    ctx.restore()
  },
}

/**
 * Creates tooltip configuration for Chart.js options
 * @param hasMultipleDatasets Whether the chart has multiple datasets (apps)
 * @param isAccumulated Whether the chart is in accumulated/cumulative mode
 * @param dateStartOrUseBillingPeriod Either a Date for billing start, or boolean for mode
 * @returns Chart.js tooltip configuration object
 */
export function createTooltipConfig(hasMultipleDatasets: boolean, isAccumulated: boolean = false, dateStartOrUseBillingPeriod?: Date | boolean) {
  return {
    mode: 'index' as const,
    intersect: false,
    position: 'nearest' as const,
    external: hasMultipleDatasets ? (context: TooltipContext) => createCustomTooltip(context, isAccumulated, hasMultipleDatasets, dateStartOrUseBillingPeriod) : undefined,
    enabled: !hasMultipleDatasets, // Disable default tooltip when using custom
    callbacks: {
      title(tooltipItems: ChartTooltipItem<any>[]) {
        // Format the title to show full date like "December 10"
        const dataIndex = tooltipItems[0].dataIndex
        const date = getDateFromIndex(dataIndex, dateStartOrUseBillingPeriod)
        return formatDateForTooltip(date)
      },
      label(context: ChartTooltipItem<any>) {
        if (isAccumulated && !hasMultipleDatasets) {
          // For single dataset in accumulated mode, show total
          return `Total: ${context.parsed.y}`
        }
        else if (hasMultipleDatasets) {
          const datasetIndex = context.datasetIndex ?? 0
          const dataIndex = context.dataIndex ?? 0
          const baseValue = getDatasetBaseValue(context.chart, context.dataset, datasetIndex, dataIndex, context.parsed?.y)
          const numericValue = typeof baseValue === 'number' && Number.isFinite(baseValue) ? baseValue : 0
          return `${formatTooltipValue(numericValue)} - ${context.dataset.label}`
        }
        // For single dataset in daily mode, use default formatting
        return undefined
      },
      afterLabel(context: ChartTooltipItem<any>) {
        // In accumulated mode, show the daily value in parentheses
        if (isAccumulated && !hasMultipleDatasets && context.parsed.y > 0) {
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
