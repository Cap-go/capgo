import type { OrganizationDeleteOptions } from '../schemas/organization'
import { confirm as confirmC, intro, isCancel, log, outro, select } from '@clack/prompts'
import { checkAlerts } from '../api/update'
import {
  check2FAAccessForOrg,
  createSupabaseClient,
  findSavedKey,
  formatError,
  sendEvent,
  verifyUser,
} from '../utils'

export async function deleteOrganizationInternal(
  orgId: string,
  options: OrganizationDeleteOptions,
  silent = false,
) {
  if (!silent)
    intro('Deleting organization')

  await checkAlerts()

  const enrichedOptions: OrganizationDeleteOptions = {
    ...options,
    apikey: options.apikey || findSavedKey(),
  }

  if (!enrichedOptions.apikey) {
    if (!silent)
      log.error('Missing API key, you need to provide an API key to delete an organization')
    throw new Error('Missing API key')
  }

  if (!orgId) {
    if (!silent)
      log.error('Missing argument, you need to provide an organization ID')
    throw new Error('Missing organization id')
  }

  const supabase = await createSupabaseClient(
    enrichedOptions.apikey,
    enrichedOptions.supaHost,
    enrichedOptions.supaAnon,
  )
  const userId = await verifyUser(supabase, enrichedOptions.apikey, ['write', 'all'])

  await check2FAAccessForOrg(supabase, orgId, silent)

  const { data: orgData, error: orgError } = await supabase
    .from('orgs')
    .select('created_by, name')
    .eq('id', orgId)
    .single()

  if (orgError || !orgData) {
    if (!silent)
      log.error(`Cannot get organization details ${formatError(orgError)}`)
    throw new Error(`Cannot get organization details: ${formatError(orgError)}`)
  }

  if (orgData.created_by !== userId) {
    if (silent)
      throw new Error('Deleting an organization is restricted to the organization owner')

    log.warn('Deleting an organization is restricted to the organization owner')
    log.warn('You are not the owner of this organization')
    log.warn('It\'s strongly recommended that you do not continue!')

    const shouldContinue = await select({
      message: 'Do you want to continue?',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    })

    if (isCancel(shouldContinue) || shouldContinue === 'no') {
      log.error('Canceled deleting the organization')
      throw new Error('Organization deletion cancelled')
    }
  }

  if (!silent && !enrichedOptions.autoConfirm) {
    const confirmDelete = await confirmC({
      message: `Are you sure you want to delete organization "${orgData.name}"? This action cannot be undone.`,
    })

    if (isCancel(confirmDelete) || !confirmDelete) {
      log.error('Canceled deleting the organization')
      throw new Error('Organization deletion cancelled')
    }
  }

  if (!silent)
    log.info(`Deleting organization "${orgData.name}"`)

  const { error: dbError } = await supabase
    .from('orgs')
    .delete()
    .eq('id', orgId)

  if (dbError) {
    if (!silent)
      log.error(`Could not delete organization ${formatError(dbError)}`)
    throw new Error(`Could not delete organization: ${formatError(dbError)}`)
  }

  await sendEvent(enrichedOptions.apikey, {
    channel: 'organization',
    event: 'Organization Deleted',
    icon: '🗑️',
    user_id: orgId,
    tags: {
      'org-name': orgData.name,
    },
    notify: false,
  }).catch(() => {})

  if (!silent) {
    log.success(`Organization "${orgData.name}" deleted from Capgo`)
    outro('Done ✅')
  }

  return true
}

export async function deleteOrganization(orgId: string, options: OrganizationDeleteOptions) {
  await deleteOrganizationInternal(orgId, options, false)
}
