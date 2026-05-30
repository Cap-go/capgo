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
    const confirm = vi.fn()
    expect(await maybePromptBuilderCta({ ...baseParams, incompatible: false, confirm })).toBe('continue')
    expect(confirm).not.toHaveBeenCalled()
  })

  it.concurrent('launches onboarding on accept (no credentials) with a single prompt + learn link', async () => {
    const confirm = vi.fn().mockResolvedValue(true)
    expect(await maybePromptBuilderCta({ ...baseParams, hasCredentials: false, confirm })).toBe('launch-onboarding')
    expect(confirm).toHaveBeenCalledTimes(1)
    const msg = confirm.mock.calls[0][0].message as string
    expect(msg).toContain('Would you like to configure Capgo Builder now?')
    expect(msg).toContain('https://capgo.app/native-build/')
  })

  it.concurrent('launches build on accept (credentials present) with the build question', async () => {
    const confirm = vi.fn().mockResolvedValue(true)
    expect(await maybePromptBuilderCta({ ...baseParams, hasCredentials: true, confirm })).toBe('launch-build')
    expect(confirm.mock.calls[0][0].message as string).toContain('Start a native build with Capgo Builder now?')
  })

  it.concurrent('continues on decline without a second prompt', async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    expect(await maybePromptBuilderCta({ ...baseParams, confirm })).toBe('continue')
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it.concurrent('shows the CI ad and continues when non-interactive', async () => {
    const confirm = vi.fn()
    expect(await maybePromptBuilderCta({ ...baseParams, interactive: false, confirm })).toBe('continue')
    expect(confirm).not.toHaveBeenCalled()
  })
})
