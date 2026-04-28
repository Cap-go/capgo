import type { Options } from '../api/app'
import { intro, log, outro } from '@clack/prompts'
import { createSupabaseClient, findSavedKey, formatError, verifyUser } from '../utils'

export async function getUserIdInternal(options: Options, silent = false) {
  if (!silent)
    intro('Getting user id')

  const enrichedOptions: Options = {
    ...options,
    apikey: options.apikey || findSavedKey(),
  }

  if (!enrichedOptions.apikey) {
    if (!silent)
      log.error('Missing API key, you need to provide an API key to fetch the user id')
    throw new Error('Missing API key')
  }

  try {
    const supabase = await createSupabaseClient(
      enrichedOptions.apikey,
      enrichedOptions.supaHost,
      enrichedOptions.supaAnon,
    )
    const userId = await verifyUser(supabase, enrichedOptions.apikey, ['read', 'all', 'write'])

    if (!silent)
      outro(`Done ✅: ${userId}`)

    return userId
  }
  catch (error) {
    if (!silent)
      log.error(`Error getting user id ${formatError(error)}`)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export async function getUserId(options: Options) {
  await getUserIdInternal(options, false)
}
