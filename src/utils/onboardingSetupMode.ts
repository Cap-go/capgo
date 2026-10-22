import type { Json } from '~/types/supabase.types'
import { parseUserOnboardingProgress } from '~/utils/userOnboardingProgress'

/**
 * How a self-signup user chose to finish onboarding.
 *
 * - `ai`: the console creates the organization (with the plan picked in the UI) and hands
 *   the rest (app, channel, updater plugin, first upload) to the user's coding agent
 *   through Capgo MCP.
 * - `manual`: the existing browser wizard (intent → app → organization → setup).
 *
 * Stored in `users.onboarding.setup_mode`. The key is not one of the wizard progress fields,
 * so `mergeUserOnboardingProgress` keeps it when the manual wizard saves its progress.
 */
export const ONBOARDING_SETUP_MODES = ['ai', 'manual'] as const
export type OnboardingSetupMode = typeof ONBOARDING_SETUP_MODES[number]

export const AI_ONBOARDING_PATH = '/onboarding/ai'

function asObject(value: Json | unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function readOnboardingSetupMode(onboarding: Json | unknown): OnboardingSetupMode | null {
  const mode = asObject(onboarding).setup_mode
  return mode === 'ai' || mode === 'manual' ? mode : null
}

export function withOnboardingSetupMode(onboarding: Json, mode: OnboardingSetupMode): Json {
  return { ...asObject(onboarding), setup_mode: mode } as Json
}

/**
 * Which first screen `/onboarding/app` shows a user without an organization.
 * Anyone already inside the manual wizard (saved progress, a resume link or a second
 * organization) keeps the manual flow, so nobody loses typed answers.
 */
export function initialOnboardingSetupScreen(options: {
  onboarding: Json | unknown
  newOrganization: boolean
  resuming: boolean
}): 'choice' | 'ai' | 'manual' {
  if (options.newOrganization || options.resuming)
    return 'manual'
  const saved = readOnboardingSetupMode(options.onboarding)
  if (saved === 'ai')
    return 'ai'
  if (saved === 'manual')
    return 'manual'
  if (parseUserOnboardingProgress(options.onboarding))
    return 'manual'
  return 'choice'
}

/**
 * New users who picked AI setup and have an organization but no app yet go back to the
 * prompt page, unless they chose to look around the dashboard first.
 */
export function shouldRedirectToAiOnboarding(options: {
  onboarding: Json | unknown
  appCount: number
  organizationCount: number
  path: string
  canExploreDashboard: boolean
}) {
  if (readOnboardingSetupMode(options.onboarding) !== 'ai')
    return false
  if (options.organizationCount !== 1 || options.appCount !== 0 || options.canExploreDashboard)
    return false
  // Account, organization and billing settings stay reachable; so does the manual wizard.
  return options.path !== AI_ONBOARDING_PATH && options.path !== '/app/new' && !options.path.startsWith('/settings')
}

/** Default organization name, so AI setup needs no typing. Must be at least 3 characters. */
export function defaultAiOrganizationName(firstName: string | null | undefined, fallback: string, template: (name: string) => string) {
  const name = firstName?.replace(/\s+/g, ' ').trim()
  const candidate = name ? template(name) : fallback
  return candidate.length >= 3 ? candidate : fallback
}
