// test/prescan/command.test.ts
import { describe, expect, it } from 'bun:test'
import { exitCodeFor, runPrescanGate, validateFlags } from '../../src/build/prescan/command'

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

describe('runPrescanGate', () => {
  const fakeReport = (error: number, warning: number) => ({
    findings: [], counts: { error, warning, info: 0 }, skippedRemote: 0, durationMs: 1, checksRun: 1,
  })
  it('returns proceed when scan disabled', async () => {
    const r = await runPrescanGate({ enabled: false } as any, async () => fakeReport(9, 9))
    expect(r).toBe('proceed')
  })
  it('blocks on errors', async () => {
    const r = await runPrescanGate({ enabled: true } as any, async () => fakeReport(1, 0))
    expect(r).toBe('block')
  })
  it('proceeds on errors with ignoreFatal', async () => {
    const r = await runPrescanGate({ enabled: true, ignoreFatal: true } as any, async () => fakeReport(1, 0))
    expect(r).toBe('proceed')
  })
  it('proceeds (non-interactive) on warnings', async () => {
    const r = await runPrescanGate({ enabled: true, interactive: false } as any, async () => fakeReport(0, 1))
    expect(r).toBe('proceed')
  })
  it('never throws when the scan itself crashes — proceeds with a notice', async () => {
    const r = await runPrescanGate({ enabled: true } as any, async () => { throw new Error('scanner bug') })
    expect(r).toBe('proceed')
  })
})
