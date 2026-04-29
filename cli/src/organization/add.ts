import type { OrganizationAddOptions } from '../schemas/organization'
import { intro, isCancel, log, outro, text } from '@clack/prompts'
import { checkAlerts } from '../api/update'
import {
  createSupabaseClient,
  findSavedKey,
  formatError,
  sendEvent,
  verifyUser,
} from '../utils'

export async function addOrganizationInternal(options: OrganizationAddOptions, silent = false) {
  if (!silent)
    intro('Adding organization')

  await checkAlerts()

  const enrichedOptions: OrganizationAddOptions = {
    ...options,
    apikey: options.apikey || findSavedKey(),
  }

  if (!enrichedOptions.apikey) {
    if (!silent)
      log.error('Missing API key, you need to provide an API key to add an organization')
    throw new Error('Missing API key')
  }

  const supabase = await createSupabaseClient(
    enrichedOptions.apikey,
    enrichedOptions.supaHost,
    enrichedOptions.supaAnon,
  )
  const userId = await verifyUser(supabase, enrichedOptions.apikey, ['write', 'all'])

  let { name, email } = enrichedOptions

  if (!silent && !name) {
    const nameInput = await text({
      message: 'Organization name:',
      placeholder: 'My Organization',
    })

    if (isCancel(nameInput)) {
      log.error('Canceled adding organization')
      throw new Error('Organization creation cancelled')
    }
    name = nameInput as string
  }

  if (!silent && !email) {
    const emailInput = await text({
      message: 'Management email:',
      placeholder: 'admin@example.com',
    })

    if (isCancel(emailInput)) {
      log.error('Canceled adding organization')
      throw new Error('Organization creation cancelled')
    }
    email = emailInput as string
  }

  if (!name || !email) {
    if (!silent)
      log.error('Missing arguments, you need to provide an organization name and management email')
    throw new Error('Missing organization name or management email')
  }

  if (!silent)
    log.info(`Adding organization "${name}" to Capgo`)

  const { data: orgData, error: dbError } = await supabase
    .from('orgs')
    .insert({
      name,
      management_email: email,
      created_by: userId,
    })
    .select()
    .single()

  if (dbError) {
    if (!silent)
      log.error(`Could not add organization ${formatError(dbError)}`)
    throw new Error(`Could not add organization: ${formatError(dbError)}`)
  }

  await sendEvent(enrichedOptions.apikey, {
    channel: 'organization',
    event: 'Organization Created',
    icon: '🏢',
    user_id: orgData.id,
    tags: {
      'org-name': name,
    },
    notify: false,
  }).catch(() => {})

  if (!silent) {
    log.success(`Organization "${name}" added to Capgo`)
    outro('Done ✅')
  }

  return orgData
}

export async function addOrganization(options: OrganizationAddOptions) {
  await addOrganizationInternal(options, false)
}
