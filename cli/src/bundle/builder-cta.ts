import { env } from 'node:process'
import { confirm as pConfirm, isCancel as pIsCancel, log } from '@clack/prompts'
import { trackEvent } from '../analytics/track'
import { loadSavedCredentials } from '../build/credentials'
import { isTruthyEnvValue } from '../posthog'

export type BuilderCtaSurface = 'skip' | 'ci-ad' | 'prompt-onboarding' | 'prompt-build'
export type BuilderCtaAction = 'continue' | 'launch-onboarding' | 'launch-build'

export interface BuilderCtaContext {
  incompatible: boolean
  interactive: boolean
  envDisabled: boolean
  hasCredentials: boolean
}

/**
 * Pure decision: which Builder CTA surface (if any) to show for this upload.
 * - `skip`: do nothing (compatible or disabled via env).
 * - `ci-ad`: non-interactive — print a one-off ad, never prompt.
 * - `prompt-onboarding` / `prompt-build`: interactive prompt, branched on
 *   whether the app already has build credentials.
 */
export function decideBuilderCtaSurface(ctx: BuilderCtaContext): BuilderCtaSurface {
  if (!ctx.incompatible || ctx.envDisabled)
    return 'skip'
  if (!ctx.interactive)
    return 'ci-ad'
  return ctx.hasCredentials ? 'prompt-build' : 'prompt-onboarding'
}

const DOCS_URL = 'https://capgo.app/docs/cli/cloud-build/'

// Why a native build is needed — folded into the single prompt and the CI ad.
const REASON = 'This update includes native changes, which ship via an app-store build rather than OTA.'

export function printBuilderCiAd(hasCredentials: boolean): void {
  log.warn(REASON)
  log.info(hasCredentials
    ? '→ Run a native build:  npx @capgo/cli build request --platform <ios|android>'
    : '→ Set up Capgo Builder: npx @capgo/cli build onboarding')
  log.info(`  Docs: ${DOCS_URL}`)
}

/** Confirm-prompt seam (`@clack/prompts` `confirm` satisfies it); injectable for tests. */
export type BuilderConfirm = (opts: { message: string, initialValue?: boolean }) => Promise<boolean | symbol>

export interface MaybePromptBuilderCtaParams {
  incompatible: boolean
  interactive: boolean
  appId: string
  orgId: string
  apikey: string
  incompatibleCount: number
  /** Injectable for tests; defaults to the `@clack/prompts` confirm prompt. */
  confirm?: BuilderConfirm
}

/**
 * Surface the Capgo Builder CTA for an incompatible upload and return the action
 * the caller should take. Never throws; telemetry and prompt failures degrade to
 * `continue` so the upload is never blocked by the CTA.
 */
export async function maybePromptBuilderCta(params: MaybePromptBuilderCtaParams): Promise<BuilderCtaAction> {
  try {
    return await runBuilderCta(params)
  }
  catch {
    // A CTA failure (filesystem, prompt, telemetry) must never block the upload.
    return 'continue'
  }
}

async function runBuilderCta(params: MaybePromptBuilderCtaParams): Promise<BuilderCtaAction> {
  const envDisabled = isTruthyEnvValue(env.CAPGO_NO_BUILDER_PROMPT)
  const hasCredentials = (await loadSavedCredentials(params.appId)) !== null

  const surface = decideBuilderCtaSurface({
    incompatible: params.incompatible,
    interactive: params.interactive,
    envDisabled,
    hasCredentials,
  })
  if (surface === 'skip')
    return 'continue'

  const mode: 'build' | 'onboarding' = hasCredentials ? 'build' : 'onboarding'
  void trackEvent({
    channel: 'bundle',
    event: 'Builder CTA Shown',
    icon: '📣',
    apikey: params.apikey,
    appId: params.appId,
    orgId: params.orgId,
    tags: { surface: surface === 'ci-ad' ? 'ci' : 'interactive', mode, incompatible_count: params.incompatibleCount },
  })

  if (surface === 'ci-ad') {
    printBuilderCiAd(hasCredentials)
    return 'continue'
  }

  // Single question: explain why, then offer the relevant Builder flow.
  const confirm = params.confirm ?? pConfirm
  const accepted = await confirm({
    message: mode === 'build'
      ? `${REASON} Run a native build now with Capgo Builder?`
      : `${REASON} Set up Capgo Builder now?`,
    initialValue: true,
  })
  if (pIsCancel(accepted))
    return 'continue'

  if (accepted === true) {
    void trackEvent({ channel: 'bundle', event: 'Builder CTA Accepted', icon: '✅', apikey: params.apikey, appId: params.appId, orgId: params.orgId, tags: { mode } })
    return mode === 'build' ? 'launch-build' : 'launch-onboarding'
  }

  // Declined → just continue the OTA upload (no follow-up prompt).
  void trackEvent({ channel: 'bundle', event: 'Builder CTA Declined', icon: '🚫', apikey: params.apikey, appId: params.appId, orgId: params.orgId, tags: { mode } })
  return 'continue'
}
