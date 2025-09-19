import { useDark } from '@vueuse/core'

/**
 * Creates a custom Chart.js tooltip with smart positioning and scrollable content
 * @param context Chart.js tooltip context
 */
export function createCustomTooltip(context: any) {
  const { chart, tooltip } = context
  const { canvas } = chart
  const isDark = useDark()

  // Get or create tooltip element
  let tooltipEl = chart.canvas.parentNode.querySelector('.chartjs-tooltip')
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
    chart.canvas.parentNode.appendChild(tooltipEl)
  }

  // Hide if no tooltip
  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = '0'
    return
  }

  // Set content
  if (tooltip.body) {
    const titleLines = tooltip.title || []
    const bodyLines = tooltip.body.map((b: any) => b.lines)

    // Create an array of items with their values, colors, and labels
    const items = bodyLines.map((body: any, i: number) => {
      // Extract the numeric value from the label (format: "value - Label")
      const match = body[0]?.match(/^(\d+(?:\.\d+)?)/)
      const value = match ? Number.parseFloat(match[1]) : 0

      return {
        body,
        value,
        colors: tooltip.labelColors[i],
      }
    })

    // Sort by value in descending order (highest to lowest)
    items.sort((a, b) => b.value - a.value)

    const titleColor = isDark.value ? '#e5e7eb' : '#374151'
    let innerHtml = '<div style="padding: 12px;">'

    // Add title
    if (titleLines.length) {
      innerHtml += `<div style="font-weight: 600; margin-bottom: 8px; color: ${titleColor};">${titleLines[0]}</div>`
    }

    // Add body with scrollable content (now sorted)
    innerHtml += '<div style="max-height: 40vh; overflow-y: auto;">'
    items.forEach((item) => {
      const colorIndicator = `<div style="width: 12px; height: 12px; background-color: ${item.colors.backgroundColor}; border: 1px solid ${item.colors.borderColor}; border-radius: 2px; margin-right: 8px; flex-shrink: 0;"></div>`
      const textContent = `<span style="font-size: 11px;">${item.body}</span>`

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
 * Creates tooltip configuration for Chart.js options
 * @param hasMultipleDatasets Whether the chart has multiple datasets (apps)
 * @returns Chart.js tooltip configuration object
 */
export function createTooltipConfig(hasMultipleDatasets: boolean) {
  return {
    mode: 'index' as const,
    intersect: false,
    position: 'nearest' as const,
    external: hasMultipleDatasets ? createCustomTooltip : undefined,
    enabled: !hasMultipleDatasets, // Disable default tooltip when using custom
    callbacks: {
      title(tooltipItems: any) {
        // Format the title to show "Day X" instead of just the number
        const day = tooltipItems[0].label
        return `Day ${day}`
      },
      label(context: any) {
        if (hasMultipleDatasets) {
          // Format as "value - label" for better readability
          return `${context.parsed.y} - ${context.dataset.label}`
        }
        // For single dataset, use default formatting
        return undefined
      },
    },
  }
}
