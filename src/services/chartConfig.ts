/**
 * Shared Chart.js configuration utilities for consistent styling across all dashboard charts
 */

interface AxisConfig {
  grid?: {
    color: string
    drawBorder?: boolean
    borderColor?: string
  }
  border?: {
    display?: boolean
    color?: string
  }
  ticks?: {
    color: string
    maxRotation?: number
    autoSkip?: boolean
    callback?: (value: string | number) => string
  }
  beginAtZero?: boolean
  stacked?: boolean
  suggestedMax?: number
  max?: number
}

interface LegendConfig {
  display: boolean
  position?: 'top' | 'bottom' | 'left' | 'right'
  labels?: {
    color: string
    padding?: number
    font?: {
      size?: number
    }
  }
}

interface RgbColor {
  r: number
  g: number
  b: number
}

const MIN_CHART_STROKE_CONTRAST = 3
const LIGHT_CHART_BACKGROUND: RgbColor = { r: 255, g: 255, b: 255 }
const DARK_CHART_BACKGROUND: RgbColor = { r: 15, g: 23, b: 42 }
const LIGHT_COLOR_TARGET: RgbColor = { r: 255, g: 255, b: 255 }
const DARK_COLOR_TARGET: RgbColor = { r: 15, g: 23, b: 42 }

function parseHexColor(color: string): RgbColor | null {
  const normalized = color.trim().replace(/^#/, '')

  if (!/^[\da-f]{3}(?:[\da-f]{3})?$/i.test(normalized))
    return null

  const hex = normalized.length === 3
    ? normalized.split('').map(value => `${value}${value}`).join('')
    : normalized

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function colorChannelToLinear(value: number) {
  const channel = value / 255
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}

function getRelativeLuminance(color: RgbColor) {
  return (0.2126 * colorChannelToLinear(color.r))
    + (0.7152 * colorChannelToLinear(color.g))
    + (0.0722 * colorChannelToLinear(color.b))
}

function getContrastRatio(color: RgbColor, background: RgbColor) {
  const colorLuminance = getRelativeLuminance(color)
  const backgroundLuminance = getRelativeLuminance(background)
  const lighter = Math.max(colorLuminance, backgroundLuminance)
  const darker = Math.min(colorLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

function mixColor(color: RgbColor, target: RgbColor, amount: number): RgbColor {
  return {
    r: Math.round(color.r + ((target.r - color.r) * amount)),
    g: Math.round(color.g + ((target.g - color.g) * amount)),
    b: Math.round(color.b + ((target.b - color.b) * amount)),
  }
}

function toHexPart(value: number) {
  return value.toString(16).padStart(2, '0')
}

function rgbToHex(color: RgbColor) {
  return `#${toHexPart(color.r)}${toHexPart(color.g)}${toHexPart(color.b)}`
}

export function resolveAccessibleChartColor(color: string, isDark: boolean) {
  const parsedColor = parseHexColor(color)

  if (!parsedColor)
    return color

  const background = isDark ? DARK_CHART_BACKGROUND : LIGHT_CHART_BACKGROUND

  if (getContrastRatio(parsedColor, background) >= MIN_CHART_STROKE_CONTRAST)
    return color

  const target = isDark ? LIGHT_COLOR_TARGET : DARK_COLOR_TARGET

  for (let amount = 0.1; amount <= 0.8; amount += 0.1) {
    const adjustedColor = mixColor(parsedColor, target, amount)

    if (getContrastRatio(adjustedColor, background) >= MIN_CHART_STROKE_CONTRAST)
      return rgbToHex(adjustedColor)
  }

  return rgbToHex(mixColor(parsedColor, target, 0.9))
}

export function createChartColorWithOpacity(color: string, opacity: number) {
  const parsedColor = parseHexColor(color)

  if (!parsedColor)
    return color

  return `rgba(${parsedColor.r}, ${parsedColor.g}, ${parsedColor.b}, ${opacity})`
}

/**
 * Creates standardized x-axis configuration
 */
export function createXAxisConfig(isDark: boolean, options: { stacked?: boolean } = {}) {
  const gridColor = isDark ? '#323e4e' : '#cad5e2'
  const config: AxisConfig = {
    grid: {
      color: gridColor,
    },
    // Hide the axis border line (first vertical line) to match grid lines
    border: {
      display: false,
    },
    ticks: {
      color: isDark ? 'white' : 'black',
      maxRotation: 0,
      autoSkip: true,
    },
  }

  if (options.stacked !== undefined) {
    config.stacked = options.stacked
  }

  return config
}

/**
 * Creates standardized y-axis configuration
 */
export function createYAxisConfig(
  isDark: boolean,
  options: {
    stacked?: boolean
    suggestedMax?: number
    max?: number
    tickCallback?: (value: string | number) => string
  } = {},
) {
  const gridColor = isDark ? '#424e5f' : '#bfc9d6'
  const config: AxisConfig = {
    beginAtZero: true,
    grid: {
      color: gridColor,
    },
    // Hide the axis border line (bottom horizontal line) to match grid lines
    border: {
      display: false,
    },
    ticks: {
      color: isDark ? 'white' : 'black',
    },
  }

  if (options.stacked !== undefined) {
    config.stacked = options.stacked
  }

  if (options.suggestedMax !== undefined) {
    config.suggestedMax = options.suggestedMax
  }

  if (options.max !== undefined) {
    config.max = options.max
  }

  if (options.tickCallback) {
    config.ticks!.callback = options.tickCallback
  }

  return config
}

/**
 * Creates chart scales configuration (x and y axes)
 */
export function createChartScales(
  isDark: boolean,
  options: {
    xStacked?: boolean
    yStacked?: boolean
    suggestedMax?: number
    max?: number
    yTickCallback?: (value: string | number) => string
  } = {},
) {
  return {
    x: createXAxisConfig(isDark, { stacked: options.xStacked }),
    y: createYAxisConfig(isDark, {
      stacked: options.yStacked,
      suggestedMax: options.suggestedMax,
      max: options.max,
      tickCallback: options.yTickCallback,
    }),
  }
}

/**
 * Creates stacked chart scales with conditional stacking
 */
export function createStackedChartScales(isDark: boolean, stacked: boolean) {
  return createChartScales(isDark, {
    xStacked: stacked,
    yStacked: stacked,
  })
}

/**
 * Creates standardized legend configuration
 */
export function createLegendConfig(
  isDark: boolean,
  display: boolean,
  options: {
    position?: 'top' | 'bottom' | 'left' | 'right'
    fontSize?: number
    padding?: number
  } = {},
): LegendConfig {
  return {
    display,
    position: options.position ?? 'bottom',
    labels: {
      color: isDark ? 'white' : 'black',
      padding: options.padding ?? 10,
      font: {
        size: options.fontSize ?? 11,
      },
    },
  }
}

/**
 * Creates base chart options with common configuration
 */
export function createBaseChartOptions(
  isDark: boolean,
  options: {
    responsive?: boolean
    maintainAspectRatio?: boolean
    interaction?: any
    scales?: any
    plugins?: any
  } = {},
) {
  return {
    responsive: options.responsive ?? true,
    maintainAspectRatio: options.maintainAspectRatio ?? false,
    interaction: options.interaction ?? {
      mode: 'index' as const,
      intersect: false,
    },
    scales: options.scales,
    plugins: options.plugins,
  }
}
