import dayjs from 'dayjs'
import { i18n } from '~/modules/i18n'

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
  if (!date)
    return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(getAppLocale())
}

/**
 * Format a date with month name and day using the app's locale (e.g., "December 15" in English, "15 décembre" in French)
 */
export function formatLocalDateLong(date: Date | string | undefined | null): string {
  if (!date)
    return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(getAppLocale(), { month: 'long', day: 'numeric' })
}

export function formatDate(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export function formatDateCH(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export function convertAllDatesToCH(obj: any) {
  // look in all objects for dates fields ( created_at or updated_at ) and convert them if need
  const datesFields = ['created_at', 'updated_at']
  const newObj = { ...obj }
  datesFields.forEach((field) => {
    if (newObj[field])
      newObj[field] = formatDateCH(newObj[field])
  })
  return newObj
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

export const DAY_IN_MS = 24 * 60 * 60 * 1000

export function enumerateDates(startDate: Date, endDate: Date) {
  const start = normalizeToStartOfDay(startDate)
  const end = normalizeToStartOfDay(endDate)

  if (start.getTime() > end.getTime())
    return []

  const dates: Date[] = []
  let cursor = start
  while (cursor.getTime() <= end.getTime()) {
    dates.push(new Date(cursor))
    cursor = new Date(cursor.getTime() + DAY_IN_MS)
  }

  return dates
}

export function enumerateDayNumbers(startDate: Date, endDate: Date) {
  return enumerateDates(startDate, endDate).map(date => date.getDate())
}

export function getDayNumbers(startDate: Date, endDate: Date) {
  const dayNumbers = []
  const currentDate = new Date(startDate)
  while (currentDate.getTime() <= endDate.getTime()) {
    dayNumbers.push(currentDate.getDate())
    currentDate.setDate(currentDate.getDate() + 1)
  }
  return dayNumbers
}

export function getChartDateRange(useBillingPeriod: boolean, billingStart?: Date | string | null, billingEnd?: Date | string | null) {
  if (useBillingPeriod) {
    const startDate = new Date(billingStart ?? new Date())
    const endDate = new Date(billingEnd ?? new Date())
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
  if (!useBillingPeriod) {
    // Last 30 days mode - generate actual dates
    const today = new Date()
    const dates = []
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      dates.push(date.getDate())
    }
    return dates
  }

  // Billing period mode - use the actual billing period end date
  return getDayNumbers(startDate, endDate)
}

export function generateMonthDays(useBillingPeriod: boolean, cycleStart: Date, cycleEnd: Date) {
  if (!useBillingPeriod) {
    // Last 30 days mode - generate actual dates
    const today = new Date()
    const dates = []
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      dates.push(date.getDate())
    }
    return dates
  }

  // Billing period mode - use the actual billing cycle end date
  return getDayNumbers(cycleStart, cycleEnd)
}
