import type { Context } from 'hono'
import { addTagBento, isBentoConfigured } from './bento.ts'
import { cloudlog } from './logging.ts'
import { getPgClient } from './pg.ts'
import { backgroundTask, getEnv } from './utils.ts'

export const ORG_ONBOARDING_INTENTS = ['unknown', 'ota', 'builder', 'both', 'exploring'] as const
export type OrgOnboardingIntent = typeof ORG_ONBOARDING_INTENTS[number]

const TRAILING_SLASHES_REGEX = /\/+$/

export function parseOrgOnboardingIntent(onboarding: unknown): OrgOnboardingIntent {
  if (!onboarding || typeof onboarding !== 'object' || !('intent' in onboarding))
    return 'unknown'

  const intent = (onboarding as { intent?: unknown }).intent
  if (typeof intent === 'string' && (ORG_ONBOARDING_INTENTS as readonly string[]).includes(intent))
    return intent as OrgOnboardingIntent

  return 'unknown'
}

export function buildOnboardingIntentBentoTags(intent: OrgOnboardingIntent): { segments: string[], deleteSegments: string[] } {
  const activeTag = `onboarding_intent:${intent}`

  return {
    segments: [activeTag],
    deleteSegments: ORG_ONBOARDING_INTENTS
      .filter(value => value !== intent)
      .map(value => `onboarding_intent:${value}`),
  }
}

export function buildOnboardingIntentBentoEventData(
  c: Context,
  intent: OrgOnboardingIntent,
  org: { id: string, name: string, website?: string | null },
): Record<string, string | null> {
  const baseUrl = (getEnv(c, 'WEBAPP_URL') || '').replace(TRAILING_SLASHES_REGEX, '')
  const onboardingUrlOta = baseUrl ? `${baseUrl}/app/new` : null
  const onboardingUrlBuilder = baseUrl ? `${baseUrl}/app/new` : null

  let onboardingUrl: string | null = onboardingUrlOta
  if (intent === 'builder')
    onboardingUrl = onboardingUrlBuilder
  else if (intent === 'exploring' || intent === 'unknown')
    onboardingUrl = baseUrl ? `${baseUrl}/apps` : null

  return {
    org_id: org.id,
    org_name: org.name,
    org_website: org.website ?? null,
    onboarding_intent: intent,
    onboarding_url: onboardingUrl,
    onboarding_url_ota: onboardingUrlOta,
    onboarding_url_builder: onboardingUrlBuilder,
  }
}

async function lookupUserEmail(c: Context, userId: string): Promise<string | null> {
  const pgClient = getPgClient(c, true)
  try {
    const result = await pgClient.query<{ email: string }>(
      'SELECT email FROM public.users WHERE id = $1::uuid LIMIT 1',
      [userId],
    )
    return result.rows[0]?.email ?? null
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'lookupUserEmail failed', userId, error })
    return null
  }
  finally {
    await pgClient.end()
  }
}

export async function syncOrgOnboardingIntentBentoTags(
  c: Context,
  intent: OrgOnboardingIntent,
  emails: Array<string | null | undefined>,
) {
  if (!isBentoConfigured(c))
    return

  const tags = buildOnboardingIntentBentoTags(intent)
  const uniqueEmails = Array.from(new Set(
    emails
      .map(email => email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  ))

  if (uniqueEmails.length === 0)
    return

  await Promise.all(uniqueEmails.map(email =>
    backgroundTask(c, addTagBento(c, email, tags)),
  ))

  cloudlog({
    requestId: c.get('requestId'),
    message: 'syncOrgOnboardingIntentBentoTags',
    intent,
    recipientCount: uniqueEmails.length,
  })
}

export async function syncOrgOnboardingIntentForOrg(
  c: Context,
  org: { management_email?: string | null, created_by?: string | null, onboarding?: unknown },
) {
  const intent = parseOrgOnboardingIntent(org.onboarding)
  const emails = [org.management_email]

  if (org.created_by) {
    const creatorEmail = await lookupUserEmail(c, org.created_by)
    if (creatorEmail)
      emails.push(creatorEmail)
  }

  await syncOrgOnboardingIntentBentoTags(c, intent, emails)
}

export const orgOnboardingIntentTestUtils = {
  lookupUserEmail,
}
