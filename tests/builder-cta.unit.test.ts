import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../cli/src/build/credentials.ts', () => ({ loadSavedCredentials: vi.fn() }))
vi.mock('../cli/src/bundle/builder-snooze.ts', () => ({ isBuilderPromptSnoozed: vi.fn(), snoozeBuilderPrompt: vi.fn() }))
vi.mock('../cli/src/analytics/track.ts', () => ({ trackEvent: vi.fn() }))

// eslint-disable-next-line import/first -- vi.mock is hoisted above these imports
import { loadSavedCredentials } from '../cli/src/build/credentials.ts'
import { isBuilderPromptSnoozed, snoozeBuilderPrompt } from '../cli/src/bundle/builder-snooze.ts'
import { decideBuilderCtaSurface, maybePromptBuilderCta } from '../cli/src/bundle/builder-cta.ts'

const mockLoadCreds = vi.mocked(loadSavedCredentials)
const mockSnoozed = vi.mocked(isBuilderPromptSnoozed)
const mockSnooze = vi.mocked(snoozeBuilderPrompt)
// The confirm prompt is injected (not module-mocked) so we never hit real clack I/O.
const mockConfirm = vi.fn()

const params = {
  incompatible: true,
  interactive: true,
  appId: 'com.app',
  orgId: 'org1',
  apikey: 'k',
  incompatibleCount: 2,
  now: new Date('2026-05-30T00:00:00.000Z'),
  confirm: mockConfirm,
}

describe('decideBuilderCtaSurface', () => {
  const base = { incompatible: true, interactive: true, envDisabled: false, snoozed: false, hasCredentials: false }
  it.concurrent('skips when compatible', () => {
    expect(decideBuilderCtaSurface({ ...base, incompatible: false })).toBe('skip')
  })
  it.concurrent('skips when disabled via env (even on CI)', () => {
    expect(decideBuilderCtaSurface({ ...base, envDisabled: true, interactive: false })).toBe('skip')
  })
  it.concurrent('shows the CI ad when non-interactive', () => {
    expect(decideBuilderCtaSurface({ ...base, interactive: false })).toBe('ci-ad')
  })
  it.concurrent('skips the interactive prompt when snoozed', () => {
    expect(decideBuilderCtaSurface({ ...base, snoozed: true })).toBe('skip')
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
    mockSnoozed.mockResolvedValue(false)
    mockLoadCreds.mockResolvedValue(null)
  })

  it('returns continue when compatible', async () => {
    expect(await maybePromptBuilderCta({ ...params, incompatible: false })).toBe('continue')
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('launches onboarding on accept (no credentials)', async () => {
    mockConfirm.mockResolvedValueOnce(true)
    expect(await maybePromptBuilderCta(params)).toBe('launch-onboarding')
  })

  it('launches build on accept (credentials present)', async () => {
    mockLoadCreds.mockResolvedValue({ ios: {} } as never)
    mockConfirm.mockResolvedValueOnce(true)
    expect(await maybePromptBuilderCta(params)).toBe('launch-build')
  })

  it('snoozes and continues on a confirmed decline', async () => {
    mockConfirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    expect(await maybePromptBuilderCta(params)).toBe('continue')
    expect(mockSnooze).toHaveBeenCalledWith('com.app', 3, params.now)
  })

  it('continues without snooze on an unsure decline', async () => {
    mockConfirm.mockResolvedValueOnce(false).mockResolvedValueOnce(false)
    expect(await maybePromptBuilderCta(params)).toBe('continue')
    expect(mockSnooze).not.toHaveBeenCalled()
  })

  it('shows the CI ad and continues when non-interactive', async () => {
    expect(await maybePromptBuilderCta({ ...params, interactive: false })).toBe('continue')
    expect(mockConfirm).not.toHaveBeenCalled()
  })
})
