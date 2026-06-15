import { i18n } from '~/modules/i18n'

const ZONELESS_ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDatePreservingUtc(date: Date | string | undefined | null): Date | null {
  if (!date)
    return null

  if (date instanceof Date)
    return Number.isNaN(date.getTime()) ? null : date

  const dateOnlyMatch = DATE_ONLY_RE.exec(date)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    const parsedYear = Number(year)
    const parsedMonth = Number(month)
    const parsedDay = Number(day)
    const parsed = new Date(parsedYear, parsedMonth - 1, parsedDay)
    if (
      Number.isNaN(parsed.getTime())
      || parsed.getFullYear() !== parsedYear
      || parsed.getMonth() !== parsedMonth - 1
      || parsed.getDate() !== parsedDay
    ) {
      return null
    }
    return parsed
  }

  const normalized = ZONELESS_ISO_DATETIME_RE.test(date) ? `${date}Z` : date
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Get the current app locale for date formatting
 */
function getAppLocale(): string {
  return i18n.global.locale.value || 'en'
}

/**
 * Format a date using the app's locale (e.g., "12/15/2025" in English, "15/12/2025" in French)
 */
export function formatLocalDate(date: Date | string | undefined | null): string {
  const d = parseDatePreservingUtc(date)
  if (!d)
    return ''
  return d.toLocaleDateString(getAppLocale())
}

/**
 * Format a date with month name and day using the app's locale (e.g., "December 15" in English, "15 décembre" in French)
 */
export function formatLocalDateLong(date: Date | string | undefined | null): string {
  const d = parseDatePreservingUtc(date)
  if (!d)
    return ''
  return d.toLocaleDateString(getAppLocale(), { month: 'long', day: 'numeric' })
}

/**
 * Format a compact date for dense chart axes using the app's locale (e.g., "Dec 15" in English, "15 déc." in French)
 */
export function formatLocalDateShort(date: Date | string | undefined | null): string {
  const d = parseDatePreservingUtc(date)
  if (!d)
    return ''
  return d.toLocaleDateString(getAppLocale(), { month: 'short', day: 'numeric' })
}

/**
 * Format a month/year bucket using the app's locale (e.g., "Dec 2025" in English, "déc. 2025" in French)
 */
export function formatLocalMonthYear(date: Date | string | undefined | null): string {
  const d = parseDatePreservingUtc(date)
  if (!d)
    return ''
  return d.toLocaleDateString(getAppLocale(), { month: 'short', year: 'numeric' })
}

/**
 * Format a date/time using the app's locale (e.g., "Dec 15, 2025, 3:45 PM" in English)
 */
export function formatLocalDateTime(date: Date | string | undefined | null): string {
  const d = parseDatePreservingUtc(date)
  if (!d)
    return ''
  return d.toLocaleString(getAppLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatUtcDateTimeAsLocal(date: Date | string | undefined | null): string {
  return formatLocalDateTime(date)
}

export function formatDate(date: string | undefined) {
  return formatLocalDateTime(date)
}

export function getDaysInCurrentMonth() {
  const date = new Date()

  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate()
}

export function getCurrentDayMonth() {
  const date = new Date()

  return date.getDate()
}

export function normalizeToStartOfDay(date: Date) {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function getDatesInRange(startDate: Date, endDate: Date) {
  const dates = []
  const currentDate = normalizeToStartOfDay(startDate)
  const normalizedEndDate = normalizeToStartOfDay(endDate)

  while (currentDate.getTime() <= normalizedEndDate.getTime()) {
    dates.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return dates
}

export function getChartDateRange(useBillingPeriod: boolean, billingStart?: Date | string | null, billingEnd?: Date | string | null) {
  if (useBillingPeriod) {
    const startDate = parseDatePreservingUtc(billingStart) ?? new Date()
    const endDate = parseDatePreservingUtc(billingEnd) ?? new Date()
    startDate.setHours(0, 0, 0, 0)
    endDate.setHours(0, 0, 0, 0)
    return { startDate, endDate }
  }

  const endDate = normalizeToStartOfDay(new Date())
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 29)
  return { startDate, endDate }
}

export function generateChartDayLabels(useBillingPeriod: boolean, startDate: Date, endDate: Date) {
  const { startDate: rangeStart, endDate: rangeEnd } = useBillingPeriod
    ? { startDate, endDate }
    : getChartDateRange(false)

  return getDatesInRange(rangeStart, rangeEnd).map(formatLocalDateShort)
}

export function generateMonthDays(useBillingPeriod: boolean, cycleStart: Date, cycleEnd: Date) {
  const { startDate, endDate } = useBillingPeriod
    ? { startDate: cycleStart, endDate: cycleEnd }
    : getChartDateRange(false)

  return getDatesInRange(startDate, endDate).map(formatLocalDateShort)
}

/**
 * Format a date as a relative time string (e.g., "2 hours ago", "3 days ago")
 */
export function formatDistanceToNow(date: Date | string | undefined | null): string {
  if (!date)
    return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime()))
    return ''

  const now = new Date()
  const diffInMs = now.getTime() - d.getTime()
  const diffInSeconds = Math.floor(diffInMs / 1000)
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  const diffInHours = Math.floor(diffInMinutes / 60)
  const diffInDays = Math.floor(diffInHours / 24)

  if (diffInSeconds < 60) {
    return i18n.global.t('just-now')
  }
  else if (diffInMinutes < 60) {
    return i18n.global.t('minutes-ago', { count: diffInMinutes })
  }
  else if (diffInHours < 24) {
    return i18n.global.t('hours-ago', { count: diffInHours })
  }
  else if (diffInDays < 30) {
    return i18n.global.t('days-ago', { count: diffInDays })
  }
  else {
    return formatLocalDate(d)
  }
}
