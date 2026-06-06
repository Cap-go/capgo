// test/prescan/command.test.ts
import { describe, expect, it } from 'bun:test'
import { exitCodeFor, validateFlags } from '../../src/build/prescan/command'

describe('validateFlags', () => {
  it('rejects ignore-fatal + fail-on-warnings', () => {
    expect(() => validateFlags({ ignoreFatal: true, failOnWarnings: true }))
      .toThrow(/contradictory/i)
  })
  it('accepts each alone', () => {
    expect(() => validateFlags({ ignoreFatal: true })).not.toThrow()
    expect(() => validateFlags({ failOnWarnings: true })).not.toThrow()
  })
})

describe('exitCodeFor', () => {
  const counts = (error: number, warning: number) => ({ error, warning, info: 0 })
  it('0 when clean', () => expect(exitCodeFor(counts(0, 0), {})).toBe(0))
  it('1 on errors', () => expect(exitCodeFor(counts(1, 0), {})).toBe(1))
  it('0 on warnings by default', () => expect(exitCodeFor(counts(0, 2), {})).toBe(0))
  it('2 on warnings with failOnWarnings', () => expect(exitCodeFor(counts(0, 2), { failOnWarnings: true })).toBe(2))
  it('0 always with ignoreFatal', () => expect(exitCodeFor(counts(3, 3), { ignoreFatal: true })).toBe(0))
})
