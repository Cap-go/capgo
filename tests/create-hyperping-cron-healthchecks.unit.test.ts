import { describe, expect, it } from 'vitest'
import { buildHealthcheckPayload } from '../scripts/create_hyperping_cron_healthchecks.ts'

type CronTaskRow = Parameters<typeof buildHealthcheckPayload>[0]

function createCronTaskRow(overrides: Partial<CronTaskRow>): CronTaskRow {
  return {
    batch_size: null,
    description: null,
    enabled: true,
    healthcheck_url: null,
    hour_interval: null,
    id: 1,
    minute_interval: null,
    name: 'test_cron',
    run_at_hour: null,
    run_at_minute: null,
    run_at_second: null,
    run_on_day: null,
    run_on_dow: null,
    second_interval: null,
    target: '["test_queue"]',
    task_type: 'function_queue',
    ...overrides,
  }
}

describe('create_hyperping_cron_healthchecks', () => {
  it.concurrent('uses second-based periods and floors grace to one minute', () => {
    const candidate = buildHealthcheckPayload(createCronTaskRow({
      second_interval: 10,
    }), 10 * 60, 'UTC')

    expect(candidate.payload.period_value).toBe(10)
    expect(candidate.payload.period_type).toBe('seconds')
    expect(candidate.payload.grace_period_value).toBe(1)
    expect(candidate.payload.grace_period_type).toBe('minutes')
  })

  it.concurrent('uses one-minute grace for one-minute cron tasks', () => {
    const candidate = buildHealthcheckPayload(createCronTaskRow({
      minute_interval: 1,
    }), 10 * 60, 'UTC')

    expect(candidate.payload.period_value).toBe(1)
    expect(candidate.payload.period_type).toBe('minutes')
    expect(candidate.payload.grace_period_value).toBe(1)
    expect(candidate.payload.grace_period_type).toBe('minutes')
  })

  it.concurrent('keeps long-schedule grace at the configured maximum', () => {
    const candidate = buildHealthcheckPayload(createCronTaskRow({
      hour_interval: 2,
    }), 10 * 60, 'UTC')

    expect(candidate.payload.period_value).toBe(2)
    expect(candidate.payload.period_type).toBe('hours')
    expect(candidate.payload.grace_period_value).toBe(10)
    expect(candidate.payload.grace_period_type).toBe('minutes')
  })

  it.concurrent('rounds grace down so it does not exceed the configured maximum', () => {
    const candidate = buildHealthcheckPayload(createCronTaskRow({
      hour_interval: 2,
    }), 61, 'UTC')

    expect(candidate.payload.grace_period_value).toBe(1)
    expect(candidate.payload.grace_period_type).toBe('minutes')
  })

  it.concurrent('derives grace for daily cron schedules', () => {
    const candidate = buildHealthcheckPayload(createCronTaskRow({
      run_at_hour: 3,
      run_at_minute: 15,
    }), 2 * 60 * 60, 'UTC')

    expect(candidate.payload.cron).toBe('15 3 * * *')
    expect(candidate.payload.grace_period_value).toBe(2)
    expect(candidate.payload.grace_period_type).toBe('hours')
  })
})
