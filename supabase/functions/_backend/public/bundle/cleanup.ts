import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { greaterThan, increment, lessThan, tryParse } from '@std/semver'
import { z } from 'zod'
import { quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { integerLikeSchema, safeParseSchema } from '../../utils/schema_validation.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

const booleanLikeSchema = z.union([z.boolean(), z.enum(['true', 'false', '1', '0']).transform(value => value === 'true' || value === '1')])

export const cleanupBundleBodySchema = z.object({
  app_id: z.string(),
  keep: integerLikeSchema.refine(value => value >= 0 && value <= 10_000, { message: 'keep must be between 0 and 10000' }).optional(),
  // Only clean bundles newer than this version and below its next major.
  bundle: z.string().min(1).optional(),
  ignore_channel: booleanLikeSchema.optional(),
  dry_run: booleanLikeSchema.optional(),
})

export type CleanupBundleBody = z.infer<typeof cleanupBundleBodySchema>

export interface CleanupBundleRow {
  id: number
  name: string
  created_at: string | null
  linked: boolean
}

export interface CleanupPlan {
  total: number
  kept: CleanupBundleRow[]
  removed: CleanupBundleRow[]
}

const DEFAULT_KEEP = 4
// PostgREST caps responses at max_rows (1000); page explicitly so large apps are not truncated.
const SELECT_PAGE_SIZE = 1000
// Keep `id=in.(...)` query strings well under URL length limits.
const DELETE_BATCH_SIZE = 200
// Placeholder bundles every app owns; never offer them for cleanup.
const RESERVED_BUNDLE_NAMES = new Set(['builtin', 'unknown'])

/**
 * Same selection the CLI used to do client-side: walk bundles newest first, keep the first
 * `keep` plus any linked to a channel (unless ignoreChannel), remove the rest.
 */
export function planBundleCleanup(
  versions: { id: number, name: string, created_at: string | null }[],
  linkedIds: Set<number>,
  options: { keep: number, bundle?: string, ignoreChannel: boolean },
): CleanupPlan {
  let candidates = versions.filter(version => !RESERVED_BUNDLE_NAMES.has(version.name))

  if (options.bundle) {
    const lower = tryParse(options.bundle)
    if (!lower)
      throw simpleError('invalid_bundle', 'bundle must be a valid semver version', { bundle: options.bundle })
    const upper = increment(lower, 'major')
    candidates = candidates.filter((version) => {
      const parsed = tryParse(version.name)
      return !!parsed && greaterThan(parsed, lower) && lessThan(parsed, upper)
    })
  }

  const kept: CleanupBundleRow[] = []
  const removed: CleanupBundleRow[] = []
  for (const version of candidates) {
    const row = { ...version, linked: linkedIds.has(version.id) }
    if (kept.length < options.keep || (row.linked && !options.ignoreChannel))
      kept.push(row)
    else
      removed.push(row)
  }

  return { total: candidates.length, kept, removed }
}

async function fetchActiveVersions(c: Context<MiddlewareKeyVariables>, apikey: Database['public']['Tables']['apikeys']['Row'], appId: string) {
  const supabase = supabaseApikey(c, apikey.key)
  const rows: { id: number, name: string, created_at: string | null }[] = []
  for (let from = 0; ; from += SELECT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('app_versions')
      .select('id, name, created_at')
      .eq('app_id', appId)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + SELECT_PAGE_SIZE - 1)
    if (error)
      quickError(500, 'cannot_get_bundle', 'Cannot list bundles', { supabaseError: error })
    rows.push(...(data ?? []))
    if (!data || data.length < SELECT_PAGE_SIZE)
      return rows
  }
}

async function fetchLinkedVersionIds(c: Context<MiddlewareKeyVariables>, apikey: Database['public']['Tables']['apikeys']['Row'], appId: string) {
  const { data, error } = await supabaseApikey(c, apikey.key)
    .from('channels')
    .select('version, rollout_version')
    .eq('app_id', appId)
  if (error)
    quickError(500, 'cannot_check_linked_channels', 'Cannot check linked channels', { supabaseError: error })
  return new Set((data ?? []).flatMap(channel => [channel.version, channel.rollout_version]).filter((id): id is number => typeof id === 'number'))
}

export async function cleanupBundles(c: Context<MiddlewareKeyVariables>, bodyRaw: unknown, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const parsed = safeParseSchema(cleanupBundleBodySchema, bodyRaw)
  if (!parsed.success)
    throw simpleError('invalid_body', 'Invalid body', { error: parsed.error })
  const body = parsed.data

  if (!isValidAppId(body.app_id))
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  if (!(await checkPermission(c, 'bundle.delete', { appId: body.app_id })))
    throw simpleError('cannot_delete_bundle', 'You can\'t access this app', { app_id: body.app_id })

  const ignoreChannel = body.ignore_channel === true
  const [versions, linkedIds] = await Promise.all([
    fetchActiveVersions(c, apikey, body.app_id),
    fetchLinkedVersionIds(c, apikey, body.app_id),
  ])
  const plan = planBundleCleanup(versions, linkedIds, { keep: body.keep ?? DEFAULT_KEEP, bundle: body.bundle, ignoreChannel })

  if (body.dry_run === true || !plan.removed.length)
    return c.json({ ...plan, dry_run: body.dry_run === true })

  // Soft-delete in batches. Linked bundles are only in `removed` with ignore_channel; the
  // unlink_channels_from_deleted_version trigger clears their channel links.
  const supabase = supabaseApikey(c, apikey.key)
  // A channel may have been linked since the plan was computed; never delete those silently.
  const freshLinkedIds = ignoreChannel ? new Set<number>() : await fetchLinkedVersionIds(c, apikey, body.app_id)
  const removedIds = new Set<number>()
  for (let i = 0; i < plan.removed.length; i += DELETE_BATCH_SIZE) {
    const ids = plan.removed.slice(i, i + DELETE_BATCH_SIZE).map(row => row.id).filter(id => !freshLinkedIds.has(id))
    if (!ids.length)
      continue
    const { data, error } = await supabase
      .from('app_versions')
      .update({ deleted: true })
      .eq('app_id', body.app_id)
      .eq('deleted', false)
      .in('id', ids)
      .select('id')
    if (error)
      quickError(500, 'cannot_delete_version', 'Cannot delete bundles', { supabaseError: error, deleted: removedIds.size })
    for (const row of data ?? [])
      removedIds.add(row.id)
  }

  const removed = plan.removed.filter(row => removedIds.has(row.id))
  const skipped = plan.removed.filter(row => !removedIds.has(row.id))
  return c.json({ total: plan.total, kept: [...plan.kept, ...skipped], removed, dry_run: false })
}
