import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../cli/src/build/credentials.ts', () => ({ loadSavedCredentials: vi.fn() }))
vi.mock('../cli/src/analytics/track.ts', () => ({ trackEvent: vi.fn() }))

// eslint-disable-next-line import/first -- vi.mock is hoisted above these imports
import { loadSavedCredentials } from '../cli/src/build/credentials.ts'
import { decideBuilderCtaSurface, maybePromptBuilderCta } from '../cli/src/bundle/builder-cta.ts'

const mockLoadCreds = vi.mocked(loadSavedCredentials)
// The confirm prompt is injected (not module-mocked) so we never hit real clack I/O.
const mockConfirm = vi.fn()

const params = {
  incompatible: true,
  interactive: true,
  appId: 'com.app',
  orgId: 'org1',
  apikey: 'k',
  incompatibleCount: 2,
  confirm: mockConfirm,
}

describe('decideBuilderCtaSurface', () => {
  const base = { incompatible: true, interactive: true, envDisabled: false, hasCredentials: false }
  it.concurrent('skips when compatible', () => {
    expect(decideBuilderCtaSurface({ ...base, incompatible: false })).toBe('skip')
  })
  it.concurrent('skips when disabled via env (even on CI)', () => {
    expect(decideBuilderCtaSurface({ ...base, envDisabled: true, interactive: false })).toBe('skip')
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
  beforeEach(() => {
    vi.resetAllMocks()
    mockLoadCreds.mockResolvedValue(null)
  })

  it('returns continue when compatible', async () => {
    expect(await maybePromptBuilderCta({ ...params, incompatible: false })).toBe('continue')
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('launches onboarding on accept (no credentials) with a single prompt', async () => {
    mockConfirm.mockResolvedValueOnce(true)
    expect(await maybePromptBuilderCta(params)).toBe('launch-onboarding')
    expect(mockConfirm).toHaveBeenCalledTimes(1)
  })

  it('launches build on accept (credentials present)', async () => {
    mockLoadCreds.mockResolvedValue({ ios: {} } as never)
    mockConfirm.mockResolvedValueOnce(true)
    expect(await maybePromptBuilderCta(params)).toBe('launch-build')
  })

  it('continues on decline without a second prompt', async () => {
    mockConfirm.mockResolvedValueOnce(false)
    expect(await maybePromptBuilderCta(params)).toBe('continue')
    expect(mockConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the CI ad and continues when non-interactive', async () => {
    expect(await maybePromptBuilderCta({ ...params, interactive: false })).toBe('continue')
    expect(mockConfirm).not.toHaveBeenCalled()
  })
})
