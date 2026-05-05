import type { Buffer } from 'node:buffer'
import type { Options } from '../api/app'
import { existsSync, readFileSync } from 'node:fs'
import { intro, log, outro } from '@clack/prompts'
import { checkAppExistsAndHasPermissionOrgErr, defaultAppIconPath, getAppIconStoragePath, newIconPath } from '../api/app'
import {
  createSupabaseClient,
  findSavedKey,
  formatError,
  getAppId,
  getConfig,
  getContentType,
  getOrganizationId,
  OrganizationPerm,
  sendEvent,
} from '../utils'

export async function setAppInternal(appId: string, options: Options, silent = false) {
  if (!silent)
    intro('Set app')

  options.apikey = options.apikey || findSavedKey()
  const extConfig = await getConfig()
  appId = getAppId(appId, extConfig?.config)

  if (!options.apikey) {
    if (!silent)
      log.error('Missing API key, you need to provide an API key to upload your bundle')
    throw new Error('Missing API key')
  }

  if (!appId) {
    if (!silent)
      log.error('Missing argument, you need to provide a appId, or be in a capacitor project')
    throw new Error('Missing appId')
  }

  const supabase = await createSupabaseClient(options.apikey, options.supaHost, options.supaAnon)
  await checkAppExistsAndHasPermissionOrgErr(supabase, options.apikey, appId, OrganizationPerm.admin, silent)
  const organizationUid = await getOrganizationId(supabase, appId)

  const { name, icon, retention, exposeMetadata } = options

  if (retention && Number.isNaN(Number(retention))) {
    if (!silent)
      log.error('retention value must be a number')
    throw new Error('Retention value must be a number')
  }
  else if (retention && retention < 0) {
    if (!silent)
      log.error('retention value cannot be less than 0')
    throw new Error('Retention value cannot be less than 0')
  }
  else if (retention && retention >= 63113904) {
    if (!silent)
      log.error('retention value cannot be greater than 63113904 seconds (2 years)')
    throw new Error('Retention value cannot be greater than 63113904 seconds (2 years)')
  }

  let iconBuff: Buffer | undefined
  let iconType: string | undefined
  const iconPath = getAppIconStoragePath(organizationUid, appId)
  let iconUrl: string | undefined = defaultAppIconPath

  if (icon && existsSync(icon)) {
    iconBuff = readFileSync(icon)
    const contentType = getContentType(icon)
    iconType = contentType || 'image/png'
    if (!silent)
      log.warn(`Found app icon ${icon}`)
  }
  else if (existsSync(newIconPath)) {
    iconBuff = readFileSync(newIconPath)
    const contentType = getContentType(newIconPath)
    iconType = contentType || 'image/png'
    if (!silent)
      log.warn(`Found app icon ${newIconPath}`)
  }
  else if (!silent) {
    log.warn(`Cannot find app icon in any of the following locations: ${icon}, ${newIconPath}`)
  }

  if (iconBuff && iconType) {
    const { error } = await supabase.storage
      .from('images')
      .upload(iconPath, iconBuff, {
        contentType: iconType,
        upsert: true,
      })

    if (error) {
      if (!silent)
        log.error(`Could not set app ${formatError(error)}`)
      throw new Error(`Could not set app: ${formatError(error)}`)
    }

    iconUrl = iconPath
  }

  const { error: dbError } = await supabase
    .from('apps')
    .update({
      icon_url: iconUrl,
      name,
      retention: !retention ? undefined : retention * 24 * 60 * 60,
      expose_metadata: exposeMetadata,
    })
    .eq('app_id', appId)

  if (dbError) {
    if (!silent)
      log.error(`Could not set app ${formatError(dbError)}`)
    throw new Error(`Could not set app: ${formatError(dbError)}`)
  }

  await sendEvent(options.apikey, {
    channel: 'app',
    event: 'App Updated',
    icon: '📝',
    user_id: organizationUid,
    tags: { 'app-id': appId },
    notify: false,
    notifyConsole: true,
  }).catch(() => {})

  if (!silent)
    outro('Done ✅')

  return true
}

export async function setApp(appId: string, options: Options) {
  return setAppInternal(appId, options)
}
