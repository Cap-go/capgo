import { describe, expect, it, vi } from 'vitest'

// trackEvent is fire-and-forget (void) and never asserted, so a shared module
// mock is safe under concurrent execution. Everything else (confirm,
// hasCredentials) is passed per-test, so there is no shared mutable state.
vi.mock('../cli/src/analytics/track.ts', () => ({ trackEvent: vi.fn() }))

// eslint-disable-next-line import/first -- vi.mock is hoisted above this import
import { decideBuilderCtaSurface, maybePromptBuilderCta } from '../cli/src/bundle/builder-cta.ts'

const baseParams = {
  incompatible: true,
  interactive: true,
  hasCredentials: false,
  appId: 'com.app',
  orgId: 'org1',
  apikey: 'k',
  incompatibleCount: 2,
}

describe('decideBuilderCtaSurface', () => {
  const base = { incompatible: true, interactive: true, hasCredentials: false }
  it.concurrent('skips when compatible', () => {
    expect(decideBuilderCtaSurface({ ...base, incompatible: false })).toBe('skip')
  })
  it.concurrent('shows the CI ad when non-interactive', () => {
    expect(decideBuilderCtaSurface({ ...base, interactive: false })).toBe('ci-ad')
  })
  it.concurrent('prompts onboarding when interactive with no credentials', () => {
    expect(decideBuilderCtaSurface(base)).toBe('prompt-onboarding')
  })
  it.concurrent('prompts build when interactive with credentials', () => {
    expect(decideBuilderCtaSurface({ ...base, hasCredentials: true })).toBe('prompt-build')
  })
})

describe('maybePromptBuilderCta', () => {
  it.concurrent('returns continue when compatible', async () => {
    const select = vi.fn()
    expect(await maybePromptBuilderCta({ ...baseParams, incompatible: false, select })).toBe('continue')
    expect(select).not.toHaveBeenCalled()
  })

  it.concurrent('launches onboarding on yes (no credentials) with a selector and learn option', async () => {
    const select = vi.fn().mockResolvedValue('yes')
    expect(await maybePromptBuilderCta({ ...baseParams, hasCredentials: false, select })).toBe('launch-onboarding')
    expect(select).toHaveBeenCalledTimes(1)
    const msg = select.mock.calls[0][0].message as string
    expect(msg).toContain('Would you like to configure Capgo Builder now?')
    expect(select.mock.calls[0][0].options).toEqual([
      { value: 'yes', label: 'yes' },
      { value: 'no', label: 'no' },
      { value: 'learn', label: 'learn what Capgo Builder is' },
    ])
  })

  it.concurrent('launches build on accept (credentials present) with the build question', async () => {
    const select = vi.fn().mockResolvedValue('yes')
    expect(await maybePromptBuilderCta({ ...baseParams, hasCredentials: true, select })).toBe('launch-build')
    expect(select.mock.calls[0][0].message as string).toContain('Start a native build with Capgo Builder now?')
  })

  it.concurrent('continues on no without a second prompt', async () => {
    const select = vi.fn().mockResolvedValue('no')
    expect(await maybePromptBuilderCta({ ...baseParams, select })).toBe('continue')
    expect(select).toHaveBeenCalledTimes(1)
  })

  it.concurrent('opens the learn page and asks again', async () => {
    const select = vi.fn()
      .mockResolvedValueOnce('learn')
      .mockResolvedValueOnce('no')
    const openUrl = vi.fn().mockResolvedValue(undefined)

    expect(await maybePromptBuilderCta({ ...baseParams, select, openUrl })).toBe('continue')
    expect(openUrl).toHaveBeenCalledWith('https://capgo.app/native-build/')
    expect(select).toHaveBeenCalledTimes(2)
  })

  it.concurrent('shows the CI ad and continues when non-interactive', async () => {
    const select = vi.fn()
    expect(await maybePromptBuilderCta({ ...baseParams, interactive: false, select })).toBe('continue')
    expect(select).not.toHaveBeenCalled()
  })
})
