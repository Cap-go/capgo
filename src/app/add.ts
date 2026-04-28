import type { SupabaseClient } from '@supabase/supabase-js'
import type { Buffer } from 'node:buffer'
import type { AppOptions } from '../schemas/app'
import type { Database } from '../types/supabase.types'
import type { Organization } from '../utils'
import { existsSync, readFileSync } from 'node:fs'
import { intro, log, outro } from '@clack/prompts'
import { checkAppExists, defaultAppIconPath, getAppIconStoragePath, newIconPath } from '../api/app'
import { checkAlerts } from '../api/update'
import {
  createSupabaseClient,
  findSavedKey,
  formatError,
  getAppId,
  getConfig,
  getContentType,
  getOrganization,
  sendEvent,
  verifyUser,
} from '../utils'

export const reverseDomainRegex = /^[a-z0-9]+(\.[\w-]+)+$/i

function ensureOptions(appId: string, options: AppOptions, silent: boolean) {
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

  if (appId.includes('--')) {
    if (!silent)
      log.error('The app id includes illegal symbols. You cannot use "--" in the app id')
    throw new Error('App id includes illegal symbols')
  }

  if (!reverseDomainRegex.test(appId)) {
    if (!silent) {
      log.error(`Invalid app ID format: "${appId}"`)
      log.info('App ID must be in reverse domain notation (e.g., com.example.app)')
      log.info('Valid format: lowercase letters, numbers, dots, hyphens, and underscores')
      log.info('Examples: com.mycompany.myapp, io.capgo.app, com.example.my-app')
    }
    throw new Error('Invalid app ID format')
  }
}

async function ensureAppDoesNotExist(
  supabase: SupabaseClient<Database>,
  appId: string,
  silent: boolean,
) {
  const appExist = await checkAppExists(supabase, appId)
  if (!appExist)
    return

  if (appId === 'io.ionic.starter') {
    if (!silent)
      log.error(`This appId ${appId} cannot be used it's reserved, please change it in your capacitor config.`)
    throw new Error('Reserved appId, please change it in capacitor config')
  }

  if (!silent)
    log.error(`App ${appId} already exist`)
  throw new Error(`App ${appId} already exists`)
}

export async function addAppInternal(
  initialAppId: string,
  options: AppOptions,
  organization?: Organization,
  silent = false,
) {
  if (!silent)
    intro('Adding')

  if (!silent)
    await checkAlerts()

  options.apikey = options.apikey || findSavedKey()
  const extConfig = await getConfig()
  const appId = getAppId(initialAppId, extConfig?.config)

  ensureOptions(appId, options, silent)

  const supabase = await createSupabaseClient(options.apikey!, options.supaHost, options.supaAnon)
  const userId = await verifyUser(supabase, options.apikey!, ['write', 'all'])

  await ensureAppDoesNotExist(supabase, appId, silent)

  if (!organization)
    organization = await getOrganization(supabase, ['admin', 'super_admin'])

  const organizationUid = organization.gid

  let { name, icon } = options
  name = name || extConfig.config?.appName || 'Unknown'
  icon = icon || 'resources/icon.png'

  if (!icon || !name) {
    if (!silent)
      log.error('Missing argument, you need to provide a appId and a name, or be in a capacitor project')
    throw new Error('Missing app name or icon path')
  }

  if (!silent)
    log.info(`Adding ${appId} to Capgo`)

  let iconBuff: Buffer | null = null
  let iconType: string | null = null

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

  const iconPath = getAppIconStoragePath(organizationUid, appId)
  let iconUrl = defaultAppIconPath

  if (iconBuff && iconType) {
    const { error } = await supabase.storage
      .from('images')
      .upload(iconPath, iconBuff, {
        contentType: iconType,
        upsert: true,
      })

    if (error) {
      if (!silent)
        log.error(`Could not add app ${formatError(error)}`)
      throw new Error(`Could not add app ${formatError(error)}`)
    }

    iconUrl = iconPath
  }

  const { error: dbError } = await supabase
    .from('apps')
    .insert({
      icon_url: iconUrl,
      owner_org: organizationUid,
      user_id: userId,
      name,
      app_id: appId,
    })

  if (dbError) {
    if (!silent)
      log.error(`Could not add app ${formatError(dbError)}`)
    throw new Error(`Could not add app ${formatError(dbError)}`)
  }

  await sendEvent(options.apikey!, {
    channel: 'app',
    event: 'App Created',
    icon: '🆕',
    user_id: organizationUid,
    tags: { 'app-id': appId },
    notify: false,
    notifyConsole: true,
  }).catch(() => {})

  if (!silent) {
    log.success(`App ${appId} added to Capgo`)
    log.info(`This app is accessible to all members of your organization based on their permissions`)
    log.info(`Next step: upload a bundle with "npx @capgo/cli bundle upload ${appId}"`)
    outro('Done ✅')
  }

  return {
    appId,
    organizationUid,
    userId,
    name,
    iconUrl,
    signedURL: iconUrl,
  }
}

export async function addApp(appId: string, options: AppOptions) {
  await addAppInternal(appId, options, undefined)
}
