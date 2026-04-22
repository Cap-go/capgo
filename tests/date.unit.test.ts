import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { formatLocalDateTime, formatUtcDateTimeAsLocal } from '../src/services/date'

describe('date helpers', () => {
  it.concurrent('treats zone-less UTC stats timestamps as UTC before local formatting', () => {
    const expected = dayjs(new Date('2026-04-22T20:22:00Z')).format('MMMM D, YYYY HH:mm')

    expect(formatUtcDateTimeAsLocal('2026-04-22T20:22:00')).toBe(expected)
    expect(formatUtcDateTimeAsLocal('2026-04-22T20:22:00Z')).toBe(expected)
  })

  it.concurrent('keeps local date-time formatting consistent for zone-less UTC inputs', () => {
    expect(formatLocalDateTime('2026-04-22T20:22:00')).toBe(formatLocalDateTime('2026-04-22T20:22:00Z'))
  })

  it.concurrent('returns an empty string for invalid UTC timestamp inputs', () => {
    expect(formatUtcDateTimeAsLocal('not-a-date')).toBe('')
  })
})
