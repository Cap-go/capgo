import { describe, expect, it } from 'vitest'
import { excludeInternalVersions, isInternalVersionName } from '../src/services/versions'

describe('version helpers', () => {
  it('treats builtin and unknown as internal version names', () => {
    expect(isInternalVersionName('builtin')).toBe(true)
    expect(isInternalVersionName('unknown')).toBe(true)
    expect(isInternalVersionName('1.0.0')).toBe(false)
  })

  it('adds filters to exclude internal versions from user-facing queries', () => {
    const calls: Array<[string, string]> = []
    const query = {
      neq(column: string, value: string) {
        calls.push([column, value])
        return this
      },
    }

    expect(excludeInternalVersions(query)).toBe(query)
    expect(calls).toEqual([
      ['name', 'builtin'],
      ['name', 'unknown'],
    ])
  })
})
