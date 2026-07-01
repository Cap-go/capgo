import { describe, expect, it } from 'vitest'
import {
  formatLocalDate,
  formatLocalDateShort,
  formatLocalDateTime,
  formatLocalMonthYear,
  formatUtcDateTimeAsLocal,
  generateChartDayLabels,
  generateMonthDays,
  getDateLocale,
  resolveDateLocale,
} from '../src/services/date'

describe('date helpers', () => {
  it.concurrent('uses day/month/year when no account format is selected', () => {
    const date = new Date(2026, 6, 13)

    expect(getDateLocale()).toBe('en-GB')
    expect(formatLocalDate(date)).toBe(new Intl.DateTimeFormat('en-GB').format(date))
    expect(formatLocalDate(date)).not.toBe(new Intl.DateTimeFormat('en-US').format(date))
  })

  it.concurrent('resolves explicit account date conventions before fallback', () => {
    expect(resolveDateLocale('en-US')).toBe('en-US')
    expect(resolveDateLocale('fr-FR')).toBe('fr-FR')
    expect(resolveDateLocale('not-a-locale')).toBe('en-GB')
  })

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
    const expected = new Intl.DateTimeFormat(getDateLocale(), { month: 'short', year: 'numeric' }).format(date)

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
