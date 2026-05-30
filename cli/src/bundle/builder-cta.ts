import { confirm as pConfirm, isCancel as pIsCancel, log } from '@clack/prompts'
import { trackEvent } from '../analytics/track'

export type BuilderCtaSurface = 'skip' | 'ci-ad' | 'prompt-onboarding' | 'prompt-build'
export type BuilderCtaAction = 'continue' | 'launch-onboarding' | 'launch-build'

export interface BuilderCtaContext {
  incompatible: boolean
  interactive: boolean
  hasCredentials: boolean
}

/**
 * Pure decision: which Builder CTA surface (if any) to show for this upload.
 * - `skip`: do nothing (compatible bundle).
 * - `ci-ad`: non-interactive — print a one-off ad, never prompt.
 * - `prompt-onboarding` / `prompt-build`: interactive prompt, branched on
 *   whether the app already has build credentials.
 */
export function decideBuilderCtaSurface(ctx: BuilderCtaContext): BuilderCtaSurface {
  if (!ctx.incompatible)
    return 'skip'
  if (!ctx.interactive)
    return 'ci-ad'
  return ctx.hasCredentials ? 'prompt-build' : 'prompt-onboarding'
}

const DOCS_URL = 'https://capgo.app/docs/cli/cloud-build/'
const LEARN_URL = 'https://capgo.app/native-build/'

// Why a native build is needed — folded into the prompt and the CI ad.
const REASON = 'This update includes native changes. An app store update may be required for these changes to take effect. Capgo Builder can help you build and publish the required native update.'

/**
 * Render a clickable terminal hyperlink (OSC 8). Clicking it opens the URL in the
 * browser **without dismissing the active prompt**. Terminals that don't support
 * OSC 8 just render `text`.
 */
function terminalLink(text: string, url: string): string {
  const ESC = String.fromCharCode(27) // \x1B
  const BEL = String.fromCharCode(7) // \x07
  return `${ESC}]8;;${url}${BEL}${text}${ESC}]8;;${BEL}`
}

export function printBuilderCiAd(hasCredentials: boolean): void {
  const action = hasCredentials
    ? 'run a native build (npx @capgo/cli build request --platform <ios|android>)'
    : 'set up Capgo Builder (npx @capgo/cli build onboarding)'
  log.warn(`${REASON} To ${action} — learn more: ${LEARN_URL} · docs: ${DOCS_URL}`)
}

/** Confirm-prompt seam (`@clack/prompts` `confirm` satisfies it); injectable for tests. */
export type BuilderConfirm = (opts: { message: string, initialValue?: boolean }) => Promise<boolean | symbol>

export interface MaybePromptBuilderCtaParams {
  incompatible: boolean
  interactive: boolean
  /** Whether the app already has saved build credentials (resolved by the caller). */
  hasCredentials: boolean
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
    // A CTA failure (prompt, telemetry) must never block the upload.
    return 'continue'
  }
}

async function runBuilderCta(params: MaybePromptBuilderCtaParams): Promise<BuilderCtaAction> {
  const { hasCredentials } = params

  const surface = decideBuilderCtaSurface({
    incompatible: params.incompatible,
    interactive: params.interactive,
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

  // Message 1: the context, printed above the prompt so the question stays short.
  log.info(REASON)

  // Message 2: the short yes/no question, plus a clickable "learn more" hyperlink
  // that opens in the browser without dismissing this prompt.
  const confirm = params.confirm ?? pConfirm
  const question = mode === 'build'
    ? 'Start a native build with Capgo Builder now?'
    : 'Would you like to configure Capgo Builder now?'
  const accepted = await confirm({
    message: `${question}\n${terminalLink('Learn what Capgo Builder is', LEARN_URL)}`,
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
