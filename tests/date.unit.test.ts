import { describe, expect, it } from 'vitest'
import { i18n } from '../src/modules/i18n'
import {
  formatLocalDate,
  formatLocalDateShort,
  formatLocalDateTime,
  formatLocalMonthYear,
  formatUtcDateTimeAsLocal,
  generateChartDayLabels,
  generateMonthDays,
} from '../src/services/date'

describe('date helpers', () => {
  it.concurrent('treats zone-less UTC stats timestamps as UTC before local formatting', () => {
    const expected = formatLocalDateTime(new Date('2026-04-22T20:22:00Z'))

    expect(formatUtcDateTimeAsLocal('2026-04-22T20:22:00')).toBe(expected)
    expect(formatUtcDateTimeAsLocal('2026-04-22T20:22:00Z')).toBe(expected)
  })

  it.concurrent('keeps local date-time formatting consistent for zone-less UTC inputs', () => {
    expect(formatLocalDateTime('2026-04-22T20:22:00')).toBe(formatLocalDateTime('2026-04-22T20:22:00Z'))
  })

  it.concurrent('keeps date-only inputs on the same calendar day', () => {
    const expected = formatLocalDate(new Date(2026, 3, 22))

    expect(formatLocalDate('2026-04-22')).toBe(expected)
  })

  it.concurrent('returns an empty string for invalid UTC timestamp inputs', () => {
    expect(formatUtcDateTimeAsLocal('not-a-date')).toBe('')
    expect(formatLocalDate('2026-02-31')).toBe('')
  })

  it.concurrent('formats month buckets with localized month names', () => {
    const date = new Date('2026-04-15T12:00:00Z')
    const expected = new Intl.DateTimeFormat(i18n.global.locale.value || 'en', { month: 'short', year: 'numeric' }).format(date)

    expect(formatLocalMonthYear(date)).toBe(expected)
  })

  it.concurrent('generates localized labels for chart date ranges', () => {
    const startDate = new Date(2026, 0, 31)
    const endDate = new Date(2026, 1, 2)

    expect(generateChartDayLabels(true, startDate, endDate)).toEqual([
      formatLocalDateShort(startDate),
      formatLocalDateShort(new Date(2026, 1, 1)),
      formatLocalDateShort(endDate),
    ])
  })

  it.concurrent('generates localized labels for billing-cycle charts', () => {
    const cycleStart = new Date(2026, 2, 30)
    const cycleEnd = new Date(2026, 3, 1)

    expect(generateMonthDays(true, cycleStart, cycleEnd)).toEqual([
      formatLocalDateShort(cycleStart),
      formatLocalDateShort(new Date(2026, 2, 31)),
      formatLocalDateShort(cycleEnd),
    ])
  })
})
