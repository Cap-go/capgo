// test/prescan/prompt.test.ts
import { describe, expect, it } from 'bun:test'
import { resolveWarningGate } from '../../src/build/prescan/prompt'

const yes = async () => true
const no = async () => false
const cancel = async () => Symbol('clack:cancel') as unknown as symbol

describe('resolveWarningGate', () => {
  it('passes non-ask outcomes through', async () => {
    expect(await resolveWarningGate('proceed', { interactive: true, confirmImpl: no })).toBe('proceed')
    expect(await resolveWarningGate('block', { interactive: true, confirmImpl: yes })).toBe('block')
  })
  it('proceeds without prompting when non-interactive (per spec)', async () => {
    let prompted = false
    const spy = async () => { prompted = true; return false }
    expect(await resolveWarningGate('ask', { interactive: false, confirmImpl: spy })).toBe('proceed')
    expect(prompted).toBe(false)
  })
  it('user confirms → proceed', async () => {
    expect(await resolveWarningGate('ask', { interactive: true, confirmImpl: yes })).toBe('proceed')
  })
  it('user declines → block', async () => {
    expect(await resolveWarningGate('ask', { interactive: true, confirmImpl: no })).toBe('block')
  })
  it('user cancels (ctrl-c symbol) → block', async () => {
    expect(await resolveWarningGate('ask', { interactive: true, confirmImpl: cancel })).toBe('block')
  })
})
