import type { SupabaseClient } from '@supabase/supabase-js'
import type { OptionsBase } from '../schemas/base'
import type { Database } from '../types/supabase.types'
import { intro, log, outro } from '@clack/prompts'
import { Table } from '@sauber/table'
import { checkAlerts } from '../api/update'
import { createSupabaseClient, findSavedKey, getHumanDate, verifyUser } from '../utils'

function displayApps(data: Database['public']['Tables']['apps']['Row'][]) {
  const table = new Table()
  table.headers = ['Name', 'id', 'Created']
  table.rows = []

  for (const row of data.toReversed())
    table.rows.push([row.name ?? '', row.app_id, getHumanDate(row.created_at)])

  log.success('Apps')
  log.success(table.toString())
}

async function getActiveApps(
  supabase: SupabaseClient<Database>,
  silent: boolean,
) {
  const { data, error: vError } = await supabase
    .from('apps')
    .select()
    .order('created_at', { ascending: false })

  if (vError) {
    if (!silent)
      log.error('Apps not found')
    throw new Error('Apps not found')
  }

  return data ?? []
}

export async function listAppInternal(options: OptionsBase, silent = false) {
  if (!silent)
    intro('List apps in Capgo')

  await checkAlerts()

  options.apikey = options.apikey || findSavedKey()

  const supabase = await createSupabaseClient(options.apikey, options.supaHost, options.supaAnon)

  await verifyUser(supabase, options.apikey, ['write', 'all', 'read', 'upload'])

  if (!silent)
    log.info('Getting active bundle in Capgo')

  const allApps = await getActiveApps(supabase, silent)

  if (!allApps.length) {
    if (!silent)
      log.error('No apps found')
    throw new Error('No apps found')
  }

  if (!silent) {
    log.info(`Active app in Capgo: ${allApps.length}`)
    displayApps(allApps)
    outro('Done ✅')
  }

  return allApps
}

export async function listApp(options: OptionsBase) {
  return listAppInternal(options, false)
}
