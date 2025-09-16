export interface AnnotationOptions {
  line_?: {
    yMin: number
    yMax: number
    borderColor: string
    borderWidth: number
  }
  label_?: {
    xValue: number
    yValue: number
    backgroundColor: string
    content: string[]
    borderWidth: number
    font: {
      size: number
    }
    color?: string
  }
}

export const inlineAnnotationPlugin = {
  id: 'inlineAnnotationPlugin',
  afterDraw: (chart: any, args: any, options: AnnotationOptions) => {
    const { ctx, chartArea } = chart
    const { left, right } = chartArea

    Object.entries(options).forEach(([key, val]) => {
      if (key.startsWith('line_')) {
        const { yMin, borderColor, borderWidth } = val
        const yScale = chart.scales.y
        const y = yScale.getPixelForValue(yMin)

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(left, y) // Start the line at the left edge of the chart area
        ctx.lineTo(right, y) // End the line at the right edge of the chart area
        ctx.lineTo(chart.width, y)
        ctx.lineWidth = borderWidth
        ctx.strokeStyle = borderColor
        ctx.stroke()
        ctx.restore()
      }

      if (key.startsWith('label_')) {
        const { xValue, yValue, backgroundColor, content, font, color } = val
        const xScale = chart.scales.x
        const yScale = chart.scales.y
        const x = xScale.getPixelForValue(xValue)
        const y = yScale.getPixelForValue(yValue)

        const labelWidth = ctx.measureText(content[0]).width + 10
        const labelHeight = font.size + 6

        ctx.save()
        ctx.fillStyle = backgroundColor
        ctx.fillRect(x - labelWidth / 2, y - labelHeight / 2, labelWidth, labelHeight)
        ctx.restore()

        ctx.save()
        ctx.fillStyle = color ?? '#000'
        ctx.font = `${font.size}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(content[0], x, y)
        ctx.restore()
      }
    })
  },
}
