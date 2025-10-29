/**
 * Shared Chart.js configuration utilities for consistent styling across all dashboard charts
 */

interface AxisConfig {
  grid?: {
    color: string
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

/**
 * Creates standardized x-axis configuration
 */
export function createXAxisConfig(isDark: boolean, options: { stacked?: boolean } = {}) {
  const config: AxisConfig = {
    grid: {
      color: isDark ? '#323e4e' : '#cad5e2',
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
    tickCallback?: (value: string | number) => string
  } = {},
) {
  const config: AxisConfig = {
    beginAtZero: true,
    grid: {
      color: isDark ? '#424e5f' : '#bfc9d6',
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
    yTickCallback?: (value: string | number) => string
  } = {},
) {
  return {
    x: createXAxisConfig(isDark, { stacked: options.xStacked }),
    y: createYAxisConfig(isDark, {
      stacked: options.yStacked,
      suggestedMax: options.suggestedMax,
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
