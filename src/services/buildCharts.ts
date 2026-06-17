// Shared helpers for the per-app build charts (Builds by status + Build time).
// Mirrors the date-window / billing-period / series-transform logic used by the
// existing dashboard cards (e.g. DeploymentStatsCard / DeploymentStatsChart) so
// the two build chart components and their cards stay consistent.

const DAY_IN_MS = 1000 * 60 * 60 * 24
export const WINDOW_DAYS = 30

export const BUILD_SERIES_KEYS = ['ios_succeeded', 'android_succeeded', 'ios_failed', 'android_failed'] as const
export type BuildSeriesKey = typeof BUILD_SERIES_KEYS[number]
export type BuildSeriesData = Record<BuildSeriesKey, number[]>

export function emptyBuildSeries(length: number = WINDOW_DAYS): BuildSeriesData {
  return {
    ios_succeeded: Array.from({ length }).fill(0) as number[],
    android_succeeded: Array.from({ length }).fill(0) as number[],
    ios_failed: Array.from({ length }).fill(0) as number[],
    android_failed: Array.from({ length }).fill(0) as number[],
  }
}

// Map a build_requests.status into a terminal outcome. Returns null for builds
// that are still in flight (pending/running) or unknown — they are not counted
// in the succeeded/failed breakdown.
export function bucketBuildStatus(status: string | null | undefined): 'succeeded' | 'failed' | null {
  switch (status) {
    case 'succeeded':
    case 'completed':
      return 'succeeded'
    case 'failed':
    case 'cancelled':
    case 'expired':
      return 'failed'
    default:
      return null
  }
}

// Resolve the {platform}_{outcome} series key, or null for unsupported platforms.
export function buildSeriesKey(platform: string | null | undefined, outcome: 'succeeded' | 'failed'): BuildSeriesKey | null {
  if (platform === 'ios')
    return outcome === 'succeeded' ? 'ios_succeeded' : 'ios_failed'
  if (platform === 'android')
    return outcome === 'succeeded' ? 'android_succeeded' : 'android_failed'
  return null
}

// 30-day window aligned to local midnight (matches existing cards).
export function getLast30DaysWindow() {
  const last30DaysEnd = new Date()
  const last30DaysStart = new Date()
  last30DaysStart.setDate(last30DaysStart.getDate() - (WINDOW_DAYS - 1))
  last30DaysStart.setHours(0, 0, 0, 0)
  last30DaysEnd.setHours(23, 59, 59, 999)
  return { last30DaysStart, last30DaysEnd }
}

export function dayIndexInWindow(date: Date, windowStart: Date): number {
  return Math.floor((date.getTime() - windowStart.getTime()) / DAY_IN_MS)
}

// Map a 30-day series onto the current billing period. Copied from the existing
// dashboard cards so build charts align to the billing cycle identically.
export function filterToBillingPeriod(fullData: number[], last30DaysStart: Date, billingStart: Date): number[] {
  const currentDate = new Date()

  let currentBillingDay: number
  if (billingStart.getDate() === 1) {
    currentBillingDay = currentDate.getDate()
  }
  else {
    const billingStartDay = billingStart.getDate()
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    currentBillingDay = (currentDate.getDate() - billingStartDay + 1 + daysInMonth) % daysInMonth
    if (currentBillingDay === 0)
      currentBillingDay = daysInMonth
  }

  const billingData = Array.from({ length: currentBillingDay }).fill(0) as number[]
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const dataDate = new Date(last30DaysStart)
    dataDate.setDate(dataDate.getDate() + i)
    if (dataDate >= billingStart && dataDate <= currentDate) {
      const billingIndex = Math.floor((dataDate.getTime() - billingStart.getTime()) / DAY_IN_MS)
      if (billingIndex >= 0 && billingIndex < currentBillingDay)
        billingData[billingIndex] = fullData[i]
    }
  }
  return billingData
}

// Percentage change between the last two non-zero days of a series.
export function computeLastDayEvolution(series: number[]): number {
  const nonZeroDays = series.filter(count => count > 0)
  if (nonZeroDays.length < 2)
    return 0
  const lastDayCount = nonZeroDays[nonZeroDays.length - 1]
  const previousDayCount = nonZeroDays[nonZeroDays.length - 2]
  return previousDayCount > 0 ? ((lastDayCount - previousDayCount) / previousDayCount) * 100 : 0
}

// Index of "today" within the rendered labels (so future billing-period days
// stay empty). Mirrors DeploymentStatsChart.getTodayLimit.
export function getTodayLimit(labelCount: number, useBillingPeriod: boolean, cycleStart: Date, cycleEnd: Date): number {
  if (!useBillingPeriod)
    return labelCount - 1

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (cycleEnd <= today)
    return labelCount - 1

  const diff = Math.floor((today.getTime() - cycleStart.getTime()) / DAY_IN_MS)
  if (Number.isNaN(diff) || diff < 0)
    return -1

  return Math.min(diff, labelCount - 1)
}

// Turn a raw per-day series into chart display values (daily or cumulative),
// stopping at `limitIndex`. Mirrors DeploymentStatsChart.transformSeries.
export function transformSeries(source: number[], accumulated: boolean, labelCount: number, limitIndex: number) {
  const display: Array<number | null> = Array.from({ length: labelCount }).fill(null) as Array<number | null>
  const base: Array<number | null> = Array.from({ length: labelCount }).fill(null) as Array<number | null>

  const safeLimit = Math.min(limitIndex, labelCount - 1)
  if (safeLimit < 0)
    return { display, base }

  let runningTotal = 0
  for (let index = 0; index <= safeLimit; index++) {
    const hasValue = index < source.length && typeof source[index] === 'number' && Number.isFinite(source[index])
    const numericValue = hasValue ? source[index] as number : 0

    base[index] = numericValue
    if (accumulated) {
      runningTotal += numericValue
      display[index] = runningTotal
    }
    else {
      display[index] = numericValue
    }
  }

  return { display, base }
}
