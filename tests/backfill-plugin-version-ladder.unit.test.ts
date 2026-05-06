import { describe, expect, it } from 'vitest'
import { applyStoredPercents, buildPluginBreakdownResult, parseBreakdown, parseLadder } from '../scripts/backfill_plugin_version_ladder.ts'

describe('plugin version ladder backfill helpers', () => {
  it.concurrent('aggregates top plugin versions with the top three apps per version', () => {
    const result = buildPluginBreakdownResult([
      { plugin_version: '7.1.0', app_id: 'app.a', device_count: 5 },
      { plugin_version: '7.1.0', app_id: 'app.b', device_count: 4 },
      { plugin_version: '7.1.0', app_id: 'app.c', device_count: 3 },
      { plugin_version: '7.1.0', app_id: 'app.d', device_count: 2 },
      { plugin_version: '6.0.0', app_id: 'app.a', device_count: 4 },
      { plugin_version: '6.0.0', app_id: 'app.b', device_count: 1 },
      { plugin_version: '5.2.0', app_id: 'app.z', device_count: '5' },
      { plugin_version: '', app_id: 'app.skip', device_count: 10 },
      { plugin_version: '4.0.0', app_id: '', device_count: 10 },
      { plugin_version: '3.0.0', app_id: 'app.zero', device_count: 0 },
    ])

    expect(result.version_breakdown).toEqual({
      '7.1.0': 58.33,
      '6.0.0': 20.83,
      '5.2.0': 20.83,
    })
    expect(result.major_breakdown).toEqual({
      7: 58.33,
      6: 20.83,
      5: 20.83,
    })
    expect(result.version_ladder).toEqual([
      {
        version: '7.1.0',
        device_count: 14,
        percent: 58.33,
        top_apps: [
          { app_id: 'app.a', device_count: 5, share: 35.71 },
          { app_id: 'app.b', device_count: 4, share: 28.57 },
          { app_id: 'app.c', device_count: 3, share: 21.43 },
        ],
      },
      {
        version: '5.2.0',
        device_count: 5,
        percent: 20.83,
        top_apps: [
          { app_id: 'app.z', device_count: 5, share: 100 },
        ],
      },
      {
        version: '6.0.0',
        device_count: 5,
        percent: 20.83,
        top_apps: [
          { app_id: 'app.a', device_count: 4, share: 80 },
          { app_id: 'app.b', device_count: 1, share: 20 },
        ],
      },
    ])
  })

  it.concurrent('uses stored chart percentages when rebuilding ladder rows', () => {
    const result = applyStoredPercents([
      {
        version: '7.1.0',
        device_count: 14,
        percent: 58.33,
        top_apps: [],
      },
    ], { '7.1.0': 60 })

    expect(result[0].percent).toBe(60)
  })

  it.concurrent('normalizes stored breakdown and ladder json', () => {
    expect(parseBreakdown('{"7.1.0":58.33,"bad":0,"skip":"0"}')).toEqual({ '7.1.0': 58.33 })
    expect(parseBreakdown('not-json')).toEqual({})

    expect(parseLadder(JSON.stringify([
      {
        version: '7.1.0',
        device_count: '14',
        percent: '58.33',
        top_apps: [
          { app_id: 'app.a', device_count: '5', share: '35.71' },
          { app_id: '', device_count: 4, share: 28.57 },
        ],
      },
      { version: '', device_count: 10 },
    ]))).toEqual([
      {
        version: '7.1.0',
        device_count: 14,
        percent: 58.33,
        top_apps: [
          { app_id: 'app.a', device_count: 5, share: 35.71 },
        ],
      },
    ])
  })
})
