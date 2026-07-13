import { describe, expect, it } from 'vitest'
import {
  buildAdminOnboardingProductionDeviceQuery,
  buildAdminOnboardingUpdateDownloadQuery,
  isAdminOnboardingTelemetryWithinRetention,
} from '../supabase/functions/_backend/utils/cloudflare.ts'
import { getAdminOnboardingActivationMetrics } from '../supabase/functions/_backend/utils/onboardingFunnel.ts'

describe('admin onboarding activation telemetry', () => {
  it.concurrent('uses the Analytics Engine retention boundary', () => {
    const now = new Date('2026-07-13T12:00:00.000Z')

    expect(isAdminOnboardingTelemetryWithinRetention('2026-04-13T12:00:00.000Z', now)).toBe(true)
    expect(isAdminOnboardingTelemetryWithinRetention('2026-04-13T11:59:59.000Z', now)).toBe(false)
    expect(isAdminOnboardingTelemetryWithinRetention('not-a-date', now)).toBe(false)
  })

  it.concurrent('builds bounded first-event queries for production devices and completed downloads', () => {
    const windows = [{
      app_id: "com.example.o'hara",
      start_at: '2026-07-01T00:00:00.000Z',
      end_at: '2026-07-08T00:00:00.000Z',
    }]

    const productionDeviceQuery = buildAdminOnboardingProductionDeviceQuery(windows)
    expect(productionDeviceQuery).toContain('FROM device_info')
    expect(productionDeviceQuery).toContain("index1 = 'com.example.o''hara'")
    expect(productionDeviceQuery).toContain('double2 = 1')
    expect(productionDeviceQuery).toContain('double3 = 0')
    expect(productionDeviceQuery).toContain("blob3 != ''")
    expect(productionDeviceQuery).toContain('min(timestamp) AS first_at')

    const updateDownloadQuery = buildAdminOnboardingUpdateDownloadQuery(windows)
    expect(updateDownloadQuery).toContain('FROM app_log')
    expect(updateDownloadQuery).toContain("blob2 IN ('download_complete', 'download_manifest_complete', 'download_zip_complete')")
    expect(updateDownloadQuery).toContain('min(timestamp) AS first_at')
  })

  it.concurrent('counts organization activation signals once within each seven-day window', () => {
    const metrics = getAdminOnboardingActivationMetrics([
      {
        org_id: 'org-alpha',
        app_id: 'app-alpha',
        created_at: '2026-07-01T00:00:00.000Z',
        activation_window_end: '2026-07-08T00:00:00.000Z',
      },
      {
        org_id: 'org-alpha',
        app_id: 'app-alpha-second',
        created_at: '2026-07-01T00:00:00.000Z',
        activation_window_end: '2026-07-08T00:00:00.000Z',
      },
      {
        org_id: 'org-beta',
        app_id: 'app-beta',
        created_at: '2026-07-02T00:00:00.000Z',
        activation_window_end: '2026-07-09T00:00:00.000Z',
      },
    ], {
      available: true,
      first_production_device_at_by_app: new Map([
        ['app-alpha', new Date('2026-07-02T00:00:00.000Z')],
        ['app-alpha-second', new Date('2026-07-03T00:00:00.000Z')],
        ['app-beta', new Date('2026-07-09T00:00:00.000Z')],
      ]),
      first_update_download_at_by_app: new Map([
        ['app-alpha', new Date('2026-07-04T00:00:00.000Z')],
        ['app-alpha-second', new Date('2026-07-10T00:00:00.000Z')],
        ['app-beta', new Date('2026-07-08T00:00:00.000Z')],
      ]),
    })

    expect(metrics.orgs_with_production_device).toBe(1)
    expect(metrics.orgs_with_update_download).toBe(2)
    expect(metrics.trend_by_date.get('2026-07-01')).toEqual({
      orgs_with_production_device: 1,
      orgs_with_update_download: 1,
    })
    expect(metrics.trend_by_date.get('2026-07-02')).toEqual({
      orgs_with_production_device: 0,
      orgs_with_update_download: 1,
    })
  })

  it.concurrent('does not report activation data when telemetry is unavailable', () => {
    const metrics = getAdminOnboardingActivationMetrics([], {
      available: false,
      first_production_device_at_by_app: new Map(),
      first_update_download_at_by_app: new Map(),
    })

    expect(metrics).toEqual({
      orgs_with_production_device: 0,
      orgs_with_update_download: 0,
      trend_by_date: new Map(),
    })
  })
})
