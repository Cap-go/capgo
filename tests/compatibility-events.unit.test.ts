import type { CompatibilityEventRow } from '../src/services/compatibilityEvents'
import { describe, expect, it } from 'vitest'
import { dependencyDiffPath, isResolved, platformLabel, reasonLabel } from '../src/services/compatibilityEvents'

function makeRow(overrides: Partial<CompatibilityEventRow> = {}): CompatibilityEventRow {
  return {
    id: 1,
    org_id: '00000000-0000-0000-0000-000000000000',
    app_id: 'com.demo.app',
    source: 'default_channel_version_changed',
    platform: 'ios',
    channel_id: 10,
    channel_name: 'production',
    current_version_id: 200,
    current_version_name: '2.0.0',
    previous_version_id: 100,
    previous_version_name: '1.2.2',
    offenders: ['@capacitor/camera'],
    change_occurred_at: '2026-06-03T00:00:00.000Z',
    created_at: '2026-06-03T00:00:00.000Z',
    resolved_at: null,
    resolved_by: null,
    resolution_kind: null,
    resolution_note: null,
    ...overrides,
  }
}

describe('platformLabel', () => {
  it.concurrent('maps known platforms to friendly names', () => {
    expect(platformLabel('ios')).toBe('iOS')
    expect(platformLabel('android')).toBe('Android')
    expect(platformLabel('electron')).toBe('Electron')
  })

  it.concurrent('falls back to the raw value for an unknown platform', () => {
    expect(platformLabel('harmony')).toBe('harmony')
  })
})

describe('isResolved', () => {
  it.concurrent('is false when resolved_at is null', () => {
    expect(isResolved(makeRow({ resolved_at: null }))).toBe(false)
  })

  it.concurrent('is true once resolved_at is set', () => {
    expect(isResolved(makeRow({ resolved_at: '2026-06-04T00:00:00.000Z' }))).toBe(true)
  })
})

describe('reasonLabel', () => {
  it.concurrent('returns null for an unresolved event', () => {
    expect(reasonLabel(makeRow())).toBeNull()
  })

  it.concurrent('surfaces the generated note verbatim for an auto-compatible resolution', () => {
    const row = makeRow({
      resolved_at: '2026-06-04T00:00:00.000Z',
      resolution_kind: 'auto_compatible',
      resolution_note: 'Default channel returned to 1.3.0, which is compatible with 1.2.2.',
    })
    expect(reasonLabel(row)).toBe('Default channel returned to 1.3.0, which is compatible with 1.2.2.')
  })

  it.concurrent('falls back to a generic sentence when an auto resolution has no note', () => {
    const row = makeRow({
      resolved_at: '2026-06-04T00:00:00.000Z',
      resolution_kind: 'auto_compatible',
      resolution_note: '   ',
    })
    expect(reasonLabel(row)).toBe('Resolved automatically — the default became compatible again.')
  })

  it.concurrent('formats a manual accept with the accepting user and the note', () => {
    const row = makeRow({
      resolved_at: '2026-06-04T00:00:00.000Z',
      resolved_by: 'user-123',
      resolution_kind: 'accepted',
      resolution_note: 'Released native 2.0.0.',
    })
    expect(reasonLabel(row, 'jane@capgo.app')).toBe('Accepted by jane@capgo.app — Released native 2.0.0.')
  })

  it.concurrent('uses a generic actor when no accepting-user label is provided', () => {
    const row = makeRow({
      resolved_at: '2026-06-04T00:00:00.000Z',
      resolved_by: 'user-123',
      resolution_kind: 'accepted',
      resolution_note: 'Released native 2.0.0.',
    })
    expect(reasonLabel(row)).toBe('Accepted by a team member — Released native 2.0.0.')
  })

  it.concurrent('drops the em-dash and note when a manual accept somehow has no note', () => {
    const row = makeRow({
      resolved_at: '2026-06-04T00:00:00.000Z',
      resolved_by: 'user-123',
      resolution_kind: 'accepted',
      resolution_note: null,
    })
    expect(reasonLabel(row, 'jane@capgo.app')).toBe('Accepted by jane@capgo.app')
  })
})

describe('dependencyDiffPath', () => {
  it.concurrent('builds the diff link comparing current against previous', () => {
    const row = makeRow({ current_version_id: 200, previous_version_id: 100 })
    expect(dependencyDiffPath('com.demo.app', row)).toBe(
      '/app/com.demo.app/bundle/200/dependencies?compare=100',
    )
  })

  it.concurrent('returns null when the current bundle id was purged', () => {
    const row = makeRow({ current_version_id: null, previous_version_id: 100 })
    expect(dependencyDiffPath('com.demo.app', row)).toBeNull()
  })

  it.concurrent('returns null when the previous bundle id was purged', () => {
    const row = makeRow({ current_version_id: 200, previous_version_id: null })
    expect(dependencyDiffPath('com.demo.app', row)).toBeNull()
  })
})
