import type { Context } from 'hono'
import { isLifecycleV2Creator, validLifecycleTreatment } from './lifecycle_v2_cohort.ts'
import { cloudlog } from './logging.ts'
import { closeClient, getPgClient } from './pg.ts'
import { existInEnv, getEnv } from './utils.ts'

export const LIFECYCLE_V2_CONTRACT = 'new-emails-v2-2026-10-19'

// Match Worker lifecycle readiness; these do not control invitation reminders.
const REQUIRED_SETTINGS = {
  BENTO_EVENT_DISPATCH_ENABLED: 'true',
  BENTO_LIFECYCLE_V2_SENDER_CONTRACT: LIFECYCLE_V2_CONTRACT,
  BENTO_LIFECYCLE_V2_LEGACY_HANDOFF: LIFECYCLE_V2_CONTRACT,
} as const

const LEGACY_LIFECYCLE_EVENTS: ReadonlySet<string> = new Set([
  'org:created',
  'app:created',
  'app:updated',
  'app:onboarding_ready',
  'app:ai_instructions_copied',
  'user:need_onboarding',
  'builder_onboarding_started',
  'builder_onboarding_completed',
])

export function isLegacyLifecycleEvent(eventName: string): boolean {
  return LEGACY_LIFECYCLE_EVENTS.has(eventName)
}

export const isLifecycleV2Treatment = validLifecycleTreatment

type Product = 'ota' | 'builder'
export type LifecycleHandoffContext
  = | { kind: 'organization' }
    | { kind: 'product', product: Product }
    | { kind: 'app', appId: string }

export const LIFECYCLE_HANDOFF_SOURCE_SQL = `SELECT users.onboarding, users.created_at, users.created_via_invite,
         orgs.onboarding AS org_onboarding, apps.onboarding AS app_onboarding,
         ARRAY(SELECT journeys.product FROM public.bento_lifecycle_journeys AS journeys
           WHERE journeys.org_id = creators.org_id AND journeys.support_hold IS FALSE) AS active_products
       FROM public.org_lifecycle_creators AS creators
       JOIN public.users AS users ON users.id = creators.original_creator_id
       JOIN public.orgs AS orgs ON orgs.id = creators.org_id
       LEFT JOIN public.apps AS apps ON apps.app_id = $2::text AND apps.owner_org = creators.org_id
       WHERE creators.org_id = $1::uuid
       LIMIT 1`

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function declaredProducts(onboarding: unknown): Product[] {
  const intent = object(onboarding).intent
  return intent === 'both' ? ['ota', 'builder'] : intent === 'ota' || intent === 'builder' ? [intent] : []
}

function selectedAppProduct(onboarding: unknown): Product | null {
  const setup = object(object(onboarding).setup)
  if (setup.todo_list_version === 3)
    return 'ota'
  if (setup.todo_list_version !== 4)
    return null
  const paths = setup.paths
  if (!Array.isArray(paths) || !paths.length || paths.some(path => path !== 'ota' && path !== 'builder'))
    return null
  const selected = setup.selected_path ?? (paths.length === 1 ? paths[0] : null)
  if ((selected !== 'ota' && selected !== 'builder') || !paths.includes(selected))
    return null
  return setup[`${selected}_todo_list_version`] === '1' ? selected : null
}

/** Event semantics establish Builder context; app products come from persisted setup. */
export function legacyLifecycleContext(eventName: string, data: Record<string, unknown>): LifecycleHandoffContext | null {
  if (!isLegacyLifecycleEvent(eventName))
    return null
  if (eventName === 'builder_onboarding_started' || eventName === 'builder_onboarding_completed')
    return { kind: 'product', product: 'builder' }
  if (eventName === 'org:created' || eventName === 'user:need_onboarding')
    return { kind: 'organization' }
  return typeof data.app_id === 'string' && data.app_id ? { kind: 'app', appId: data.app_id } : null
}

/**
 * Read-only handoff for internal email producers, never plugin request paths.
 * The immutable creator and journey lookups are bounded by their org/user keys.
 * Missing provenance, deleted creators, unknown readiness and database errors
 * retain legacy delivery; this helper never creates an experiment assignment.
 */
export async function shouldUseLifecycleV2(c: Context, orgId: string, context?: LifecycleHandoffContext | null): Promise<boolean> {
  if (!orgId || !context || (context.kind === 'app' && !context.appId))
    return false

  const settings: Record<string, string> = {}
  const missing: string[] = []
  for (const [key, expected] of Object.entries(REQUIRED_SETTINGS)) {
    if (!existInEnv(c, key)) {
      missing.push(key)
      continue
    }
    settings[key] = getEnv(c, key).trim()
    if (settings[key] !== expected)
      return false
  }

  let pg: Awaited<ReturnType<typeof getPgClient>> | undefined
  try {
    pg = await getPgClient(c)
    if (missing.length) {
      const result = await pg.query<{ name: string, decrypted_secret: string }>(
        'SELECT name, decrypted_secret FROM vault.decrypted_secrets WHERE name = ANY($1::text[])',
        [missing],
      )
      for (const row of result.rows)
        settings[row.name] = row.decrypted_secret?.trim()
    }
    if (Object.entries(REQUIRED_SETTINGS).some(([key, expected]) => settings[key] !== expected))
      return false

    const result = await pg.query<{
      onboarding: unknown
      created_at: string | Date
      created_via_invite: boolean | null
      org_onboarding: unknown
      app_onboarding: unknown
      active_products: Product[]
    }>(
      LIFECYCLE_HANDOFF_SOURCE_SQL,
      [orgId, context.kind === 'app' ? context.appId : null],
    )
    const row = result.rows[0]
    if (!row || !isLifecycleV2Creator(row.onboarding, row.created_at, row.created_via_invite))
      return false
    const declared = declaredProducts(row.org_onboarding)
    const appProduct = context.kind === 'app' ? selectedAppProduct(row.app_onboarding) : null
    const products = context.kind === 'organization' ? declared : context.kind === 'product' ? [context.product] : appProduct ? [appProduct] : []
    return products.length > 0 && products.every(product => declared.includes(product) && row.active_products.includes(product))
  }
  catch {
    cloudlog({ requestId: c.get('requestId'), message: 'Lifecycle v2 handoff unavailable; retaining legacy delivery' })
    return false
  }
  finally {
    if (pg)
      await closeClient(c, pg)
  }
}

function isLegacyTrialTag(tag: string): boolean {
  return ['trial', 'trial7', 'trial1', 'trial0'].includes(tag) || tag.startsWith('trial-plan:')
}

/**
 * Bento tags are person-scoped, so do not delete a tag that another org still
 * needs. The explicit handoff setting attests that existing legacy sessions
 * are excluded separately, including recipients belonging to control orgs.
 */
export function withoutLegacyTrialTriggers<T extends { segments: string[], deleteSegments: string[] }>(tags: T): T {
  return {
    ...tags,
    segments: tags.segments.filter(tag => !isLegacyTrialTag(tag)),
    deleteSegments: tags.deleteSegments.filter(tag => !isLegacyTrialTag(tag)),
  }
}
