import { describe, expect, it } from 'vitest'
import { planBundleCleanup } from '../supabase/functions/_backend/public/bundle/cleanup.ts'

// Newest first, the order the endpoint selects them in.
const versions = [
  { id: 6, name: '2.0.0', created_at: '2024-01-06T00:00:00Z' },
  { id: 5, name: '1.0.4', created_at: '2024-01-05T00:00:00Z' },
  { id: 4, name: '1.0.3', created_at: '2024-01-04T00:00:00Z' },
  { id: 3, name: 'builtin', created_at: '2024-01-03T00:00:00Z' },
  { id: 7, name: 'unknown', created_at: '2024-01-02T12:00:00Z' },
  { id: 2, name: '1.0.1', created_at: '2024-01-02T00:00:00Z' },
  { id: 1, name: '1.0.0', created_at: '2024-01-01T00:00:00Z' },
]

const names = (rows: { name: string }[]) => rows.map(row => row.name)

describe('planBundleCleanup', () => {
  it('keeps the newest bundles and removes the rest, never touching placeholders', () => {
    const plan = planBundleCleanup(versions, new Set(), { keep: 2, ignoreChannel: false })
    expect(plan.active).toBe(5)
    expect(plan.total).toBe(5)
    expect(names(plan.kept)).toEqual(['2.0.0', '1.0.4'])
    expect(names(plan.removed)).toEqual(['1.0.3', '1.0.1', '1.0.0'])
  })

  it('always keeps channel-linked bundles unless ignoreChannel is set', () => {
    const linked = new Set([2])
    const plan = planBundleCleanup(versions, linked, { keep: 1, ignoreChannel: false })
    expect(names(plan.kept)).toEqual(['2.0.0', '1.0.1'])
    expect(plan.kept.find(row => row.id === 2)?.linked).toBe(true)
    expect(names(plan.removed)).toEqual(['1.0.4', '1.0.3', '1.0.0'])

    const ignored = planBundleCleanup(versions, linked, { keep: 1, ignoreChannel: true })
    expect(names(ignored.removed)).toEqual(['1.0.4', '1.0.3', '1.0.1', '1.0.0'])
  })

  it('limits cleanup to versions above `bundle` and below its next major', () => {
    const plan = planBundleCleanup(versions, new Set(), { keep: 1, bundle: '1.0.0', ignoreChannel: false })
    expect(plan.active).toBe(5)
    expect(plan.total).toBe(3)
    expect(names(plan.kept)).toEqual(['1.0.4'])
    expect(names(plan.removed)).toEqual(['1.0.3', '1.0.1'])
  })

  it('keeps an empty range distinct from an app without bundles', () => {
    const outOfRange = planBundleCleanup(versions, new Set(), { keep: 1, bundle: '7.0.0', ignoreChannel: false })
    expect(outOfRange).toMatchObject({ active: 5, total: 0, kept: [], removed: [] })

    const placeholdersOnly = planBundleCleanup(versions.filter(v => v.name === 'builtin' || v.name === 'unknown'), new Set(), { keep: 0, ignoreChannel: false })
    expect(placeholdersOnly).toMatchObject({ active: 0, total: 0, removed: [] })
  })

  it('rejects an invalid `bundle` filter', () => {
    expect(() => planBundleCleanup(versions, new Set(), { keep: 1, bundle: 'nope', ignoreChannel: false })).toThrow()
  })
})
