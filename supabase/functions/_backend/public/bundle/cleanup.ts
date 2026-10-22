import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { greaterThan, increment, lessThan, tryParse } from '@std/semver'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { lockBundleLifecycles, retryOnDeadlock, softDeleteLockedBundles } from '../../utils/bundle_soft_delete.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { beginWriteTransaction, checkoutPgClient, closeClient, getPgClient, logPgError, releasePgClient } from '../../utils/pg.ts'
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
  // Execute only these bundles (the ones the user confirmed from a dry run). Anything the
  // fresh plan would keep is still kept, so a concurrent upload cannot widen the deletion.
  // Not capped: ids outside the fresh plan are ignored, and the request body limit bounds it.
  ids: z.array(integerLikeSchema).optional(),
})

export type CleanupBundleBody = z.infer<typeof cleanupBundleBodySchema>

export interface CleanupBundleRow {
  id: number
  name: string
  created_at: string | null
  linked: boolean
}

export interface CleanupPlan {
  /** Active bundles of the app, placeholders excluded, before the `bundle` range filter. */
  active: number
  /** Bundles inside the cleanup scope (the `bundle` range when given). */
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
  const active = versions.filter(version => !RESERVED_BUNDLE_NAMES.has(version.name))
  let candidates = active

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

  return { active: active.length, total: candidates.length, kept, removed }
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

/**
 * Bundle ids targeted by a channel (`version` or `rollout_version`). Pages by last seen id so
 * a concurrently deleted channel cannot shift a later page and hide a link.
 */
async function fetchLinkedVersionIds(c: Context<MiddlewareKeyVariables>, apikey: Database['public']['Tables']['apikeys']['Row'], appId: string) {
  const supabase = supabaseApikey(c, apikey.key)
  const linked = new Set<number>()
  let lastId = 0
  while (true) {
    const { data, error } = await supabase
      .from('channels')
      .select('id, version, rollout_version')
      .eq('app_id', appId)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(SELECT_PAGE_SIZE)
    if (error)
      quickError(500, 'cannot_check_linked_channels', 'Cannot check linked channels', { supabaseError: error })
    for (const channel of data ?? []) {
      if (typeof channel.version === 'number')
        linked.add(channel.version)
      if (typeof channel.rollout_version === 'number')
        linked.add(channel.rollout_version)
    }
    if (!data || data.length < SELECT_PAGE_SIZE)
      return linked
    lastId = data[data.length - 1].id
  }
}

/**
 * Soft-deletes one batch in a single transaction. Each bundle's lifecycle lock (taken through
 * `lock_channel_bundle_lifecycle`, like channel promotion) is held while the channel links
 * are checked and the rows updated, so a concurrent promotion either commits first and keeps
 * its bundle, or waits and then sees it deleted. With `ignoreChannel`, linked bundles are
 * deleted too and the unlink_channels_from_deleted_version trigger clears their links.
 */
async function softDeleteBatch(
  c: Context<MiddlewareKeyVariables>,
  pgClient: Awaited<ReturnType<typeof getPgClient>>,
  effectiveApikey: string,
  appId: string,
  ids: number[],
  ignoreChannel: boolean,
): Promise<number[]> {
  let dbClient: Awaited<ReturnType<typeof checkoutPgClient>> | null = null
  let transactionStarted = false
  try {
    dbClient = await checkoutPgClient(pgClient)
    await beginWriteTransaction(dbClient)
    transactionStarted = true
    await lockBundleLifecycles(dbClient, ids)
    const deleted = await softDeleteLockedBundles(dbClient, effectiveApikey, appId, ids, ignoreChannel)
    await dbClient.query('COMMIT')
    return deleted
  }
  catch (error) {
    if (dbClient && transactionStarted) {
      try {
        await dbClient.query('ROLLBACK')
      }
      catch {
        // Preserve the original error when rollback itself fails.
      }
    }
    if (error instanceof HTTPException)
      throw error
    logPgError(c, 'cleanup_bundles_soft_delete', error)
    throw error
  }
  finally {
    releasePgClient(pgClient, dbClient)
  }
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
  if (body.ids) {
    const confirmed = new Set(body.ids)
    plan.kept.push(...plan.removed.filter(row => !confirmed.has(row.id)))
    plan.removed = plan.removed.filter(row => confirmed.has(row.id))
  }

  if (body.dry_run === true || !plan.removed.length)
    return c.json({ ...plan, dry_run: body.dry_run === true })

  const effectiveApikey = apikey.key ?? c.get('capgkey')
  if (!effectiveApikey)
    throw simpleError('cannot_delete_bundle', 'You can\'t access this app', { app_id: body.app_id })

  // Soft-delete in batches, each its own locked transaction (see softDeleteBatch), sharing
  // one connection pool.
  const removedIds = new Set<number>()
  const pgClient = await getPgClient(c)
  try {
    for (let i = 0; i < plan.removed.length; i += DELETE_BATCH_SIZE) {
      const ids = plan.removed.slice(i, i + DELETE_BATCH_SIZE).map(row => row.id)
      let deleted: number[]
      try {
        // With ignore_channel, the unlink trigger locks channel rows after the bundle locks and can
        // deadlock with a promotion; a batch is its own transaction, so retrying it is safe.
        deleted = await retryOnDeadlock(() => softDeleteBatch(c, pgClient, effectiveApikey, body.app_id, ids, ignoreChannel))
      }
      catch (error) {
        if (error instanceof HTTPException)
          throw error
        quickError(500, 'cannot_delete_version', 'Cannot delete bundles', { error: (error as Error)?.message, removed_ids: [...removedIds] })
      }
      for (const id of deleted)
        removedIds.add(id)
    }
  }
  finally {
    await closeClient(c, pgClient)
  }

  const removed = plan.removed.filter(row => removedIds.has(row.id))
  const skipped = plan.removed.filter(row => !removedIds.has(row.id))
  return c.json({ active: plan.active, total: plan.total, kept: [...plan.kept, ...skipped], removed, dry_run: false })
}
